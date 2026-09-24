# HỆ THỐNG GET KEY & TẢI FILE LINK4M (ANTI-BYPASS CHỮ KÝ HMAC)

Hệ thống website chia sẻ tệp tin và cấp khóa kích hoạt (Get Key) tích hợp dịch vụ rút gọn link **Link4M**, trang bị cơ chế bảo mật cao cấp **Anti-Bypass bằng chữ ký số HMAC-SHA256** và kiểm soát thời gian vượt link thực tế (Delta Time Check).

Hệ thống được tối ưu hóa 100% để triển khai (deploy) lên nền tảng **Render** và kết nối trực tiếp với kho mã nguồn GitHub: `https://github.com/trungnhan2920-code/get.git`.

---

## 🌟 Tính Năng Nổi Bật

### 1. Phía Người Dùng (Client Portal)
- **Giao diện hiện đại:** Thiết kế chuẩn Dark Mode / Cyberpunk Glassmorphism với hiệu ứng vầng sáng neon và responsive mượt mà trên cả điện thoại và máy tính.
- **Tải File:** Danh sách file chia sẻ kèm tag phiên bản, dung lượng, danh mục, số lượt tải. Hỗ trợ cả file tải tự do lẫn file yêu cầu vượt Link4M để mở khóa.
- **Lấy Khóa (Get Key):** Nhận key bản quyền 24h chỉ với 1 click. Hệ thống tự động tạo phiên bảo mật, đưa qua Link4M và trả về mã kích hoạt cùng thời hạn sử dụng.
- **Tra Cứu Khóa (Check Key):** Cho phép người dùng kiểm tra trạng thái key (còn hạn bao nhiêu giờ/phút hay đã hết hạn).

### 2. Phía Quản Trị Viên (Admin Panel - `/admin`)
- **Bảo mật tuyệt đối:** Đăng nhập quản trị với mật khẩu và JWT Cookie bảo vệ.
- **Thống kê thời gian thực (Dashboard):** Tổng số file, tổng lượt tải, số key sẵn có trong kho, số key đã cấp, tổng số lần chặn bot bypass.
- **Quản lý File linh hoạt:**
  - Hỗ trợ **Dán Link Trực Tiếp (Direct URL)** từ Google Drive, MediaFire, Discord CDN, GitHub Releases (Khuyên dùng trên Render để không tốn băng thông máy chủ).
  - Hỗ trợ **Upload File trực tiếp** lên máy chủ.
  - Bật/tắt yêu cầu vượt Link4M cho từng file riêng biệt.
- **Quản lý Kho Key:**
  - Nhập danh sách key hàng loạt (**Bulk Add** - dán nhiều key mỗi dòng).
  - Tự động sinh key ngẫu nhiên (**Auto-Generate**) theo số lượng, tiền tố và số giờ hiệu lực.
- **Cấu hình & Anti-Bypass:**
  - Tùy chỉnh `LINK4M_API_KEY`, Khóa bí mật `HMAC_SECRET`, thời gian chờ tối thiểu chống bypass (`MIN_WAIT_SECONDS`), thời hạn key và đổi mật khẩu Admin.
- **Nhật ký Chặn Bypass (Live Logs):** Theo dõi chi tiết IP, User-Agent, thời gian vượt link và lý do chặn gian lận.

### 3. Cơ Chế Anti-Bypass Chữ Ký HMAC & Delta Time
- **Chữ Ký HMAC-SHA256:** Mỗi phiên được bọc bởi chữ ký số bí mật `HMAC_SHA256(sessionId + createdAt + nonce + ip, HMAC_SECRET)`. Bất kỳ công cụ bypass nào tự ý giả mạo token hoặc sửa tham số đều bị hệ thống phát hiện và chặn tức khắc.
- **Kiểm soát Delta-Time (Thời gian tối thiểu):** Con người thực tế vượt link Link4M (giải captcha, chờ đếm ngược) cần ít nhất 20-35 giây. Các tool bypass tự động (Bypass.city, tampermonkey script, curl bot) thường trả kết quả chỉ trong 1-5 giây -> Hệ thống ghi nhận hành vi gian lận và khóa yêu cầu (`BYPASS_BLOCKED`).
- **Chống Replay Attack:** Mỗi token chỉ dùng được đúng 1 lần duy nhất, ngăn chặn việc chia sẻ link xác thực cho nhiều người.

---

## 🚀 Hướng Dẫn Chạy Thử Cục Bộ (Localhost)

1. Cài đặt các thư viện phụ thuộc:
```bash
npm install
```

2. Chạy bài kiểm thử bảo mật tự động:
```bash
npm test
```

3. Khởi động máy chủ:
```bash
npm start
# Hoặc chế độ phát triển tự reload:
npm run dev
```

4. Truy cập trên trình duyệt:
- **Trang chủ người dùng:** [http://localhost:3000](http://localhost:3000)
- **Trang quản trị Admin:** [http://localhost:3000/admin](http://localhost:3000/admin) *(Mật khẩu mặc định: `quocthai`)*

---

## 📤 Hướng Dẫn Đẩy Code Lên GitHub

Kho lưu trữ GitHub của bạn: `https://github.com/trungnhan2920-code/get.git`

Thực hiện các lệnh sau trong Terminal tại thư mục dự án:

```bash
# 1. Khởi tạo Git (nếu chưa có)
git init

# 2. Liên kết với repository GitHub của bạn
git remote add origin https://github.com/trungnhan2920-code/get.git

# 3. Thêm toàn bộ mã nguồn
git add .

# 4. Tạo commit đầu tiên
git commit -m "Khoi tao he thong GetKey va Download File Link4M Anti-Bypass HMAC"

# 5. Đổi nhánh chính thành main và đẩy code lên GitHub
git branch -M main
git push -u origin main
```

*(Lưu ý: Nếu GitHub yêu cầu đăng nhập, hãy sử dụng GitHub Personal Access Token hoặc đăng nhập qua trình duyệt).*

---

## 🌐 Hướng Dẫn Deploy Lên Render (Từng Bước Chi Tiết)

### Bước 1: Tạo Web Service trên Render
1. Đăng nhập vào [Render.com](https://render.com).
2. Nhấn nút **New +** ở góc trên bên phải -> Chọn **Web Service**.
3. Chọn mục **Build and deploy from a Git repository** -> Kết nối tài khoản GitHub của bạn và chọn repository `trungnhan2920-code/get`.
4. Điền các thông số cơ bản:
   - **Name:** Đặt tên cho app (ví dụ: `getkey-link4m-pro`)
   - **Region:** Chọn `Singapore` (để tốc độ tải từ Việt Nam nhanh nhất)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Chọn gói **Free**

### Bước 2: Thiết lập Biến Môi Trường (Environment Variables) trên Render
Kéo xuống phần **Environment Variables** và nhấn **Add Environment Variable** để thêm các biến sau:

| Tên biến (Key) | Giá trị gợi ý (Value) | Giải thích |
|---|---|---|
| `PORT` | `10000` | Render tự động cấp cổng này |
| `ADMIN_PASSWORD` | `MatKhauAdminCuaBan123@` | Mật khẩu đăng nhập vào trang `/admin` |
| `HMAC_SECRET` | `chuoi_bi_mat_ngau_nhien_dai_32_ky_tu_abcdef123` | Khóa bí mật dùng để ký chữ ký HMAC chống bypass |
| `JWT_SECRET` | `jwt_secret_token_bao_mat_987654` | Khóa mã hóa phiên đăng nhập Admin |
| `MIN_WAIT_SECONDS` | `20` | Số giây tối thiểu người dùng phải chờ ở Link4M (chống tool bypass) |
| `LINK4M_API_KEY` | *(Nhập API Token của bạn)* | Lấy trong Dashboard tài khoản Link4M của bạn |
| `SITE_URL` | `https://ten-app-cua-ban.onrender.com` | Tên miền Render vừa tạo của bạn |
| `MONGODB_URI` | *(Xem mục bên dưới)* | Kết nối cơ sở dữ liệu vĩnh viễn |

### Bước 3: Giải Pháp Lưu Dữ Liệu Vĩnh Viễn Trên Render Free Tier (MongoDB Atlas)
> [!IMPORTANT]
> Gói Free của Render sử dụng ổ cứng tạm thời (Ephemeral Storage). Mỗi khi server restart hoặc ngủ đông, các file JSON cục bộ sẽ được reset về ban đầu.
>
> **Để dữ liệu Key và File không bao giờ bị mất:**
> 1. Truy cập [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) và đăng ký tài khoản miễn phí.
> 2. Tạo một cụm cơ sở dữ liệu miễn phí (**M0 Free Tier - 512MB vĩnh viễn**).
> 3. Chọn kết nối **Connect via Drivers** để lấy chuỗi kết nối dạng:
>    `mongodb+srv://admin:<password>@cluster0.abcde.mongodb.net/getkey_db?retryWrites=true&w=majority`
> 4. Dán chuỗi này vào biến môi trường `MONGODB_URI` trên Render. Hệ thống sẽ tự động chuyển sang lưu trữ đám mây vĩnh viễn!
> *(Nếu bạn không điền `MONGODB_URI`, hệ thống vẫn hoạt động bình thường với cơ sở dữ liệu File JSON cục bộ)*.

### Bước 4: Hoàn Tất & Kiểm Tra
Nhấn **Create Web Service**. Chờ 1-2 phút để Render build và khởi động. Khi xuất hiện trạng thái **Live**, bạn có thể truy cập website ngay lập tức!
