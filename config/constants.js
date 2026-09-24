const path = require('path');
require('dotenv').config();

const config = {
  PORT: process.env.PORT || 3000,
  SITE_URL: (process.env.SITE_URL || 'https://brmodgetkey.onrender.com').replace(/\/+$/, ''),
  HMAC_SECRET: process.env.HMAC_SECRET || 'default_super_secret_hmac_key_change_me_immediately',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'quocthai',
  JWT_SECRET: process.env.JWT_SECRET || 'default_jwt_secret_token_1234567890',
  LINK4M_API_KEY: process.env.LINK4M_API_KEY || '6a44cabb1c08580bcd40f8ce',
  MIN_WAIT_SECONDS: parseInt(process.env.MIN_WAIT_SECONDS || '20', 10),
  SESSION_EXPIRE_SECONDS: parseInt(process.env.SESSION_EXPIRE_SECONDS || '900', 10), // 15 mins
  MONGODB_URI: process.env.MONGODB_URI || '',
  UPLOAD_DIR: path.join(__dirname, '..', 'uploads'),
  DATA_DIR: path.join(__dirname, '..', 'data'),
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
};

module.exports = config;
