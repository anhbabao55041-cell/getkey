const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const storage = require('../services/storage');
const security = require('../services/security');
const link4m = require('../services/link4m');
const config = require('../config/constants');

// Helper lấy IP thật của client (hỗ trợ reverse proxy như Render / Cloudflare và chuẩn hóa localhost)
function getClientIp(req) {
  let ip = req.headers['cf-connecting-ip'] || 
           req.headers['x-forwarded-for'] || 
           req.socket.remoteAddress || 
           '127.0.0.1';
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  return ip;
}

/**
 * 1. Thông tin cấu hình công khai
 */
router.get('/info', async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const settings = await storage.getSettings();
    const availableKeys = await storage.getUnusedKeysCount();
    const ipCheck = await storage.checkIpLimit(clientIp);

    res.json({
      success: true,
      siteUrl: settings.siteUrl || config.SITE_URL,
      minWaitSeconds: Number(settings.minWaitSeconds) || config.MIN_WAIT_SECONDS,
      hasLink4mKey: Boolean(settings.link4mApiKey && settings.link4mApiKey.trim() !== ''),
      availableKeys,
      clientIp,
      maxKeysPerIp: ipCheck.max,
      ipClaimsToday: ipCheck.count,
      ipRemainingClaims: ipCheck.remaining,
      ipLimitReached: !ipCheck.allowed
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 2. Lấy danh sách file công khai
 */
router.get('/files', async (req, res) => {
  try {
    const files = await storage.getFiles();
    const publicFiles = files.map(f => ({
      id: f.id,
      title: f.title,
      description: f.description,
      version: f.version,
      fileSize: f.fileSize,
      category: f.category,
      downloadCount: f.downloadCount,
      requiresLink4m: f.requiresLink4m,
      createdAt: f.createdAt
    }));
    res.json({ success: true, files: publicFiles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 3. Khởi tạo phiên Get Key (Bước 1/2) hoặc Mở khóa File
 */
router.post('/session/create', async (req, res) => {
  try {
    const { type = 'KEY', targetFileId = null } = req.body;
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // KIỂM TRA SỐ LƯỢNG KEY CÒN LẠI TRONG KHO & GIỚI HẠN IP
    if (type === 'KEY') {
      const ipCheck = await storage.checkIpLimit(clientIp);
      if (!ipCheck.allowed) {
        return res.status(429).json({
          success: false,
          status: 'IP_LIMIT_REACHED',
          message: `Địa chỉ IP của bạn (${clientIp}) đã đạt giới hạn tối đa ${ipCheck.max} lần lấy key trong 24 giờ. Vui lòng quay lại sau!`
        });
      }

      const unusedCount = await storage.getUnusedKeysCount();
      if (unusedCount <= 0) {
        return res.status(400).json({
          success: false,
          status: 'OUT_OF_KEYS',
          message: 'Kho hiện tại đã hết key! Quản trị viên chưa nạp thêm key mới. Vui lòng quay lại sau.'
        });
      }
    }

    // Nếu là mở khóa file
    if (type === 'FILE') {
      if (!targetFileId) {
        return res.status(400).json({ success: false, message: 'Thiếu mã file cần tải!' });
      }
      const file = await storage.getFileById(targetFileId);
      if (!file) {
        return res.status(404).json({ success: false, message: 'File không tồn tại trên hệ thống!' });
      }
      return res.json({
        success: true,
        direct: true,
        downloadUrl: `/api/download/${file.id}`
      });
    }

    // Sinh Session và Chữ ký HMAC Bước 1/2
    const sessionToken = await security.generateSessionToken({
      type,
      targetFileId,
      step: 1,
      ip: clientIp,
      userAgent
    });

    const host = req.get('host') || '';
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const requestBaseUrl = `${protocol}://${host}`;
    const settings = await storage.getSettings();

    let baseUrl = requestBaseUrl;
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      baseUrl = requestBaseUrl;
    } else if (settings.siteUrl && !settings.siteUrl.includes('localhost')) {
      baseUrl = settings.siteUrl;
    }
    
    // Link đích bước 1
    const destinationUrl = `${baseUrl}/#verify?token=${encodeURIComponent(sessionToken.token)}&step=1`;
    const shortened = await link4m.shortenUrl(destinationUrl);

    res.json({
      success: true,
      sessionId: sessionToken.sessionId,
      shortUrl: shortened.shortenedUrl,
      isSimulated: shortened.isSimulated || false,
      step: 1,
      totalSteps: 2,
      type
    });
  } catch (err) {
    console.error('Session create error:', err);
    res.status(500).json({ success: false, message: 'Không thể tạo phiên xác thực: ' + err.message });
  }
});

/**
 * 3.1 Khởi tạo phiên Get Key Bước 2/2 (Sau khi đã xong Bước 1/2)
 */
router.post('/session/step2', async (req, res) => {
  try {
    const { step1Token } = req.body;
    if (!step1Token) {
      return res.status(400).json({ success: false, message: 'Thiếu mã xác thực Bước 1!' });
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // Kiểm tra tính hợp lệ của token Bước 1
    const verifyStep1 = await security.validateStep1Completion(step1Token, clientIp, userAgent);
    if (!verifyStep1.success) {
      return res.status(403).json({
        success: false,
        message: verifyStep1.message || 'Bước 1 chưa hoàn thành hoặc không hợp lệ!'
      });
    }

    // Kiểm tra giới hạn nhận key cho IP này
    const ipCheck = await storage.checkIpLimit(clientIp);
    if (!ipCheck.allowed) {
      return res.status(429).json({
        success: false,
        status: 'IP_LIMIT_REACHED',
        message: `Địa chỉ IP của bạn (${clientIp}) đã đạt giới hạn tối đa ${ipCheck.max} lần lấy key trong 24 giờ. Vui lòng quay lại sau!`
      });
    }

    // Kiểm tra kho còn key không
    const unusedCount = await storage.getUnusedKeysCount();
    if (unusedCount <= 0) {
      return res.status(400).json({
        success: false,
        status: 'OUT_OF_KEYS',
        message: 'Rất tiếc! Kho vừa hết key. Vui lòng quay lại sau.'
      });
    }

    // Tạo phiên Bước 2
    const sessionToken2 = await security.generateSessionToken({
      type: 'KEY',
      step: 2,
      parentSessionId: verifyStep1.session ? verifyStep1.session.id : null,
      ip: clientIp,
      userAgent
    });

    const host = req.get('host') || '';
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const requestBaseUrl = `${protocol}://${host}`;
    const settings = await storage.getSettings();

    let baseUrl = requestBaseUrl;
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      baseUrl = requestBaseUrl;
    } else if (settings.siteUrl && !settings.siteUrl.includes('localhost')) {
      baseUrl = settings.siteUrl;
    }

    // Link đích bước 2
    const destinationUrl = `${baseUrl}/#verify?token=${encodeURIComponent(sessionToken2.token)}&step=2`;
    const shortened = await link4m.shortenUrl(destinationUrl);

    res.json({
      success: true,
      sessionId: sessionToken2.sessionId,
      shortUrl: shortened.shortenedUrl,
      isSimulated: shortened.isSimulated || false,
      step: 2,
      totalSteps: 2
    });
  } catch (err) {
    console.error('Step 2 error:', err);
    res.status(500).json({ success: false, message: 'Lỗi khởi tạo Bước 2: ' + err.message });
  }
});

/**
 * 4. Xác thực Callback với chữ ký HMAC và kiểm tra Anti-Bypass
 */
router.get('/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({
        success: false,
        status: 'MISSING_TOKEN',
        message: 'Thiếu mã token xác thực!'
      });
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // Kiểm tra tính hợp lệ của token HMAC và thời gian hoàn thành (Anti-Bypass)
    const verification = await security.verifySessionToken(token, clientIp, userAgent);

    if (!verification.success) {
      return res.status(403).json(verification);
    }

    const session = verification.session;
    const settings = await storage.getSettings();
    const durationHours = settings.keyDurationHours || 24;

    // XỬ LÝ KHI VƯỢT LINK HỢP LỆ
    if (session.type === 'KEY') {
      // NẾU LÀ BƯỚC 1/2: TRẢ VỀ THÔNG BÁO HOÀN THÀNH BƯỚC 1
      if (verification.step === 1) {
        return res.json({
          success: true,
          type: 'KEY',
          step: 1,
          totalSteps: 2,
          status: 'STEP1_COMPLETED',
          step1Token: token,
          message: 'Chúc mừng! Bạn đã hoàn thành Bước 1/2 thành công. Hãy tiếp tục vượt Bước 2/2 để nhận mã Key!'
        });
      }

      // NẾU LÀ BƯỚC 2/2: KIỂM TRA GIỚI HẠN IP VÀ LẤY 1 KEY TỪ TRONG KHO
      const ipCheck = await storage.checkIpLimit(clientIp);
      if (!ipCheck.allowed) {
        return res.status(429).json({
          success: false,
          status: 'IP_LIMIT_REACHED',
          message: `Địa chỉ IP của bạn (${clientIp}) đã đạt giới hạn lấy key tối đa ${ipCheck.max} lần trong 24 giờ. Vui lòng quay lại sau!`
        });
      }

      const keyObj = await storage.claimKeyFromPool(clientIp, durationHours);
      if (!keyObj) {
        return res.status(400).json({
          success: false,
          status: 'OUT_OF_KEYS',
          message: 'Rất tiếc! Kho hiện tại vừa hết key. Phiên của bạn đã được ghi nhận, vui lòng liên hệ Admin nạp thêm key.'
        });
      }

      return res.json({
        success: true,
        type: 'KEY',
        step: 2,
        totalSteps: 2,
        status: 'SUCCESS',
        key: keyObj.key,
        durationHours: keyObj.durationHours,
        expiresAt: keyObj.expiresAt,
        message: 'Xuất sắc! Bạn đã hoàn thành cả 2 bước vượt link và nhận key kích hoạt thành công.'
      });
    } else if (session.type === 'FILE') {
      const file = await storage.getFileById(session.targetFileId);
      if (!file) {
        return res.status(404).json({ success: false, message: 'File đã bị xóa khỏi hệ thống!' });
      }
      return res.json({
        success: true,
        type: 'FILE',
        status: 'SUCCESS',
        fileTitle: file.title,
        downloadUrl: `/api/download/${file.id}`,
        message: 'Mở khóa file thành công!'
      });
    }

    res.json({ success: true, message: 'Xác thực thành công!' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ success: false, message: 'Lỗi xác thực hệ thống: ' + err.message });
  }
});

/**
 * 5. Tải file trực tiếp (Download - Không cần vượt link)
 */
router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await storage.getFileById(fileId);
    if (!file) {
      return res.status(404).send('File không tồn tại trên hệ thống!');
    }

    // Tăng lượt tải
    await storage.incrementDownload(file.id);

    // Xử lý gửi file trực tiếp (Redirect link ngoài hoặc gửi file máy chủ)
    if (file.fileType === 'DIRECT_URL' && file.downloadUrl) {
      return res.redirect(file.downloadUrl);
    } else if (file.filePath && fs.existsSync(file.filePath)) {
      return res.download(file.filePath, path.basename(file.filePath));
    } else if (file.downloadUrl) {
      return res.redirect(file.downloadUrl);
    } else {
      return res.status(404).send('Không tìm thấy nguồn file tải!');
    }
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Lỗi khi tải file: ' + err.message);
  }
});

/**
 * 6. Kiểm tra trạng thái Key
 */
router.post('/keys/check', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key || !key.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mã key cần kiểm tra!' });
    }

    const keyObj = await storage.findKeyByValue(key);
    if (!keyObj) {
      return res.json({
        success: true,
        found: false,
        message: 'Khóa không tồn tại trong hệ thống!'
      });
    }

    let isExpired = false;
    let remainingMinutes = 0;

    if (keyObj.expiresAt) {
      const diffMs = new Date(keyObj.expiresAt).getTime() - Date.now();
      if (diffMs <= 0) {
        isExpired = true;
      } else {
        remainingMinutes = Math.round(diffMs / (60 * 1000));
      }
    }

    res.json({
      success: true,
      found: true,
      key: keyObj.key,
      status: isExpired ? 'EXPIRED' : keyObj.status,
      durationHours: keyObj.durationHours,
      expiresAt: keyObj.expiresAt,
      claimedAt: keyObj.claimedAt,
      remainingMinutes: isExpired ? 0 : remainingMinutes,
      isExpired
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
