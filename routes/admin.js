const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const storage = require('../services/storage');
const config = require('../config/constants');
const { requireAdmin } = require('../middlewares/auth');

// Cấu hình Multer lưu file upload
const storageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeName}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage: storageEngine,
  limits: { fileSize: 100 * 1024 * 1024 } // Tối đa 100MB cho file upload cục bộ
});

// Helper định dạng kích thước file
function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * 1. Đăng nhập Admin
 */
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const settings = await storage.getSettings();
    const adminPassword = settings.adminPassword || config.ADMIN_PASSWORD;

    if (!password || password !== adminPassword) {
      return res.status(401).json({
        success: false,
        message: 'Mật khẩu quản trị viên không chính xác!'
      });
    }

    const token = jwt.sign(
      { role: 'admin', loggedInAt: Date.now() },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: config.IS_PRODUCTION,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    res.json({
      success: true,
      token,
      message: 'Đăng nhập thành công!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 2. Đăng xuất Admin
 */
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true, message: 'Đã đăng xuất!' });
});

/**
 * 3. Kiểm tra trạng thái đăng nhập
 */
router.get('/me', requireAdmin, (req, res) => {
  res.json({ success: true, role: 'admin' });
});

/**
 * 4. Thống kê tổng quan
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await storage.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 5. Quản lý Files - Danh sách
 */
router.get('/files', requireAdmin, async (req, res) => {
  try {
    const files = await storage.getFiles();
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 6. Quản lý Files - Thêm mới (Upload hoặc Dán Link)
 */
router.post('/files', requireAdmin, upload.single('fileUpload'), async (req, res) => {
  try {
    const {
      title,
      description,
      version,
      category,
      requiresLink4m,
      fileType,
      downloadUrl,
      fileSize
    } = req.body;

    let computedSize = fileSize || '0 MB';
    let localPath = '';
    let isDirectUrl = fileType === 'DIRECT_URL';

    // Nếu người dùng chọn upload file trực tiếp
    if (req.file) {
      localPath = req.file.path;
      computedSize = formatBytes(req.file.size);
      isDirectUrl = false;
    }

    const newFile = await storage.addFile({
      title: title || 'Tệp tin mới',
      description: description || '',
      version: version || 'v1.0',
      category: category || 'General',
      fileSize: computedSize,
      requiresLink4m: requiresLink4m === 'true' || requiresLink4m === true,
      fileType: isDirectUrl ? 'DIRECT_URL' : 'LOCAL',
      downloadUrl: downloadUrl || '',
      filePath: localPath
    });

    res.json({ success: true, file: newFile, message: 'Thêm file thành công!' });
  } catch (err) {
    console.error('File add error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 7. Quản lý Files - Cập nhật
 */
router.put('/files/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await storage.updateFile(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file!' });
    }
    res.json({ success: true, file: updated, message: 'Cập nhật thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 8. Quản lý Files - Xóa
 */
router.delete('/files/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await storage.deleteFile(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy file để xóa!' });
    }
    res.json({ success: true, message: 'Đã xóa file thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 9. Quản lý Keys - Lấy danh sách
 */
router.get('/keys', requireAdmin, async (req, res) => {
  try {
    const keys = await storage.getKeys();
    res.json({ success: true, keys });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 10. Quản lý Keys - Thêm Keys (Bulk / Sinh ngẫu nhiên)
 */
router.post('/keys', requireAdmin, async (req, res) => {
  try {
    const { mode, keysText, durationHours = 24, note = '', count = 10, prefix = 'KEY' } = req.body;

    if (mode === 'bulk') {
      // Nhập danh sách key theo từng dòng
      if (!keysText) {
        return res.status(400).json({ success: false, message: 'Vui lòng dán danh sách key!' });
      }
      const lines = keysText.split('\n').map(l => l.trim()).filter(Boolean);
      const added = await storage.addKeysBulk(lines, durationHours, note);
      return res.json({
        success: true,
        count: added.length,
        message: `Đã thêm thành công ${added.length} keys vào kho!`
      });
    } else if (mode === 'generate') {
      // Tự động sinh hàng loạt key ngẫu nhiên
      const generatedKeys = [];
      const numToGen = Math.min(Math.max(parseInt(count, 10) || 10, 1), 200);

      for (let i = 0; i < numToGen; i++) {
        const rand = require('crypto').randomBytes(6).toString('hex').toUpperCase();
        generatedKeys.push(`${prefix.toUpperCase()}-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 12)}`);
      }

      const added = await storage.addKeysBulk(generatedKeys, durationHours, note || 'Auto-Generated Pool');
      return res.json({
        success: true,
        count: added.length,
        message: `Đã sinh tự động ${added.length} keys ngẫu nhiên!`
      });
    }

    res.status(400).json({ success: false, message: 'Chế độ tạo key không hợp lệ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 11. Quản lý Keys - Xóa Key
 */
router.delete('/keys/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await storage.deleteKey(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy key!' });
    }
    res.json({ success: true, message: 'Đã xóa key!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 12. Cấu hình & Anti-Bypass Settings - Lấy
 */
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const settings = await storage.getSettings();
    // Ẩn mật khẩu admin
    const safeSettings = { ...settings };
    delete safeSettings.adminPassword;
    res.json({ success: true, settings: safeSettings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 13. Cấu hình & Anti-Bypass Settings - Cập nhật
 */
router.post('/settings', requireAdmin, async (req, res) => {
  try {
    const {
      link4mApiKey,
      hmacSecret,
      minWaitSeconds,
      keyDurationHours,
      maxKeysPerIp,
      ipLimitHours,
      siteUrl,
      newAdminPassword
    } = req.body;

    const updates = {};
    if (link4mApiKey !== undefined) updates.link4mApiKey = link4mApiKey.trim();
    if (hmacSecret !== undefined && hmacSecret.trim()) updates.hmacSecret = hmacSecret.trim();
    if (minWaitSeconds !== undefined) updates.minWaitSeconds = Math.max(0, parseInt(minWaitSeconds, 10));
    if (keyDurationHours !== undefined) updates.keyDurationHours = Math.max(1, parseInt(keyDurationHours, 10));
    if (maxKeysPerIp !== undefined) updates.maxKeysPerIp = Math.max(1, parseInt(maxKeysPerIp, 10));
    if (ipLimitHours !== undefined) updates.ipLimitHours = Math.max(1, parseInt(ipLimitHours, 10));
    if (siteUrl !== undefined && siteUrl.trim()) updates.siteUrl = siteUrl.trim().replace(/\/+$/, '');
    if (newAdminPassword && newAdminPassword.trim().length >= 6) {
      updates.adminPassword = newAdminPassword.trim();
    }

    const updated = await storage.updateSettings(updates);
    const safeUpdated = { ...updated };
    delete safeUpdated.adminPassword;

    res.json({
      success: true,
      settings: safeUpdated,
      message: 'Đã lưu cấu hình thành công!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 13.1 Reset giới hạn IP
 */
router.post('/ip-claims/reset', requireAdmin, async (req, res) => {
  try {
    const { ip } = req.body;
    await storage.resetIpClaims(ip || null);
    res.json({ success: true, message: ip ? `Đã reset giới hạn cho IP ${ip}` : 'Đã reset toàn bộ giới hạn IP!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 14. Logs & Nhật ký Chặn Bypass
 */
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const logs = await storage.getLogs(150);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
