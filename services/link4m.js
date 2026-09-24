const storage = require('./storage');
const config = require('../config/constants');

class Link4mService {
  /**
   * Tạo link vượt qua Link4M bằng API hoặc QuickLink
   * Định dạng QuickLink chuẩn của Link4M: https://link4m.co/st?api={API_TOKEN}&url={DESTINATION_URL}
   */
  async shortenUrl(destinationUrl) {
    const settings = await storage.getSettings();
    const apiKey = (settings.link4mApiKey || config.LINK4M_API_KEY || '').trim();

    // Nếu chưa cấu hình API Key, trả về link trực tiếp kèm chế độ Test
    if (!apiKey) {
      console.warn('[Link4M] Chưa cấu hình LINK4M_API_KEY. Sử dụng chế độ Test Direct Link.');
      return {
        success: true,
        shortenedUrl: destinationUrl,
        isSimulated: true,
        message: 'Chế độ Demo (Chưa nhập Link4M API Key).'
      };
    }

    // Link QuickLink chuẩn của Link4M: Người dùng truy cập link này sẽ qua các bước quảng cáo của Link4M
    const quickLink = `https://link4m.co/st?api=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(destinationUrl)}`;

    try {
      // Thử gọi API rút gọn trả về link ngắn nếu có
      const apiUrl = `https://link4m.co/api?api=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(destinationUrl)}&format=json`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data.status === 'success' && data.shortenedUrl) {
          return {
            success: true,
            shortenedUrl: data.shortenedUrl,
            isSimulated: false
          };
        }
      }
      
      // Nếu API trả về dạng khác hoặc được bảo vệ bởi Cloudflare, chuyển hướng thẳng bằng QuickLink Link4M
      return {
        success: true,
        shortenedUrl: quickLink,
        isSimulated: false
      };
    } catch (_) {
      // Khi server fetch bị timeout hoặc lỗi mạng, trả về QuickLink trực tiếp cho trình duyệt người dùng
      return {
        success: true,
        shortenedUrl: quickLink,
        isSimulated: false
      };
    }
  }
}

module.exports = new Link4mService();
