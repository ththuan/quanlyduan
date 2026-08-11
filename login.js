/* ============================================================
   QLDA - Login page logic
   ============================================================ */

// Redirect if already logged in
(async function checkExistingSession() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) window.location.href = '/';
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

    // Success — brief delay for UX
    if (data.mustChangePassword) {
      sessionStorage.setItem('qlda_force_pw', JSON.stringify({ id: data.id, username: data.username }));
    }
    btnText.textContent = 'Thành công!';
    setTimeout(() => { window.location.href = '/'; }, 400);

  } catch {
    showError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    resetBtn();
  }
});
