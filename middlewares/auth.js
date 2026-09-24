const jwt = require('jsonwebtoken');
const config = require('../config/constants');

function requireAdmin(req, res, next) {
  let token = null;

  // 1. Kiểm tra header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Kiểm tra trong Cookie
  if (!token && req.cookies && req.cookies.admin_token) {
    token = req.cookies.admin_token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn!'
    });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Quyền truy cập bị từ chối!'
      });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn!'
    });
  }
}

module.exports = { requireAdmin };
