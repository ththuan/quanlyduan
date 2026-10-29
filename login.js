/* ============================================================
   QLDA - Login page logic
   ============================================================ */

const AUTH_STORAGE_KEY = 'qlda_auth_session';

function getCookie(name) {
  const raw = document.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch (_) { return ''; }
  }
  return '';
}

function getStoredAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null'); }
  catch (_) { return null; }
}

function storeAuth(data) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    expiresAt: data.expiresAt,
    user: data.user
  }));
}

async function restoreExistingSession() {
  let res;
  try { res = await fetch('/api/me'); } catch (_) { return false; }
  if (!res.ok) {
    const refreshed = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCookie('qlda_csrf') }
    });
    if (!refreshed.ok) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return false;
    }
    storeAuth(await refreshed.json());
    res = await fetch('/api/me');
  }
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  if (user) storeAuth({ expiresAt: getStoredAuth()?.expiresAt, user });
  return true;
}

// Hoàn tất kiểm tra phiên cũ trước khi cho luồng đăng nhập ghi phiên mới.
const existingSessionCheck = (async function checkExistingSession() {
  try {
    if (await restoreExistingSession()) window.location.href = '/';
  } catch { /* ignore */ }
})();

// Toggle password visibility
const toggleBtn  = document.getElementById('toggle-pw');
const toggleIcon = document.getElementById('toggle-pw-icon');
const pwInput    = document.getElementById('f-password');

toggleBtn.addEventListener('click', () => {
  const isHidden = pwInput.type === 'password';
  pwInput.type       = isHidden ? 'text' : 'password';
  toggleIcon.textContent = isHidden ? 'visibility_off' : 'visibility';
});

// Toggle "Quên mật khẩu?" help box
const forgotLink = document.getElementById('forgot-link');
const adminHelp  = document.getElementById('admin-help');

forgotLink.addEventListener('click', () => {
  const show = adminHelp.classList.toggle('show');
  forgotLink.setAttribute('aria-expanded', show ? 'true' : 'false');
});

// Login form submit
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username   = document.getElementById('f-username').value.trim();
  const password   = document.getElementById('f-password').value;
  const errorEl    = document.getElementById('login-error');
  const errorText  = document.getElementById('login-error-text');
  const btnLogin   = document.getElementById('btn-login');
  const btnText    = document.getElementById('btn-login-text');

  // Hide error
  errorEl.classList.add('hidden');

  // Loading state
  btnLogin.disabled = true;
  btnText.textContent = 'Đang xử lý...';
  btnLogin.insertAdjacentHTML('afterbegin', '<span class="spinner" id="login-spinner"></span>');

  const showError = (msg) => {
    errorText.textContent = msg;
    errorEl.classList.remove('hidden');
    // Re-trigger animation
    errorEl.style.animation = 'none';
    errorEl.offsetHeight; // reflow
    errorEl.style.animation = '';
  };

  const resetBtn = () => {
    btnLogin.disabled = false;
    btnText.textContent = 'Đăng nhập';
    document.getElementById('login-spinner')?.remove();
  };

  try {
    await existingSessionCheck;
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showError(data.error || 'Sai tên đăng nhập hoặc mật khẩu');
      resetBtn();
      document.getElementById('f-password').value = '';
      document.getElementById('f-password').focus();
      return;
    }

    // Tài khoản mới thay phiên cũ trên đúng trình duyệt/profile này.
    storeAuth(data);
    if (data.user.mustChangePassword) {
      sessionStorage.setItem('qlda_force_pw', JSON.stringify({ id: data.user.id, username: data.user.username }));
    }
    btnText.textContent = 'Thành công!';
    setTimeout(() => { window.location.href = '/'; }, 400);

  } catch {
    showError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    resetBtn();
  }
});

// Đăng ký service worker (tách khỏi HTML để CSP chặn script inline).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
}
