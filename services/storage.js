const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/constants');

// Đảm bảo thư mục data/ tồn tại
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}
if (!fs.existsSync(config.UPLOAD_DIR)) {
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
}

// Đường dẫn các file JSON
const FILES_DB_PATH = path.join(config.DATA_DIR, 'files.json');
const KEYS_DB_PATH = path.join(config.DATA_DIR, 'keys.json');
const SESSIONS_DB_PATH = path.join(config.DATA_DIR, 'sessions.json');
const LOGS_DB_PATH = path.join(config.DATA_DIR, 'logs.json');
const SETTINGS_DB_PATH = path.join(config.DATA_DIR, 'settings.json');
const IP_CLAIMS_DB_PATH = path.join(config.DATA_DIR, 'ip_claims.json');

// Đọc an toàn từ file JSON
function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJson(filePath, defaultValue);
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return defaultValue;
  }
}

// Ghi an toàn (Atomic Write) tránh hỏng file khi crash
function writeJson(filePath, data) {
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  }
}

// Khởi tạo settings mặc định nếu chưa có
function initSettings() {
  const settings = readJson(SETTINGS_DB_PATH, {});
  let modified = false;
  if (!settings.hmacSecret) {
    settings.hmacSecret = config.HMAC_SECRET;
    modified = true;
  }
  if (!settings.minWaitSeconds) {
    settings.minWaitSeconds = config.MIN_WAIT_SECONDS;
    modified = true;
  }
  if (!settings.link4mApiKey || settings.link4mApiKey.trim() === '') {
    settings.link4mApiKey = config.LINK4M_API_KEY || '6a44cabb1c08580bcd40f8ce';
    modified = true;
  }
  if (!settings.keyDurationHours) {
    settings.keyDurationHours = 24; // 24 giờ mặc định
    modified = true;
  }
  if (!settings.siteUrl) {
    settings.siteUrl = config.SITE_URL;
    modified = true;
  }
  if (settings.maxKeysPerIp === undefined) {
    settings.maxKeysPerIp = 2; // Tối đa 2 lần 1 IP
    modified = true;
  }
  if (settings.ipLimitHours === undefined) {
    settings.ipLimitHours = 24; // Trong vòng 24 giờ
    modified = true;
  }
  if (modified) {
    writeJson(SETTINGS_DB_PATH, settings);
  }
  return settings;
}

// Tự động khởi tạo dữ liệu mẫu nếu database trống
function seedInitialData() {
  const files = readJson(FILES_DB_PATH, []);
  if (files.length === 0) {
    const sampleFiles = [
      {
        id: 'file-sample-01',
        title: 'Tool Auto Farm VIP v2.5',
        description: 'Tập lệnh tối ưu hóa hiệu năng cao, tự động thu thập tài nguyên và vượt ải.',
        version: 'v2.5.0',
        fileSize: '15.4 MB',
        category: 'Scripts',
        downloadCount: 42,
        requiresLink4m: true,
        fileType: 'DIRECT_URL',
        downloadUrl: 'https://github.com',
        filePath: '',
        createdAt: new Date().toISOString()
      },
      {
        id: 'file-sample-02',
        title: 'Bản Cài Đặt Android Mod Menu',
        description: 'Bản APK Mod Menu đầy đủ tính năng, cài đặt trực tiếp không cần root.',
        version: 'v1.8.2',
        fileSize: '48.2 MB',
        category: 'APK Android',
        downloadCount: 128,
        requiresLink4m: false,
        fileType: 'DIRECT_URL',
        downloadUrl: 'https://github.com',
        filePath: '',
        createdAt: new Date().toISOString()
      }
    ];
    writeJson(FILES_DB_PATH, sampleFiles);
  }

  const keys = readJson(KEYS_DB_PATH, []);
  if (keys.length === 0) {
    const sampleKeys = [
      {
        id: 'key-sample-01',
        key: 'KEY-FREE-2026-ABCD-1111',
        status: 'UNUSED',
        durationHours: 24,
        claimedAt: null,
        expiresAt: null,
        claimedByIp: null,
        note: 'Key mẫu dùng thử 1',
        createdAt: new Date().toISOString()
      },
      {
        id: 'key-sample-02',
        key: 'KEY-FREE-2026-EFGH-2222',
        status: 'UNUSED',
        durationHours: 24,
        claimedAt: null,
        expiresAt: null,
        claimedByIp: null,
        note: 'Key mẫu dùng thử 2',
        createdAt: new Date().toISOString()
      }
    ];
    writeJson(KEYS_DB_PATH, sampleKeys);
  }
}

// Khởi tạo
initSettings();
seedInitialData();

class StorageService {
  // SETTINGS
  async getSettings() {
    return readJson(SETTINGS_DB_PATH, {
      hmacSecret: config.HMAC_SECRET,
      link4mApiKey: config.LINK4M_API_KEY,
      minWaitSeconds: config.MIN_WAIT_SECONDS,
      keyDurationHours: 24,
      siteUrl: config.SITE_URL
    });
  }

  async updateSettings(updates) {
    const current = await this.getSettings();
    const updated = { ...current, ...updates };
    writeJson(SETTINGS_DB_PATH, updated);
    return updated;
  }

  // FILES
  async getFiles() {
    return readJson(FILES_DB_PATH, []);
  }

  async getFileById(id) {
    const files = await this.getFiles();
    return files.find(f => f.id === id) || null;
  }

  async addFile(fileData) {
    const files = await this.getFiles();
    const newFile = {
      id: fileData.id || `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      title: fileData.title || 'Untitled File',
      description: fileData.description || '',
      version: fileData.version || 'v1.0.0',
      fileSize: fileData.fileSize || 'N/A',
      category: fileData.category || 'General',
      downloadCount: 0,
      requiresLink4m: false,
      fileType: fileData.fileType || 'DIRECT_URL',
      downloadUrl: fileData.downloadUrl || '',
      filePath: fileData.filePath || '',
      createdAt: new Date().toISOString()
    };
    files.unshift(newFile);
    writeJson(FILES_DB_PATH, files);
    return newFile;
  }

  async updateFile(id, updateData) {
    const files = await this.getFiles();
    const index = files.findIndex(f => f.id === id);
    if (index === -1) return null;
    files[index] = { ...files[index], ...updateData };
    writeJson(FILES_DB_PATH, files);
    return files[index];
  }

  async deleteFile(id) {
    const files = await this.getFiles();
    const index = files.findIndex(f => f.id === id);
    if (index === -1) return false;
    const removed = files.splice(index, 1)[0];
    writeJson(FILES_DB_PATH, files);
    // Nếu có file cục bộ thì xóa file
    if (removed.filePath && fs.existsSync(removed.filePath)) {
      try { fs.unlinkSync(removed.filePath); } catch (_) {}
    }
    return true;
  }

  async incrementDownload(id) {
    const files = await this.getFiles();
    const file = files.find(f => f.id === id);
    if (file) {
      file.downloadCount = (file.downloadCount || 0) + 1;
      writeJson(FILES_DB_PATH, files);
      return file.downloadCount;
    }
    return 0;
  }

  // KEYS
  async getKeys() {
    return readJson(KEYS_DB_PATH, []);
  }

  async getKeyById(id) {
    const keys = await this.getKeys();
    return keys.find(k => k.id === id) || null;
  }

  async findKeyByValue(keyValue) {
    const keys = await this.getKeys();
    return keys.find(k => k.key.trim().toLowerCase() === keyValue.trim().toLowerCase()) || null;
  }

  async addKey(keyData) {
    const keys = await this.getKeys();
    const newKey = {
      id: keyData.id || `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      key: keyData.key.trim(),
      status: keyData.status || 'UNUSED',
      durationHours: Number(keyData.durationHours) || 24,
      claimedAt: keyData.claimedAt || null,
      expiresAt: keyData.expiresAt || null,
      claimedByIp: keyData.claimedByIp || null,
      note: keyData.note || '',
      createdAt: new Date().toISOString()
    };
    keys.unshift(newKey);
    writeJson(KEYS_DB_PATH, keys);
    return newKey;
  }

  async addKeysBulk(keysArray, durationHours = 24, note = '') {
    const keys = await this.getKeys();
    const added = [];
    const now = new Date().toISOString();

    for (const keyStr of keysArray) {
      const cleanKey = keyStr.trim();
      if (!cleanKey) continue;
      // Tránh trùng lặp
      if (keys.some(k => k.key === cleanKey)) continue;

      const newKey = {
        id: `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        key: cleanKey,
        status: 'UNUSED',
        durationHours: Number(durationHours) || 24,
        claimedAt: null,
        expiresAt: null,
        claimedByIp: null,
        note: note || 'Bulk uploaded',
        createdAt: now
      };
      keys.unshift(newKey);
      added.push(newKey);
    }
    writeJson(KEYS_DB_PATH, keys);
    return added;
  }

  async deleteKey(id) {
    const keys = await this.getKeys();
    const index = keys.findIndex(k => k.id === id);
    if (index === -1) return false;
    keys.splice(index, 1);
    writeJson(KEYS_DB_PATH, keys);
    return true;
  }

  async getUnusedKeysCount() {
    const keys = await this.getKeys();
    return keys.filter(k => k.status === 'UNUSED').length;
  }

  normalizeIp(ip) {
    if (!ip) return '127.0.0.1';
    let cleanIp = String(ip).trim();
    if (cleanIp.includes(',')) {
      cleanIp = cleanIp.split(',')[0].trim();
    }
    if (cleanIp === '::1' || cleanIp === '::ffff:127.0.0.1') {
      cleanIp = '127.0.0.1';
    }
    return cleanIp;
  }

  getIpClaims(ip, windowHours = 24) {
    const cleanIp = this.normalizeIp(ip);
    const allClaims = readJson(IP_CLAIMS_DB_PATH, {});
    const now = Date.now();
    const cutoff = now - windowHours * 3600 * 1000;

    let claimsList = Array.isArray(allClaims[cleanIp]) ? allClaims[cleanIp] : [];
    claimsList = claimsList.filter(ts => ts > cutoff);

    // Bổ sung các claim từ keys.json nếu có
    const keys = readJson(KEYS_DB_PATH, []);
    keys.forEach(k => {
      if (k.claimedByIp && this.normalizeIp(k.claimedByIp) === cleanIp && k.claimedAt) {
        const keyClaimTs = new Date(k.claimedAt).getTime();
        if (keyClaimTs > cutoff && !claimsList.includes(keyClaimTs)) {
          claimsList.push(keyClaimTs);
        }
      }
    });

    claimsList.sort((a, b) => a - b);
    return claimsList;
  }

  async checkIpLimit(ip) {
    const settings = await this.getSettings();
    const maxKeys = settings.maxKeysPerIp !== undefined ? Number(settings.maxKeysPerIp) : 2;
    const windowHours = settings.ipLimitHours !== undefined ? Number(settings.ipLimitHours) : 24;

    const claims = this.getIpClaims(ip, windowHours);
    const count = claims.length;
    const allowed = count < maxKeys;
    const remaining = Math.max(0, maxKeys - count);

    return {
      allowed,
      count,
      max: maxKeys,
      remaining,
      windowHours
    };
  }

  async recordIpClaim(ip) {
    const cleanIp = this.normalizeIp(ip);
    const allClaims = readJson(IP_CLAIMS_DB_PATH, {});
    const now = Date.now();

    if (!Array.isArray(allClaims[cleanIp])) {
      allClaims[cleanIp] = [];
    }
    allClaims[cleanIp].push(now);

    // Dọn dẹp các mốc cũ hơn 48 giờ
    const cutoff48h = now - 48 * 3600 * 1000;
    for (const kIp in allClaims) {
      if (Array.isArray(allClaims[kIp])) {
        allClaims[kIp] = allClaims[kIp].filter(ts => ts > cutoff48h);
        if (allClaims[kIp].length === 0) {
          delete allClaims[kIp];
        }
      }
    }

    writeJson(IP_CLAIMS_DB_PATH, allClaims);
    return true;
  }

  async resetIpClaims(ip = null) {
    if (!ip) {
      writeJson(IP_CLAIMS_DB_PATH, {});
      return true;
    }
    const cleanIp = this.normalizeIp(ip);
    const allClaims = readJson(IP_CLAIMS_DB_PATH, {});
    delete allClaims[cleanIp];
    writeJson(IP_CLAIMS_DB_PATH, allClaims);
    return true;
  }

  async claimKeyFromPool(ip, defaultDurationHours = 24) {
    const keys = await this.getKeys();
    const now = new Date();
    const cleanIp = this.normalizeIp(ip);

    // Chỉ lấy key có sẵn trong kho UNUSED
    const unusedIndex = keys.findIndex(k => k.status === 'UNUSED');
    if (unusedIndex === -1) {
      return null; // Đã hết key trong kho
    }

    const keyObj = keys[unusedIndex];
    const hours = keyObj.durationHours || defaultDurationHours;
    const expiresAt = new Date(now.getTime() + hours * 3600 * 1000).toISOString();

    keyObj.status = 'CLAIMED';
    keyObj.claimedAt = now.toISOString();
    keyObj.expiresAt = expiresAt;
    keyObj.claimedByIp = cleanIp;

    writeJson(KEYS_DB_PATH, keys);
    await this.recordIpClaim(cleanIp);
    return keyObj;
  }

  async claimOrCreateKey(ip, defaultDurationHours = 24) {
    return this.claimKeyFromPool(ip, defaultDurationHours);
  }

  // SESSIONS
  async createSession(sessionData) {
    const sessions = readJson(SESSIONS_DB_PATH, []);
    const newSession = {
      id: sessionData.id,
      nonce: sessionData.nonce,
      status: 'PENDING',
      type: sessionData.type || 'KEY',
      targetFileId: sessionData.targetFileId || null,
      ip: sessionData.ip,
      userAgent: sessionData.userAgent || '',
      createdAt: sessionData.createdAt || Date.now(),
      claimedAt: null,
      timeTakenSeconds: null
    };
    sessions.push(newSession);

    // Giữ tối đa 1000 session gần nhất để tiết kiệm bộ nhớ
    if (sessions.length > 1000) {
      sessions.splice(0, sessions.length - 1000);
    }
    writeJson(SESSIONS_DB_PATH, sessions);
    return newSession;
  }

  async getSession(id) {
    const sessions = readJson(SESSIONS_DB_PATH, []);
    return sessions.find(s => s.id === id) || null;
  }

  async updateSession(id, updateData) {
    const sessions = readJson(SESSIONS_DB_PATH, []);
    const index = sessions.findIndex(s => s.id === id);
    if (index === -1) return null;
    sessions[index] = { ...sessions[index], ...updateData };
    writeJson(SESSIONS_DB_PATH, sessions);
    return sessions[index];
  }

  // LOGS (Theo dõi Anti-Bypass)
  async addLog(logData) {
    const logs = readJson(LOGS_DB_PATH, []);
    const newLog = {
      id: `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      ip: logData.ip || 'Unknown',
      action: logData.action || 'VERIFY',
      status: logData.status || 'INFO', // SUCCESS | BYPASS_BLOCKED | EXPIRED | INVALID_HMAC
      reason: logData.reason || '',
      timeTakenSeconds: logData.timeTakenSeconds || null,
      userAgent: logData.userAgent || '',
      timestamp: new Date().toISOString()
    };
    logs.unshift(newLog);
    // Giữ tối đa 500 log
    if (logs.length > 500) {
      logs.length = 500;
    }
    writeJson(LOGS_DB_PATH, logs);
    return newLog;
  }

  async getLogs(limit = 100) {
    const logs = readJson(LOGS_DB_PATH, []);
    return logs.slice(0, limit);
  }

  // STATS
  async getStats() {
    const files = await this.getFiles();
    const keys = await this.getKeys();
    const logs = readJson(LOGS_DB_PATH, []);

    const totalDownloads = files.reduce((acc, f) => acc + (f.downloadCount || 0), 0);
    const unusedKeys = keys.filter(k => k.status === 'UNUSED').length;
    const claimedKeys = keys.filter(k => k.status === 'CLAIMED').length;
    const bypassBlocked = logs.filter(l => l.status === 'BYPASS_BLOCKED').length;
    const totalVerifications = logs.filter(l => l.status === 'SUCCESS').length;

    return {
      totalFiles: files.length,
      totalDownloads,
      unusedKeys,
      claimedKeys,
      totalKeys: keys.length,
      bypassBlocked,
      totalVerifications
    };
  }
}

module.exports = new StorageService();
