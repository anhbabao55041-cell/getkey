// Admin Panel Controller
let authToken = localStorage.getItem('admin_token') || '';

document.addEventListener('DOMContentLoaded', () => {
  initAdminNav();
  checkAuth();
  setupLoginForm();
  setupModals();
  setupFileForm();
  setupKeyForms();
  setupSettingsForm();
});

// 1. Điều hướng Tab Admin
function initAdminNav() {
  const menuBtns = document.querySelectorAll('.menu-btn[data-tab]');
  menuBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchAdminTab(tabId);
    });
  });
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));

  const btn = document.querySelector(`.menu-btn[data-tab="${tabId}"]`);
  const tab = document.getElementById(`tab-${tabId}`);

  if (btn) btn.classList.add('active');
  if (tab) tab.classList.add('active');

  // Tải dữ liệu tương ứng
  if (tabId === 'overview') loadOverview();
  else if (tabId === 'files') loadFiles();
  else if (tabId === 'keys') loadKeys();
  else if (tabId === 'settings') loadSettings();
  else if (tabId === 'logs') loadLogs();
}

// 2. Xác thực Admin
async function checkAuth() {
  try {
    const res = await fetch('/api/admin/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      document.getElementById('login-modal').style.display = 'none';
      switchAdminTab('overview');
    } else {
      document.getElementById('login-modal').style.display = 'flex';
    }
  } catch (err) {
    document.getElementById('login-modal').style.display = 'flex';
  }
}

function setupLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-password-input').value;
    const errorBox = document.getElementById('login-error');
    errorBox.innerText = '';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (data.success && data.token) {
        authToken = data.token;
        localStorage.setItem('admin_token', authToken);
        document.getElementById('login-modal').style.display = 'none';
        showToast('Đăng nhập quản trị viên thành công!', 'success');
        switchAdminTab('overview');
      } else {
        errorBox.innerText = data.message || 'Mật khẩu không chính xác!';
      }
    } catch (err) {
      errorBox.innerText = 'Lỗi kết nối máy chủ!';
    }
  });
}

function logout() {
  localStorage.removeItem('admin_token');
  fetch('/api/admin/logout', { method: 'POST' });
  window.location.reload();
}

// Helper fetch có kèm token
function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
  }
  options.headers['Authorization'] = `Bearer ${authToken}`;
  return fetch(url, options);
}

// 3. Tab: Tổng quan (Overview)
async function loadOverview() {
  try {
    const res = await authFetch('/api/admin/stats');
    const data = await res.json();
    if (data.success) {
      const stats = data.stats;
      document.getElementById('stat-total-files').innerText = stats.totalFiles || 0;
      document.getElementById('stat-total-downloads').innerText = stats.totalDownloads || 0;
      document.getElementById('stat-unused-keys').innerText = stats.unusedKeys || 0;
      document.getElementById('stat-claimed-keys').innerText = stats.claimedKeys || 0;
      document.getElementById('stat-bypass-blocked').innerText = stats.bypassBlocked || 0;
      document.getElementById('stat-verifications').innerText = stats.totalVerifications || 0;
    }
  } catch (err) {
    console.error('Lỗi tải thống kê:', err);
  }
}

// 4. Tab: Quản lý Files
async function loadFiles() {
  const tbody = document.getElementById('files-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Đang tải...</td></tr>`;

  try {
    const res = await authFetch('/api/admin/files');
    const data = await res.json();
    if (data.success) {
      if (data.files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim);">Chưa có file nào</td></tr>`;
        return;
      }
      tbody.innerHTML = data.files.map(file => `
        <tr>
          <td><strong style="color: #fff;">${escapeHtml(file.title)}</strong></td>
          <td><span class="pill pill-info">${escapeHtml(file.version || 'v1.0')}</span></td>
          <td>${escapeHtml(file.fileSize || 'N/A')}</td>
          <td>${escapeHtml(file.category || 'General')}</td>
          <td>
            <span class="pill pill-success"><i class="fa-solid fa-bolt"></i> Trực Tiếp (Free)</span>
          </td>
          <td>${file.downloadCount || 0}</td>
          <td>
            <button class="btn-admin btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteFile('${file.id}')">
              <i class="fa-solid fa-trash"></i> Xóa
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--admin-danger); text-align: center;">Lỗi tải dữ liệu</td></tr>`;
  }
}

function setupFileForm() {
  const form = document.getElementById('add-file-form');
  const typeSelect = document.getElementById('file-source-type');
  const urlGroup = document.getElementById('direct-url-group');
  const uploadGroup = document.getElementById('upload-file-group');

  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'DIRECT_URL') {
        urlGroup.style.display = 'block';
        uploadGroup.style.display = 'none';
      } else {
        urlGroup.style.display = 'none';
        uploadGroup.style.display = 'block';
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerText = 'Đang lưu...';

      try {
        const res = await authFetch('/api/admin/files', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          showToast('Đã thêm file thành công!', 'success');
          closeModal('modal-add-file');
          form.reset();
          loadFiles();
        } else {
          alert('Lỗi: ' + data.message);
        }
      } catch (err) {
        alert('Lỗi kết nối máy chủ!');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Lưu File';
      }
    });
  }
}

async function deleteFile(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa file này?')) return;
  try {
    const res = await authFetch(`/api/admin/files/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa file!', 'success');
      loadFiles();
    } else {
      alert('Không thể xóa: ' + data.message);
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ!');
  }
}

// 5. Tab: Quản lý Keys
async function loadKeys() {
  const tbody = document.getElementById('keys-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Đang tải...</td></tr>`;

  try {
    const res = await authFetch('/api/admin/keys');
    const data = await res.json();
    if (data.success) {
      if (data.keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">Chưa có key nào trong kho</td></tr>`;
        return;
      }
      tbody.innerHTML = data.keys.map(k => {
        let statusPill = '';
        if (k.status === 'UNUSED') statusPill = `<span class="pill pill-success">CHƯA DÙNG</span>`;
        else if (k.status === 'CLAIMED') statusPill = `<span class="pill pill-info">ĐÃ CẤP</span>`;
        else statusPill = `<span class="pill pill-danger">${k.status}</span>`;

        const expireStr = k.expiresAt ? new Date(k.expiresAt).toLocaleString('vi-VN') : '---';

        return `
          <tr>
            <td>
              <code style="color: var(--admin-primary); font-family: var(--font-mono); font-weight: 600;">${escapeHtml(k.key)}</code>
              <button onclick="copyToClipboard('${escapeHtml(k.key)}')" style="background: none; border: none; color: var(--text-dim); cursor: pointer; margin-left: 6px;">
                <i class="fa-solid fa-copy"></i>
              </button>
            </td>
            <td>${statusPill}</td>
            <td>${k.durationHours || 24}h</td>
            <td>${expireStr}</td>
            <td><small>${escapeHtml(k.note || '---')}</small></td>
            <td>
              <button class="btn-admin btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteKey('${k.id}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--admin-danger); text-align: center;">Lỗi tải keys</td></tr>`;
  }
}

function setupKeyForms() {
  // Bulk Keys
  const bulkForm = document.getElementById('bulk-key-form');
  if (bulkForm) {
    bulkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const keysText = document.getElementById('bulk-keys-text').value;
      const durationHours = document.getElementById('bulk-duration').value;
      const note = document.getElementById('bulk-note').value;

      try {
        const res = await authFetch('/api/admin/keys', {
          method: 'POST',
          body: JSON.stringify({ mode: 'bulk', keysText, durationHours, note })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          closeModal('modal-add-keys');
          bulkForm.reset();
          loadKeys();
        } else {
          alert('Lỗi: ' + data.message);
        }
      } catch (err) {
        alert('Lỗi kết nối máy chủ!');
      }
    });
  }

  // Auto Generate Keys
  const genForm = document.getElementById('gen-key-form');
  if (genForm) {
    genForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const count = document.getElementById('gen-count').value;
      const prefix = document.getElementById('gen-prefix').value;
      const durationHours = document.getElementById('gen-duration').value;

      try {
        const res = await authFetch('/api/admin/keys', {
          method: 'POST',
          body: JSON.stringify({ mode: 'generate', count, prefix, durationHours })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          closeModal('modal-gen-keys');
          loadKeys();
        } else {
          alert('Lỗi: ' + data.message);
        }
      } catch (err) {
        alert('Lỗi kết nối máy chủ!');
      }
    });
  }
}

async function deleteKey(id) {
  if (!confirm('Xác nhận xóa mã key này?')) return;
  try {
    const res = await authFetch(`/api/admin/keys/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa key!', 'success');
      loadKeys();
    }
  } catch (err) {
    alert('Lỗi kết nối!');
  }
}

// 6. Tab: Cài đặt & Anti-Bypass Settings
async function loadSettings() {
  try {
    const res = await authFetch('/api/admin/settings');
    const data = await res.json();
    if (data.success) {
      const s = data.settings;
      document.getElementById('setting-link4m-key').value = s.link4mApiKey || '';
      document.getElementById('setting-hmac-secret').value = s.hmacSecret || '';
      document.getElementById('setting-min-wait').value = s.minWaitSeconds || 10;
      document.getElementById('setting-key-duration').value = s.keyDurationHours || 24;
      if (document.getElementById('setting-max-keys-ip')) {
        document.getElementById('setting-max-keys-ip').value = s.maxKeysPerIp || 2;
      }
      if (document.getElementById('setting-ip-limit-hours')) {
        document.getElementById('setting-ip-limit-hours').value = s.ipLimitHours || 24;
      }
      document.getElementById('setting-site-url').value = s.siteUrl || '';
    }
  } catch (err) {
    console.error('Lỗi tải cài đặt:', err);
  }
}

function setupSettingsForm() {
  const form = document.getElementById('settings-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const link4mApiKey = document.getElementById('setting-link4m-key').value;
    const hmacSecret = document.getElementById('setting-hmac-secret').value;
    const minWaitSeconds = document.getElementById('setting-min-wait').value;
    const keyDurationHours = document.getElementById('setting-key-duration').value;
    const maxKeysPerIp = document.getElementById('setting-max-keys-ip') ? document.getElementById('setting-max-keys-ip').value : 2;
    const ipLimitHours = document.getElementById('setting-ip-limit-hours') ? document.getElementById('setting-ip-limit-hours').value : 24;
    const siteUrl = document.getElementById('setting-site-url').value;
    const newAdminPassword = document.getElementById('setting-new-password').value;

    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          link4mApiKey,
          hmacSecret,
          minWaitSeconds,
          keyDurationHours,
          maxKeysPerIp,
          ipLimitHours,
          siteUrl,
          newAdminPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Đã lưu toàn bộ cấu hình thành công!', 'success');
        document.getElementById('setting-new-password').value = '';
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ!');
    }
  });
}

async function resetAllIpLimits() {
  if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử giới hạn IP? Các IP đã lấy đủ 2 lần sẽ được tính lại từ đầu.')) {
    return;
  }
  try {
    const res = await authFetch('/api/admin/ip-claims/reset', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Đã reset toàn bộ giới hạn IP!', 'success');
    } else {
      alert('Lỗi: ' + data.message);
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ!');
  }
}

function generateNewSecret() {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  document.getElementById('setting-hmac-secret').value = rand;
  showToast('Đã sinh khóa HMAC Secret mới! Hãy nhấn Lưu Cài Đặt.');
}

// 7. Tab: Logs / Anti-Bypass Monitor
async function loadLogs() {
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Đang tải lịch sử...</td></tr>`;

  try {
    const res = await authFetch('/api/admin/logs');
    const data = await res.json();
    if (data.success) {
      if (data.logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">Chưa có nhật ký nào</td></tr>`;
        return;
      }
      tbody.innerHTML = data.logs.map(l => {
        let pillClass = 'pill-info';
        if (l.status === 'SUCCESS') pillClass = 'pill-success';
        else if (l.status === 'BYPASS_BLOCKED') pillClass = 'pill-danger';
        else if (l.status === 'INVALID_HMAC' || l.status === 'TAMPERED_TOKEN') pillClass = 'pill-danger';
        else if (l.status === 'EXPIRED') pillClass = 'pill-warning';

        const timeStr = new Date(l.timestamp).toLocaleTimeString('vi-VN') + ' ' + new Date(l.timestamp).toLocaleDateString('vi-VN');

        return `
          <tr>
            <td><small style="color: var(--text-dim);">${timeStr}</small></td>
            <td><code style="color: #fff;">${escapeHtml(l.ip)}</code></td>
            <td><span class="pill ${pillClass}">${l.status}</span></td>
            <td>${l.timeTakenSeconds !== null ? `<strong>${l.timeTakenSeconds}s</strong>` : '---'}</td>
            <td>${escapeHtml(l.reason || '---')}</td>
            <td><small style="color: var(--text-dim);">${escapeHtml(l.userAgent ? l.userAgent.substring(0, 35) + '...' : '---')}</small></td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--admin-danger); text-align: center;">Lỗi tải nhật ký</td></tr>`;
  }
}

// 8. Modals Helper
function setupModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// 9. Toast Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}" style="color: ${type === 'success' ? 'var(--admin-success)' : 'var(--admin-danger)'};"></i>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Đã sao chép vào bộ nhớ tạm!', 'success');
  });
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
