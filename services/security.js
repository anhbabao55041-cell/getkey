const crypto = require('crypto');
const storage = require('./storage');
const config = require('../config/constants');

class SecurityService {
  /**
   * Tạo chữ ký HMAC-SHA256
   */
  createHmacSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * So sánh an toàn tránh Timing Attack
   */
  safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Tạo Token được ký HMAC cho phiên Get Key hoặc Unlock File (Hỗ trợ 2 bước: step 1 và step 2)
   */
  async generateSessionToken({ type = 'KEY', targetFileId = null, ip, userAgent, step = 1, parentSessionId = null }) {
    const settings = await storage.getSettings();
    const secret = settings.hmacSecret || config.HMAC_SECRET;

    const sessionId = `ses_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const createdAt = Date.now();
    const nonce = crypto.randomBytes(8).toString('hex');

    // Payload định danh phiên: sessionId:createdAt:nonce:ip:step
    const payload = `${sessionId}:${createdAt}:${nonce}:${ip}:${step}`;
    const signature = this.createHmacSignature(payload, secret);

    // Đóng gói thành token dạng URL-safe
    const tokenObj = {
      s: sessionId,
      c: createdAt,
      n: nonce,
      st: step,
      sig: signature
    };
    const tokenStr = Buffer.from(JSON.stringify(tokenObj)).toString('base64url');

    // Lưu vào database
    await storage.createSession({
      id: sessionId,
      nonce,
      type,
      step,
      parentSessionId,
      targetFileId,
      ip,
      userAgent,
      createdAt
    });

    return {
      sessionId,
      token: tokenStr,
      step,
      createdAt
    };
  }

  /**
   * Xác thực Token khi người dùng hoặc bot quay về từ Link4M
   */
  async verifySessionToken(tokenStr, clientIp, userAgent) {
    const settings = await storage.getSettings();
    const secret = settings.hmacSecret || config.HMAC_SECRET;
    const minWaitSeconds = Number(settings.minWaitSeconds) || config.MIN_WAIT_SECONDS;
    const maxExpireSeconds = config.SESSION_EXPIRE_SECONDS;

    let tokenObj;
    try {
      const decoded = Buffer.from(tokenStr, 'base64url').toString('utf-8');
      tokenObj = JSON.parse(decoded);
    } catch (e) {
      await storage.addLog({
        ip: clientIp,
        action: 'VERIFY',
        status: 'INVALID_HMAC',
        reason: 'Token sai định dạng mã hóa',
        userAgent
      });
      return {
        success: false,
        status: 'INVALID_TOKEN',
        message: 'Mã xác thực (Token) không hợp lệ hoặc đã bị chỉnh sửa!'
      };
    }

    const { s: sessionId, c: createdAt, n: nonce, st: step = 1, sig: signature } = tokenObj;
    if (!sessionId || !createdAt || !nonce || !signature) {
      return {
        success: false,
        status: 'INVALID_TOKEN',
        message: 'Token thiếu các trường thông tin bảo mật bắt buộc!'
      };
    }

    // 1. Kiểm tra session trong DB (nếu có)
    const session = await storage.getSession(sessionId);

    // 2. Chống Replay Attack: Nếu token đã được xác thực trước đó thì chặn không cho dùng lại
    if (session && (session.status === 'CLAIMED' || session.status === 'STEP1_COMPLETED')) {
      await storage.addLog({
        ip: clientIp,
        action: 'VERIFY',
        status: 'REPLAY_ATTACK',
        reason: 'Cố gắng sử dụng lại token đã xác thực trước đó',
        userAgent
      });
      return {
        success: false,
        status: 'ALREADY_USED',
        message: 'Link xác thực này đã được sử dụng trước đó!'
      };
    }

    // 3. Kiểm tra Chữ ký HMAC bí mật (Cốt lõi bảo mật)
    const candidateIps = new Set();
    if (session && session.ip) candidateIps.add(session.ip);
    candidateIps.add(clientIp);
    if (clientIp === '127.0.0.1') candidateIps.add('::1');
    if (clientIp === '::1') candidateIps.add('127.0.0.1');

    let isSigValid = false;
    for (const ipToCheck of candidateIps) {
      const expectedWithStep = `${sessionId}:${createdAt}:${nonce}:${ipToCheck}:${step}`;
      const expectedLegacy = `${sessionId}:${createdAt}:${nonce}:${ipToCheck}`;
      if (
        this.safeCompare(signature, this.createHmacSignature(expectedWithStep, secret)) ||
        this.safeCompare(signature, this.createHmacSignature(expectedLegacy, secret))
      ) {
        isSigValid = true;
        break;
      }
    }

    if (!isSigValid) {
      await storage.addLog({
        ip: clientIp,
        action: 'VERIFY',
        status: 'INVALID_HMAC',
        reason: 'Chữ ký HMAC không khớp (Phát hiện giả mạo chữ ký)',
        userAgent
      });
      return {
        success: false,
        status: 'TAMPERED_TOKEN',
        message: 'Cảnh báo: Chữ ký số HMAC không khớp hoặc token đã bị sửa đổi!'
      };
    }

    const now = Date.now();
    const elapsedSeconds = (now - createdAt) / 1000;

    // 4. Kiểm tra Hết hạn (Expiry)
    if (elapsedSeconds > maxExpireSeconds) {
      await storage.updateSession(sessionId, { status: 'EXPIRED' });
      await storage.addLog({
        ip: clientIp,
        action: 'VERIFY',
        status: 'EXPIRED',
        reason: `Hết hạn sau ${elapsedSeconds.toFixed(0)}s (> ${maxExpireSeconds}s)`,
        userAgent
      });
      return {
        success: false,
        status: 'EXPIRED',
        message: 'Phiên vượt link đã hết hạn (quá 15 phút). Vui lòng thử lại!'
      };
    }

    // 5. CƠ CHẾ CHỐNG BYPASS: KIỂM TRA THỜI GIAN TỐI THIỂU (DELTA TIME CHECK)
    if (elapsedSeconds < minWaitSeconds) {
      await storage.updateSession(sessionId, { status: 'BLOCKED' });
      await storage.addLog({
        ip: clientIp,
        action: 'VERIFY',
        status: 'BYPASS_BLOCKED',
        timeTakenSeconds: parseFloat(elapsedSeconds.toFixed(1)),
        reason: `Thời gian hoàn thành quá nhanh: ${elapsedSeconds.toFixed(1)}s < ngưỡng tối thiểu ${minWaitSeconds}s`,
        userAgent
      });
      return {
        success: false,
        status: 'BYPASS_BLOCKED',
        elapsedSeconds: parseFloat(elapsedSeconds.toFixed(1)),
        minWaitSeconds,
        message: `Phát hiện công cụ Bypass tự động! Bạn chỉ mất ${elapsedSeconds.toFixed(1)}s trong khi thời gian tối thiểu hợp lệ là ${minWaitSeconds}s.`
      };
    }

    // 6. XÁC THỰC THÀNH CÔNG!
    const isStep1 = step === 1;
    const finalStatus = isStep1 ? 'STEP1_COMPLETED' : 'CLAIMED';

    let finalSession = session;
    if (session) {
      finalSession = await storage.updateSession(sessionId, {
        status: finalStatus,
        claimedAt: new Date().toISOString(),
        timeTakenSeconds: parseFloat(elapsedSeconds.toFixed(1))
      });
    } else {
      finalSession = await storage.createSession({
        id: sessionId,
        nonce,
        status: finalStatus,
        type: 'KEY',
        step,
        targetFileId: null,
        ip: clientIp,
        userAgent,
        createdAt,
        claimedAt: new Date().toISOString(),
        timeTakenSeconds: parseFloat(elapsedSeconds.toFixed(1))
      });
    }

    await storage.addLog({
      ip: clientIp,
      action: 'VERIFY',
      status: 'SUCCESS',
      timeTakenSeconds: parseFloat(elapsedSeconds.toFixed(1)),
      reason: `Vượt Link ${step}/2 hợp lệ trong ${elapsedSeconds.toFixed(1)}s`,
      userAgent
    });

    return {
      success: true,
      status: finalStatus,
      step,
      totalSteps: 2,
      step1Token: isStep1 ? tokenStr : null,
      session: finalSession,
      elapsedSeconds: parseFloat(elapsedSeconds.toFixed(1))
    };
  }

  /**
   * Kiểm tra tính hợp lệ của token Bước 1 để cấp quyền tạo phiên Bước 2
   */
  async validateStep1Completion(tokenStr, clientIp, userAgent = '') {
    try {
      const decoded = Buffer.from(tokenStr, 'base64url').toString('utf-8');
      const tokenObj = JSON.parse(decoded);
      const { s: sessionId, c: createdAt, n: nonce, st: step = 1, sig: signature } = tokenObj;
      if (!sessionId || !createdAt || !nonce || !signature) {
        return { success: false, message: 'Token thiếu thông tin bảo mật!' };
      }

      const settings = await storage.getSettings();
      const secret = settings.hmacSecret || config.HMAC_SECRET;
      const candidateIps = new Set([clientIp, '127.0.0.1', '::1']);
      const session = await storage.getSession(sessionId);
      if (session && session.ip) candidateIps.add(session.ip);

      let isSigValid = false;
      for (const ipToCheck of candidateIps) {
        const expectedWithStep = `${sessionId}:${createdAt}:${nonce}:${ipToCheck}:${step}`;
        const expectedLegacy = `${sessionId}:${createdAt}:${nonce}:${ipToCheck}`;
        if (
          this.safeCompare(signature, this.createHmacSignature(expectedWithStep, secret)) ||
          this.safeCompare(signature, this.createHmacSignature(expectedLegacy, secret))
        ) {
          isSigValid = true;
          break;
        }
      }

      if (!isSigValid) {
        return { success: false, message: 'Chữ ký HMAC Bước 1 không hợp lệ!' };
      }

      if (!session || session.status !== 'STEP1_COMPLETED') {
        return { success: false, message: 'Bước 1 chưa hoàn thành hoặc chưa được xác thực!' };
      }

      if (session.step2Used) {
        return { success: false, message: 'Phiên Bước 1 này đã được sử dụng để tạo link Bước 2!' };
      }

      // Đánh dấu session bước 1 đã chuyển tiếp sang bước 2
      await storage.updateSession(sessionId, { step2Used: true });

      return {
        success: true,
        session
      };
    } catch (e) {
      return { success: false, message: 'Lỗi giải mã token Bước 1: ' + e.message };
    }
  }

  /**
   * Tạo Token tải file tạm thời có thời hạn 10 phút
   */
  generateFileDownloadToken(fileId, ip) {
    const payload = {
      fileId,
      ip,
      exp: Date.now() + 10 * 60 * 1000 // 10 phút
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  /**
   * Kiểm tra Token tải file
   */
  verifyFileDownloadToken(tokenStr, clientIp) {
    try {
      const decoded = Buffer.from(tokenStr, 'base64url').toString('utf-8');
      const payload = JSON.parse(decoded);
      if (Date.now() > payload.exp) {
        return { valid: false, message: 'Link tải file đã hết hạn!' };
      }
      return { valid: true, fileId: payload.fileId };
    } catch (_) {
      return { valid: false, message: 'Link tải không hợp lệ!' };
    }
  }
}

module.exports = new SecurityService();
