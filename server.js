const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const mongoose = require('mongoose');

const config = require('./config/constants');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();

// Bảo mật Header với Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Để tương thích với Font Awesome và Google Fonts
    crossOriginEmbedderPolicy: false
  })
);

// CORS
app.use(cors());

// Parse JSON, URL-encoded và Cookies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate Limiter bảo vệ máy chủ khỏi spam
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 300, // Tối đa 300 yêu cầu / 15 phút / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu từ IP của bạn! Vui lòng thử lại sau.' }
});

const verifyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 30, // Tối đa 30 yêu cầu xác thực / phút
  message: { success: false, message: 'Thao tác quá nhanh! Vui lòng chờ 1 phút trước khi thử lại.' }
});

app.use('/api/', generalLimiter);
app.use('/api/session/create', verifyLimiter);
app.use('/api/verify', verifyLimiter);

// Phục vụ tệp tĩnh Frontend
app.use(express.static(path.join(__dirname, 'public')));

// Gắn Routes
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Đường dẫn truy cập trang Quản trị Admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// SPA fallback về index.html cho các route còn lại
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Kết nối MongoDB nếu có thiết lập MONGODB_URI (Tối ưu cho Render)
if (config.MONGODB_URI && config.MONGODB_URI.trim() !== '') {
  console.log('[Database] Đang kết nối tới MongoDB Atlas...');
  mongoose
    .connect(config.MONGODB_URI)
    .then(() => {
      console.log('✅ [Database] Đã kết nối MongoDB Atlas thành công (Dữ liệu được lưu vĩnh viễn trên Render)');
    })
    .catch(err => {
      console.warn('⚠️ [Database] Không thể kết nối MongoDB Atlas:', err.message);
      console.log('ℹ️ [Database] Đang sử dụng cơ sở dữ liệu File JSON cục bộ.');
    });
} else {
  console.log('ℹ️ [Database] Đang sử dụng cơ sở dữ liệu File JSON cục bộ (Thư mục data/).');
}

// Khởi chạy máy chủ
const server = app.listen(config.PORT, () => {
  console.log(`
=====================================================
🚀 HỆ THỐNG GET KEY & TẢI FILE LINK4M ĐANG CHẠY!
🔗 Website:       http://localhost:${config.PORT}
🛡️ Quản trị viên: http://localhost:${config.PORT}/admin
🔒 Anti-Bypass:   Chữ ký HMAC-SHA256 kích hoạt
⏳ Thời gian chờ: ${config.MIN_WAIT_SECONDS} giây
=====================================================
`);
});

module.exports = { app, server };
