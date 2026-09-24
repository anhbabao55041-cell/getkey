// Client App Logic
let siteInfo = {};
let allFiles = [];

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadSiteInfo();
  loadFiles();
  checkUrlForVerification();
  setupKeyChecker();
});

// 1. Quản lý Chuyển Tab
function initTabs() {
  const navBtns = document.querySelectorAll('.nav-item');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  const activeTab = document.getElementById(`tab-${tabId}`);

  if (activeBtn) activeBtn.classList.add('active');
  if (activeTab) activeTab.classList.add('active');
}

// 2. Lấy thông tin cấu hình trang web
async function loadSiteInfo() {
  try {
    const res = await fetch('/api/info');
    const data = await res.json();
    if (data.success) {
      siteInfo = data;
      const waitNotice = document.getElementById('wait-notice');
      if (waitNotice) {
        waitNotice.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Thời gian chờ tối thiểu chống bypass: ${data.minWaitSeconds}s / mỗi link`;
      }
      updateKeyStockUI(data.availableKeys, data);
    }
  } catch (err) {
    console.error('Không thể tải info cấu hình:', err);
  }
}

function updateKeyStockUI(availableCount, info = {}) {
  const stockBadge = document.getElementById('key-stock-badge');
  const stockText = document.getElementById('key-stock-text');
  const ipBadge = document.getElementById('ip-limit-badge');
  const ipText = document.getElementById('ip-limit-text');
  const btnGetKey = document.getElementById('btn-getkey');
  const btnText = document.getElementById('btn-getkey-text');

  // Cập nhật thông tin IP & số lần lấy (tối đa 2 lần / 24h)
  if (info.clientIp && ipText && ipBadge) {
    const claims = info.ipClaimsToday || 0;
    const max = info.maxKeysPerIp || 2;
    if (info.ipLimitReached) {
      ipBadge.className = 'ip-limit-badge limit-reached';
      ipText.innerHTML = `⚠️ IP: <strong>${info.clientIp}</strong> (Đã dùng hết <strong>${claims}/${max}</strong> lần/ngày)`;
    } else {
      ipBadge.className = 'ip-limit-badge';
      ipText.innerHTML = `🌐 IP: <strong>${info.clientIp}</strong> (Đã nhận <strong>${claims}/${max}</strong> lần/ngày)`;
    }
  }

  // Nếu IP đã dùng hết số lần cho phép (tối đa 2 lần)
  if (info.ipLimitReached) {
    if (btnGetKey) {
      btnGetKey.disabled = true;
    }
    if (btnText) {
      btnText.innerText = `⛔ Đã Đạt Giới Hạn (${info.ipClaimsToday}/${info.maxKeysPerIp || 2} Lần Cho IP Này)`;
    }
    return;
  }

  if (typeof availableCount !== 'number') return;

  if (availableCount > 0) {
    if (stockBadge) {
      stockBadge.className = 'key-stock-badge in-stock';
    }
    if (stockText) {
      stockText.innerHTML = `🟢 Kho Khóa: Còn <strong>${availableCount}</strong> key sẵn sàng`;
    }
    if (btnGetKey) {
      btnGetKey.disabled = false;
    }
    if (btnText) {
      btnText.innerText = 'Bắt Đầu Vượt Link (Bước 1/2)';
    }
  } else {
    if (stockBadge) {
      stockBadge.className = 'key-stock-badge out-of-stock';
    }
    if (stockText) {
      stockText.innerHTML = `🔴 Kho Khóa: <strong>ĐÃ HẾT KEY</strong> (Vui lòng quay lại sau)`;
    }
    if (btnGetKey) {
      btnGetKey.disabled = true;
    }
    if (btnText) {
      btnText.innerText = '❌ Kho Đã Hết Key (Tạm Khóa)';
    }
  }
}

// 3. Tải danh sách file tải về
async function loadFiles() {
  const container = document.getElementById('files-container');
  if (!container) return;

  try {
    const res = await fetch('/api/files');
    const data = await res.json();
    if (data.success) {
      allFiles = data.files;
      renderFiles(allFiles);
    } else {
      container.innerHTML = `<div class="error-box">Không thể tải danh sách file!</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="error-box">Lỗi kết nối máy chủ!</div>`;
  }
}

function renderFiles(files) {
  const container = document.getElementById('files-container');
  if (!container) return;

  if (files.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);">
        <i class="fa-solid fa-folder-open" style="font-size: 40px; margin-bottom: 12px; display: block;"></i>
        Chưa có tệp tin nào được chia sẻ.
      </div>
    `;
    return;
  }

  container.innerHTML = files.map(file => {
    return `
      <div class="file-card">
        <div>
          <div class="file-header">
            <div class="file-icon">
              <i class="fa-solid ${getFileIcon(file.category)}"></i>
            </div>
            <div class="file-info">
              <h3 class="file-title">${escapeHtml(file.title)}</h3>
              <div class="file-meta">
                <span class="badge badge-version">${escapeHtml(file.version || 'v1.0')}</span>
                <span class="badge badge-size">${escapeHtml(file.fileSize || 'N/A')}</span>
                <span class="badge badge-free"><i class="fa-solid fa-bolt"></i> Tải Trực Tiếp</span>
              </div>
            </div>
          </div>
          <p class="file-desc">${escapeHtml(file.description || 'Không có mô tả')}</p>
        </div>
        <div class="file-footer">
          <div class="file-stats">
            <i class="fa-solid fa-download"></i> ${file.downloadCount || 0} lượt tải
          </div>
          <button 
            class="btn-download" 
            onclick="handleDownloadFile('${file.id}')"
          >
            <i class="fa-solid fa-cloud-arrow-down"></i> Tải Ngay (Trực Tiếp)
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// 4. Lọc tìm kiếm file
const searchInput = document.getElementById('file-search');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = allFiles.filter(f => 
      f.title.toLowerCase().includes(query) || 
      (f.description && f.description.toLowerCase().includes(query)) ||
      (f.category && f.category.toLowerCase().includes(query))
    );
    renderFiles(filtered);
  });
}

function getFileIcon(category = '') {
  const cat = category.toLowerCase();
  if (cat.includes('script') || cat.includes('code')) return 'fa-code';
  if (cat.includes('apk') || cat.includes('android')) return 'fa-android';
  if (cat.includes('tool') || cat.includes('app')) return 'fa-screwdriver-wrench';
  if (cat.includes('zip') || cat.includes('rar')) return 'fa-file-zipper';
  return 'fa-file';
}

// 5. Bắt đầu Get Key qua Link4M (Anti-Bypass HMAC Bước 1/2)
async function startGetKey() {
  if (siteInfo.ipLimitReached) {
    alert(`Địa chỉ IP của bạn (${siteInfo.clientIp || ''}) đã đạt giới hạn tối đa ${siteInfo.maxKeysPerIp || 2} lần lấy key trong 24 giờ. Vui lòng quay lại sau!`);
    return;
  }

  if (siteInfo.availableKeys !== undefined && siteInfo.availableKeys <= 0) {
    alert('Kho hiện tại đã hết key! Quản trị viên chưa nạp thêm. Vui lòng quay lại sau.');
    return;
  }

  const btn = document.getElementById('btn-getkey');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Đang tạo phiên Link 1/2...`;

  try {
    const res = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'KEY' })
    });
    const data = await res.json();

    if (data.success && data.shortUrl) {
      if (data.isSimulated) {
        showToast('ℹ️ Chế độ Test: Chuyển hướng đến Link 1/2...');
      }
      setTimeout(() => {
        window.location.href = data.shortUrl;
      }, 500);
    } else {
      alert('Không thể tạo link: ' + (data.message || 'Lỗi không xác định'));
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      if (data.status === 'OUT_OF_KEYS') {
        updateKeyStockUI(0, siteInfo);
      }
      if (data.status === 'IP_LIMIT_REACHED') {
        siteInfo.ipLimitReached = true;
        siteInfo.ipClaimsToday = siteInfo.maxKeysPerIp || 2;
        updateKeyStockUI(siteInfo.availableKeys, siteInfo);
      }
    }
  } catch (err) {
    alert('Lỗi kết nối tới máy chủ!');
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// 6. Tải file 100% trực tiếp không cần vượt link
function handleDownloadFile(fileId) {
  window.location.href = `/api/download/${fileId}`;
}

// 7. Kiểm tra URL khi quay lại từ Link4M
function checkUrlForVerification() {
  let token = null;

  // Kiểm tra hash (#verify?token=...) hoặc query string (?token=...)
  const hash = window.location.hash;
  if (hash.includes('token=')) {
    const params = new URLSearchParams(hash.substring(hash.indexOf('?')));
    token = params.get('token');
  }

  if (!token) {
    const searchParams = new URLSearchParams(window.location.search);
    token = searchParams.get('token');
  }

  if (token) {
    // Dọn dẹp URL trên trình duyệt để khi F5 không bị xác thực lại token cũ
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    switchTab('verify');
    executeVerification(token);
  }
}

function retryGetKey() {
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  switchTab('getkey');
}

// 8. Thực hiện xác thực HMAC Callback với máy chủ
async function executeVerification(token) {
  const resultContainer = document.getElementById('verify-result-box');
  if (!resultContainer) return;

  resultContainer.innerHTML = `
    <div style="padding: 40px 20px; text-align: center;">
      <i class="fa-solid fa-shield-halved fa-beat" style="font-size: 54px; color: var(--accent-cyan); margin-bottom: 20px;"></i>
      <h3 style="font-size: 22px; margin-bottom: 8px;">Đang xác thực chữ ký bảo mật HMAC...</h3>
      <p style="color: var(--text-muted); font-size: 14px;">Hệ thống đang kiểm tra chữ ký và thời gian để chống tool bypass tự động.</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/verify?token=${encodeURIComponent(token)}`);
    const data = await res.json();

    if (data.success) {
      if (data.status === 'STEP1_COMPLETED') {
        renderStep1Success(data);
      } else if (data.type === 'KEY') {
        renderKeySuccess(data);
      } else if (data.type === 'FILE') {
        renderFileSuccess(data);
      }
    } else {
      renderVerifyFailure(data);
    }
  } catch (err) {
    resultContainer.innerHTML = `
      <div class="result-card blocked">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 44px; color: var(--accent-rose); margin-bottom: 16px;"></i>
        <h3 style="color: var(--accent-rose); margin-bottom: 10px;">Lỗi kết nối xác thực!</h3>
        <p style="color: var(--text-muted);">Không thể kết nối đến máy chủ xác minh. Vui lòng kiểm tra lại đường truyền.</p>
      </div>
    `;
  }
}

// Giao diện khi hoàn thành Bước 1/2: Yêu cầu người dùng bấm vượt tiếp Bước 2/2
function renderStep1Success(data) {
  const container = document.getElementById('verify-result-box');
  container.innerHTML = `
    <div class="result-card success">
      <div class="stepper-container">
        <div class="stepper-step completed">
          <i class="fa-solid fa-circle-check"></i> Bước 1: Xong (1/2)
        </div>
        <div class="stepper-divider completed"></div>
        <div class="stepper-step active">
          <i class="fa-solid fa-circle-arrow-right"></i> Bước 2: Link Cuối (2/2)
        </div>
      </div>

      <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--accent-emerald); font-size: 28px;">
        <i class="fa-solid fa-shield-halved"></i>
      </div>
      <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Đã Vượt Thành Công Bước 1/2!</h2>
      <p style="color: var(--text-muted); font-size: 14.5px; line-height: 1.6; margin-bottom: 24px;">
        ${escapeHtml(data.message || 'Bạn đã vượt qua Bước 1/2. Nhấn nút bên dưới để vượt tiếp Bước 2/2 (Link cuối cùng) để nhận Key kích hoạt!')}
      </p>

      <button id="btn-step2" class="btn-step2" onclick="continueStep2('${escapeHtml(data.step1Token)}')">
        <i class="fa-solid fa-arrow-right-long"></i> Vượt Tiếp Bước 2/2 Để Nhận Key
      </button>

      <div style="margin-top: 20px; font-size: 13px; color: var(--text-dim);">
        <i class="fa-solid fa-lock"></i> Chữ ký HMAC Bước 1 hợp lệ • Vui lòng không chia sẻ mã token cho người khác
      </div>
    </div>
  `;
}

// Bắt đầu vượt Bước 2/2 qua Link4M
async function continueStep2(step1Token) {
  const btn = document.getElementById('btn-step2');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Đang tạo phiên Link 2/2...`;
  }
  try {
    const res = await fetch('/api/session/step2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step1Token })
    });
    const data = await res.json();

    if (data.success && data.shortUrl) {
      if (data.isSimulated) {
        showToast('ℹ️ Chế độ Test: Chuyển hướng đến Link 2/2...');
      }
      setTimeout(() => {
        window.location.href = data.shortUrl;
      }, 400);
    } else {
      alert('Không thể tạo Link Bước 2: ' + (data.message || 'Lỗi không xác định'));
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-arrow-right-long"></i> Vượt Tiếp Bước 2/2 Để Nhận Key`;
      }
      if (data.status === 'OUT_OF_KEYS') {
        updateKeyStockUI(0);
      }
    }
  } catch (err) {
    alert('Lỗi kết nối tới máy chủ!');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-arrow-right-long"></i> Vượt Tiếp Bước 2/2 Để Nhận Key`;
    }
  }
}

function renderKeySuccess(data) {
  const container = document.getElementById('verify-result-box');
  const expireDate = data.expiresAt ? new Date(data.expiresAt).toLocaleString('vi-VN') : '24 giờ';

  container.innerHTML = `
    <div class="result-card success">
      <div class="stepper-container">
        <div class="stepper-step completed">
          <i class="fa-solid fa-circle-check"></i> Bước 1: Xong
        </div>
        <div class="stepper-divider completed"></div>
        <div class="stepper-step completed">
          <i class="fa-solid fa-circle-check"></i> Bước 2: Xong
        </div>
      </div>

      <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--accent-emerald); font-size: 28px;">
        <i class="fa-solid fa-check"></i>
      </div>
      <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Hoàn Thành Cả 2 Bước - Nhận Key!</h2>
      <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
        ${escapeHtml(data.message || 'Cảm ơn bạn đã vượt đủ 2 link Link4M hợp lệ. Dưới đây là mã khóa của bạn:')}
      </p>

      <div class="key-display-box">
        <span class="key-code" id="revealed-key">${escapeHtml(data.key)}</span>
        <button class="btn-copy" onclick="copyToClipboard('${escapeHtml(data.key)}')">
          <i class="fa-solid fa-copy"></i> Sao Chép
        </button>
      </div>

      <div style="font-size: 13px; color: var(--text-dim); display: flex; justify-content: space-around; margin-top: 16px;">
        <span><i class="fa-solid fa-clock"></i> Thời hạn: <strong>${data.durationHours || 24} giờ</strong></span>
        <span><i class="fa-solid fa-calendar-xmark"></i> Hết hạn: <strong>${expireDate}</strong></span>
      </div>

      <button class="btn-submit" style="margin-top: 24px;" onclick="switchTab('checkkey')">
        <i class="fa-solid fa-magnifying-glass"></i> Kiểm Tra Thời Hạn Key Này
      </button>
    </div>
  `;
}

function renderFileSuccess(data) {
  const container = document.getElementById('verify-result-box');
  container.innerHTML = `
    <div class="result-card success">
      <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--accent-emerald); font-size: 28px;">
        <i class="fa-solid fa-unlock"></i>
      </div>
      <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Mở Khóa File Thành Công!</h2>
      <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
        File: <strong>${escapeHtml(data.fileTitle || 'Tệp tin')}</strong> đã sẵn sàng để tải xuống.
      </p>

      <a href="${data.downloadUrl}" class="btn-getkey-main" style="text-decoration: none; margin-top: 10px;">
        <i class="fa-solid fa-cloud-arrow-down"></i> Tải Xuống Ngay (Hạn 10 phút)
      </a>
    </div>
  `;
}

function renderVerifyFailure(data) {
  const container = document.getElementById('verify-result-box');
  const isBypass = data.status === 'BYPASS_BLOCKED';
  const isOutOfKeys = data.status === 'OUT_OF_KEYS';
  const isIpLimit = data.status === 'IP_LIMIT_REACHED';

  if (isIpLimit) {
    container.innerHTML = `
      <div class="result-card blocked" style="border-color: rgba(245, 158, 11, 0.5); box-shadow: 0 0 30px rgba(245, 158, 11, 0.2);">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--accent-amber); font-size: 28px;">
          <i class="fa-solid fa-user-lock"></i>
        </div>
        <h2 style="font-size: 22px; font-weight: 800; color: var(--accent-amber); margin-bottom: 8px;">
          Đã Đạt Giới Hạn Lấy Key!
        </h2>
        <p style="color: var(--text-muted); font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          ${escapeHtml(data.message || 'Mỗi địa chỉ IP chỉ được lấy tối đa 2 lần trong 24 giờ. Vui lòng quay lại sau!')}
        </p>
        <button class="btn-submit" onclick="retryGetKey()">
          <i class="fa-solid fa-arrow-left"></i> Quay Về Trang Chủ
        </button>
      </div>
    `;
    return;
  }

  if (isOutOfKeys) {
    container.innerHTML = `
      <div class="result-card blocked" style="border-color: rgba(245, 158, 11, 0.5); box-shadow: 0 0 30px rgba(245, 158, 11, 0.2);">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--accent-amber); font-size: 28px;">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <h2 style="font-size: 22px; font-weight: 800; color: var(--accent-amber); margin-bottom: 8px;">
          Kho Hiện Tại Đã Hết Key!
        </h2>
        <p style="color: var(--text-muted); font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          ${escapeHtml(data.message || 'Tất cả các mã key trong kho đã được cấp hết. Vui lòng liên hệ Admin nạp thêm hoặc quay lại sau.')}
        </p>
        <button class="btn-submit" onclick="retryGetKey()">
          <i class="fa-solid fa-arrow-left"></i> Quay Về Trang Chủ
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="result-card blocked">
      <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(244, 63, 94, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--accent-rose); font-size: 28px;">
        <i class="fa-solid fa-ban"></i>
      </div>
      <h2 style="font-size: 22px; font-weight: 800; color: var(--accent-rose); margin-bottom: 8px;">
        ${isBypass ? 'Phát Hiện Công Cụ Bypass Tự Động!' : 'Xác Thực Thất Bại!'}
      </h2>
      <p style="color: var(--text-muted); font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        ${escapeHtml(data.message || 'Mã xác thực không hợp lệ!')}
      </p>

      ${isBypass ? `
        <div style="background: rgba(0,0,0,0.4); padding: 14px; border-radius: 8px; font-size: 13px; color: #fb7185; margin-bottom: 20px; text-align: left;">
          <i class="fa-solid fa-triangle-exclamation"></i> <strong>Lưu ý:</strong> Hệ thống sử dụng chữ ký điện tử HMAC và giám sát thời gian. Bạn cần thực hiện đầy đủ các bước vượt Link4M như người dùng thật (không dùng script bypass tự động) để nhận key thành công.
        </div>
      ` : ''}

      <button class="btn-submit" onclick="retryGetKey()">
        <i class="fa-solid fa-rotate-left"></i> Thử Lại Lần Nữa
      </button>
    </div>
  `;
}

// 9. Kiểm tra Key
function setupKeyChecker() {
  const form = document.getElementById('check-key-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyInput = document.getElementById('check-key-input');
    const resultBox = document.getElementById('check-key-result');
    const keyVal = keyInput.value.trim();

    if (!keyVal) return;

    resultBox.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 16px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tra cứu...</div>`;

    try {
      const res = await fetch('/api/keys/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyVal })
      });
      const data = await res.json();

      if (!data.found) {
        resultBox.innerHTML = `
          <div style="background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: 16px; margin-top: 16px; color: var(--accent-rose); text-align: center;">
            <i class="fa-solid fa-circle-xmark"></i> Khóa không tồn tại hoặc đã bị xóa khỏi hệ thống!
          </div>
        `;
        return;
      }

      if (data.isExpired) {
        resultBox.innerHTML = `
          <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 16px; margin-top: 16px; color: var(--accent-amber); text-align: center;">
            <i class="fa-solid fa-clock-rotate-left"></i> Khóa này <strong>ĐÃ HẾT HẠN</strong> sử dụng! Vui lòng nhận key mới.
          </div>
        `;
      } else {
        const hoursLeft = Math.floor(data.remainingMinutes / 60);
        const minsLeft = data.remainingMinutes % 60;
        const expireStr = data.expiresAt ? new Date(data.expiresAt).toLocaleString('vi-VN') : 'Không giới hạn';

        resultBox.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 18px; margin-top: 16px; color: var(--accent-emerald);">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 8px;">
              <i class="fa-solid fa-circle-check"></i> Khóa HỢP LỆ VÀ ĐANG HOẠT ĐỘNG!
            </div>
            <div style="font-size: 13.5px; color: var(--text-muted); line-height: 1.6;">
              <div>• Còn lại: <strong style="color: #fff;">${hoursLeft} giờ ${minsLeft} phút</strong></div>
              <div>• Hết hạn lúc: <strong>${expireStr}</strong></div>
            </div>
          </div>
        `;
      }
    } catch (err) {
      resultBox.innerHTML = `<div style="color: var(--accent-rose); text-align: center; margin-top: 12px;">Lỗi kết nối máy chủ!</div>`;
    }
  });
}

// Tiện ích
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Đã sao chép khóa vào bộ nhớ tạm!');
  }).catch(() => {
    alert('Khóa của bạn: ' + text);
  });
}

function showToast(message) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #00f0ff;
      color: #000;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 999px;
      box-shadow: 0 10px 25px rgba(0, 240, 255, 0.4);
      z-index: 999999;
      font-size: 13.5px;
      animation: fadeIn 0.2s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
