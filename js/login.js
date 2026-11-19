/**
 * AquaPlants - Login conectado a FastAPI Backend
 * Autenticación real con JWT y manejo de errores.
 */

const API_BASE_URL = window.AQUAPLANTS_API_BASE || '';
const TOKEN_KEY = 'aquaplants_token';

function init() {
  const form = document.getElementById('loginForm');
  const inputUser = document.getElementById('username');
  const inputPass = document.getElementById('password');
  const togglePass = document.getElementById('togglePass');
  const eyeIcon = document.getElementById('eyeIcon');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnArrow = document.getElementById('btnArrow');
  const alertBox = document.getElementById('alert');
  const alertMsg = document.getElementById('alertMsg');

  function showAlert(message, type = 'error') {
    alertBox.classList.remove('error', 'warn', 'success', 'show');
    alertBox.classList.add(type, 'show');
    alertMsg.textContent = message;
  }

  function hideAlert() {
    alertBox.classList.remove('show');
  }

  function setFieldError(input, hasError) {
    input.classList.toggle('error', hasError);
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    if (isLoading) {
      btnText.textContent = 'Verificando...';
      btnArrow.style.display = 'none';
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      spinner.id = 'spinner';
      submitBtn.appendChild(spinner);
    } else {
      btnText.textContent = 'Iniciar sesión';
      btnArrow.style.display = '';
      const spinner = document.getElementById('spinner');
      if (spinner) spinner.remove();
    }
  }

  async function authenticate(username, password) {
    try {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Credenciales inválidas');
        }
        return await response.json();
    } catch (error) {
        console.error('Error de autenticación:', error);
        throw error;
    }
}
  const recoveryPanel = document.getElementById('recoveryPanel');
  const recoveryBackBtn = document.getElementById('recoveryBackBtn');
  const recoveryForm = document.getElementById('recoveryForm');
  const recoveryId = document.getElementById('recoveryId');
  const recoveryCode = document.getElementById('recoveryCode');
  const recoveryPassword = document.getElementById('recoveryPassword');
  const recoveryPassword2 = document.getElementById('recoveryPassword2');
  const recoveryStep1 = document.getElementById('recoveryStep1');
  const recoveryStep2 = document.getElementById('recoveryStep2');
  const recoveryStep3 = document.getElementById('recoveryStep3');
  const recoveryHint = document.getElementById('recoveryHint');
  const recoverySendBtn = document.getElementById('recoverySendBtn');
  const recoveryVerifyBtn = document.getElementById('recoveryVerifyBtn');
  const recoveryResetBtn = document.getElementById('recoveryResetBtn');
  const recoveryResendBtn = document.getElementById('recoveryResendBtn');
  const recoveryChangeBtn = document.getElementById('recoveryChangeBtn');
  const recoveryTimer = document.getElementById('recoveryTimer');
  const recoveryDev = document.getElementById('recoveryDev');
  const recoveryDevCode = document.getElementById('recoveryDevCode');
  const recoveryDevCodeWrap = document.getElementById('recoveryDevCodeWrap');
  const recoveryDevLink = document.getElementById('recoveryDevLink');
  const recoveryDevLinkWrap = document.getElementById('recoveryDevLinkWrap');
  const recoveryLinkBtn = document.getElementById('recoveryLinkBtn');
  const recoveryCodeWrap = document.getElementById('recoveryCodeWrap');
  const recoveryLinkInfo = document.getElementById('recoveryLinkInfo');
  const RECOVERY_RESEND_SECONDS = 60;
  let recoveryIdentificador = '';
  let recoveryMetodo = 'codigo';
  let resetToken = '';
  let recoveryExpiresAt = 0;
  let recoveryResendAt = 0;
  let recoveryTick = null;

  async function apiPost(path, body) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || 'No se pudo completar la solicitud.');
    }
    return data;
  }

  function setRecoveryStep(step) {
    [recoveryStep1, recoveryStep2, recoveryStep3].forEach((element, index) => {
      if (element) element.style.display = index + 1 === step ? 'block' : 'none';
    });
    document.querySelectorAll('.recovery-step').forEach((element) => {
      const value = Number(element.dataset.step);
      element.classList.toggle('is-active', value === step);
      element.classList.toggle('is-done', value < step);
      if (value === step) {
        element.setAttribute('aria-current', 'step');
      } else {
        element.removeAttribute('aria-current');
      }
    });
  }

  function formatSeconds(total) {
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function updateRecoveryTimer() {
    const now = Date.now();
    const etiqueta = recoveryMetodo === 'link' ? 'El enlace vence' : 'El código vence';
    if (recoveryTimer) {
      if (recoveryExpiresAt) {
        const remaining = Math.max(0, Math.ceil((recoveryExpiresAt - now) / 1000));
        if (remaining > 0) {
          recoveryTimer.textContent = `${etiqueta} en ${formatSeconds(remaining)}.`;
          recoveryTimer.classList.remove('is-expired');
        } else {
          recoveryTimer.textContent = recoveryMetodo === 'link'
            ? 'El enlace expiró. Solicita uno nuevo.'
            : 'El código expiró. Solicita uno nuevo.';
          recoveryTimer.classList.add('is-expired');
        }
      } else {
        recoveryTimer.textContent = '';
        recoveryTimer.classList.remove('is-expired');
      }
    }
    if (recoveryResendBtn) {
      const wait = Math.max(0, Math.ceil((recoveryResendAt - now) / 1000));
      const verbo = recoveryMetodo === 'link' ? 'Reenviar enlace' : 'Reenviar código';
      recoveryResendBtn.disabled = wait > 0;
      recoveryResendBtn.textContent = wait > 0 ? `Reenviar en ${wait}s` : verbo;
    }
  }

  function startRecoveryTimers(expiresIn) {
    const now = Date.now();
    recoveryExpiresAt = now + (Number(expiresIn) || 600) * 1000;
    recoveryResendAt = now + RECOVERY_RESEND_SECONDS * 1000;
    updateRecoveryTimer();
    if (recoveryTick) clearInterval(recoveryTick);
    recoveryTick = setInterval(updateRecoveryTimer, 1000);
  }

  function stopRecoveryTimers() {
    if (recoveryTick) clearInterval(recoveryTick);
    recoveryTick = null;
    recoveryExpiresAt = 0;
    recoveryResendAt = 0;
    updateRecoveryTimer();
  }

  function mostrarAyudaDesarrollo(code, link) {
    const hasAyuda = Boolean(code || link);
    if (recoveryDev) recoveryDev.hidden = !hasAyuda;
    if (recoveryDevCode) recoveryDevCode.textContent = code || '';
    if (recoveryDevCodeWrap) recoveryDevCodeWrap.hidden = !code;
    if (recoveryDevLinkWrap) recoveryDevLinkWrap.hidden = !link;
    if (recoveryDevLink && link) {
      recoveryDevLink.href = link;
      recoveryDevLink.textContent = 'Abrir enlace de recuperación';
    }
    if (code && recoveryCode) recoveryCode.value = code;
  }

  function mostrarCodigoDesarrollo(code) {
    mostrarAyudaDesarrollo(code, '');
  }

  function mostrarEnlaceDesarrollo(link) {
    mostrarAyudaDesarrollo('', link);
  }

  function applyRecoveryMethod(metodo) {
    recoveryMetodo = metodo === 'link' ? 'link' : 'codigo';
    if (recoveryCodeWrap) {
      recoveryCodeWrap.style.display = recoveryMetodo === 'codigo' ? '' : 'none';
    }
    if (recoveryLinkInfo) recoveryLinkInfo.hidden = recoveryMetodo !== 'link';
    if (recoveryVerifyBtn) {
      recoveryVerifyBtn.style.display = recoveryMetodo === 'codigo' ? '' : 'none';
    }
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.label) button.dataset.label = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  function showRecovery() {
    const formEl = document.getElementById('loginForm');
    const headEl = document.getElementById('loginHead');
    if (formEl) formEl.style.display = 'none';
    if (headEl) headEl.style.display = 'none';
    if (recoveryPanel) recoveryPanel.style.display = 'block';
    setRecoveryStep(1);
    recoveryIdentificador = '';
    resetToken = '';
    if (recoveryCode) recoveryCode.value = '';
    if (recoveryPassword) recoveryPassword.value = '';
    if (recoveryPassword2) recoveryPassword2.value = '';
    if (recoveryHint) recoveryHint.textContent = 'Te enviaremos un código o enlace a tu correo o teléfono de respaldo.';
    applyRecoveryMethod('codigo');
    mostrarCodigoDesarrollo('');
    stopRecoveryTimers();
    hideAlert();
  }

  function showLogin() {
    const formEl = document.getElementById('loginForm');
    const headEl = document.getElementById('loginHead');
    if (formEl) formEl.style.display = 'block';
    if (headEl) headEl.style.display = '';
    if (recoveryPanel) recoveryPanel.style.display = 'none';
    stopRecoveryTimers();
    applyRecoveryMethod('codigo');
    setRecoveryStep(1);
  }

  async function solicitarCodigo(isResend = false) {
    const identificador = (recoveryId && recoveryId.value ? recoveryId.value : recoveryIdentificador).trim();
    if (identificador.length < 3) {
      showAlert('Ingresa tu usuario o correo.', 'error');
      return;
    }
    setButtonLoading(isResend ? recoveryResendBtn : recoverySendBtn, true, 'Enviando...');
    try {
      const data = await apiPost('/api/auth/forgot-password', { identificador });
      recoveryIdentificador = identificador;
      applyRecoveryMethod('codigo');
      if (!isResend) {
        setRecoveryStep(2);
        if (recoveryCode) {
          recoveryCode.value = '';
          recoveryCode.focus();
        }
      }
      mostrarCodigoDesarrollo(data.dev_code || '');
      if (recoveryHint) {
        recoveryHint.textContent = data.dev_code
          ? 'Modo desarrollo: usá el código que aparece abajo.'
          : 'Revisá tu correo o teléfono de respaldo, incluida la carpeta de spam.';
      }
      startRecoveryTimers(data.expires_in);
      showAlert(
        data.dev_code
          ? 'Código generado en modo desarrollo.'
          : (data.message || 'Si los datos coinciden, enviamos un código a tu cuenta de respaldo.'),
        'success'
      );
    } catch (error) {
      showAlert(error.message || 'No se pudo enviar el código.', 'error');
    } finally {
      setButtonLoading(isResend ? recoveryResendBtn : recoverySendBtn, false);
      updateRecoveryTimer();
    }
  }

  async function solicitarEnlace(isResend = false) {
    const identificador = (recoveryId && recoveryId.value ? recoveryId.value : recoveryIdentificador).trim();
    if (identificador.length < 3) {
      showAlert('Ingresa tu usuario o correo.', 'error');
      return;
    }
    setButtonLoading(isResend ? recoveryResendBtn : recoveryLinkBtn, true, 'Enviando...');
    try {
      const data = await apiPost('/api/auth/forgot-password', {
        identificador,
        metodo: 'link'
      });
      recoveryIdentificador = identificador;
      applyRecoveryMethod('link');
      if (!isResend) setRecoveryStep(2);
      mostrarEnlaceDesarrollo(data.dev_link || '');
      if (recoveryHint) {
        recoveryHint.textContent = data.dev_link
          ? 'Modo desarrollo: abrí el enlace que aparece abajo.'
          : 'Revisá tu correo de respaldo, incluida la carpeta de spam.';
      }
      startRecoveryTimers(data.expires_in);
      showAlert(
        data.dev_link
          ? 'Enlace generado en modo desarrollo.'
          : (data.message || 'Si los datos coinciden, enviamos un enlace a tu cuenta de respaldo.'),
        'success'
      );
    } catch (error) {
      showAlert(error.message || 'No se pudo enviar el enlace.', 'error');
    } finally {
      setButtonLoading(isResend ? recoveryResendBtn : recoveryLinkBtn, false);
      updateRecoveryTimer();
    }
  }

  async function verificarEnlace(token) {
    showRecovery();
    applyRecoveryMethod('link');
    if (recoveryHint) recoveryHint.textContent = 'Validando enlace de recuperación...';
    try {
      const data = await apiPost('/api/auth/verify-reset-link', { reset_token: token });
      resetToken = data.reset_token;
      stopRecoveryTimers();
      setRecoveryStep(3);
      if (recoveryPassword) recoveryPassword.focus();
      showAlert('Enlace verificado. Define tu nueva contraseña.', 'success');
    } catch (error) {
      setRecoveryStep(1);
      if (recoveryHint) {
        recoveryHint.textContent = 'Te enviaremos un código o enlace a tu correo o teléfono de respaldo.';
      }
      showAlert(error.message || 'El enlace no es válido o expiró.', 'error');
    } finally {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('reset_token');
        url.searchParams.delete('recuperar');
        window.history.replaceState({}, '', url.toString());
      } catch (error) {
        console.error('No se pudo limpiar el enlace de recuperación:', error);
      }
    }
  }

  async function verificarCodigo() {
    const codigo = (recoveryCode && recoveryCode.value ? recoveryCode.value : '').trim();
    if (!/^\d{6}$/.test(codigo)) {
      showAlert('El código debe tener 6 dígitos.', 'error');
      return;
    }
    setButtonLoading(recoveryVerifyBtn, true, 'Verificando...');
    try {
      const data = await apiPost('/api/auth/verify-reset-code', {
        identificador: recoveryIdentificador,
        codigo
      });
      resetToken = data.reset_token;
      stopRecoveryTimers();
      setRecoveryStep(3);
      if (recoveryPassword) recoveryPassword.focus();
      showAlert('Código verificado. Define tu nueva contraseña.', 'success');
    } catch (error) {
      showAlert(error.message || 'Código inválido o expirado.', 'error');
    } finally {
      setButtonLoading(recoveryVerifyBtn, false);
    }
  }

  async function actualizarPassword() {
    const password = recoveryPassword ? recoveryPassword.value : '';
    const password2 = recoveryPassword2 ? recoveryPassword2.value : '';
    if (password.length < 12) {
      showAlert('La nueva contraseña debe tener al menos 12 caracteres.', 'error');
      return;
    }
    if (password !== password2) {
      showAlert('Las contraseñas no coinciden.', 'error');
      return;
    }
    if (!resetToken) {
      showAlert('Vuelve a solicitar el código de recuperación.', 'error');
      setRecoveryStep(1);
      return;
    }
    setButtonLoading(recoveryResetBtn, true, 'Actualizando...');
    try {
      const data = await apiPost('/api/auth/reset-password', {
        reset_token: resetToken,
        new_password: password
      });
      stopRecoveryTimers();
      mostrarCodigoDesarrollo('');
      showAlert(data.message || 'Contraseña actualizada correctamente.', 'success');
      setTimeout(() => {
        showLogin();
        if (inputUser && recoveryIdentificador.indexOf('@') === -1) {
          inputUser.value = recoveryIdentificador;
        }
      }, 1500);
    } catch (error) {
      showAlert(error.message || 'No se pudo actualizar la contraseña.', 'error');
    } finally {
      setButtonLoading(recoveryResetBtn, false);
    }
  }

  if (document.getElementById('forgotLink')) {
    document.getElementById('forgotLink').addEventListener('click', function (e) {
      e.preventDefault();
      showRecovery();
    });
  }

  if (recoveryBackBtn) {
    recoveryBackBtn.addEventListener('click', showLogin);
  }

  if (recoveryResendBtn) {
    recoveryResendBtn.addEventListener('click', function () {
      if (recoveryMetodo === 'link') {
        solicitarEnlace(true);
      } else {
        solicitarCodigo(true);
      }
    });
  }

  if (recoveryLinkBtn) {
    recoveryLinkBtn.addEventListener('click', function () {
      solicitarEnlace(false);
    });
  }

  if (recoveryChangeBtn) {
    recoveryChangeBtn.addEventListener('click', function () {
      stopRecoveryTimers();
      applyRecoveryMethod('codigo');
      mostrarCodigoDesarrollo('');
      recoveryIdentificador = '';
      resetToken = '';
      if (recoveryCode) recoveryCode.value = '';
      if (recoveryHint) recoveryHint.textContent = 'Te enviaremos un código o enlace a tu correo o teléfono de respaldo.';
      setRecoveryStep(1);
      if (recoveryId) {
        recoveryId.value = '';
        recoveryId.focus();
      }
      hideAlert();
    });
  }

  if (recoveryCode) {
    recoveryCode.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 6);
    });
  }

  if (recoveryForm) {
    recoveryForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (recoveryStep1 && recoveryStep1.style.display !== 'none') {
        solicitarCodigo(false);
      } else if (recoveryStep2 && recoveryStep2.style.display !== 'none') {
        if (recoveryMetodo === 'codigo') verificarCodigo();
      } else {
        actualizarPassword();
      }
    });
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const enlace = params.get('reset_token');
    if (enlace) {
      verificarEnlace(enlace);
    } else if (params.get('recuperar') === '1') {
      showRecovery();
    }
  } catch (error) {
    console.error('No se pudo abrir la recuperación:', error);
  }

  function startSession(token) {
    const remember = document.getElementById('remember');
    const persistent = !!(remember && remember.checked);
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (persistent) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
    }
  }

  // Toggle mostrar/ocultar contraseña
  togglePass.addEventListener('click', () => {
    const isPass = inputPass.type === 'password';
    inputPass.type = isPass ? 'text' : 'password';
    eyeIcon.innerHTML = isPass
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  });

  inputUser.addEventListener('input', () => {
    hideAlert();
    setFieldError(inputUser, false);
  });

  inputPass.addEventListener('input', () => {
    hideAlert();
    setFieldError(inputPass, false);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const username = inputUser.value.trim();
    const password = inputPass.value;

    if (!username || !password) {
      showAlert('Por favor ingresa usuario y contraseña.', 'error');
      setFieldError(inputUser, !username);
      setFieldError(inputPass, !password);
      return;
    }

    setLoading(true);

    try {
      // Llamada real al backend FastAPI
      const data = await authenticate(username, password);

      // Guardar token JWT
      startSession(data.access_token);

      showAlert('¡Acceso concedido!', 'success');

      const role = (data.user && data.user.role ? data.user.role : 'encargado').toLowerCase();
      const routes = {
        admin: 'pages/dashboard-admin.html',
        administrador: 'pages/dashboard-admin.html',
        supervisor: 'pages/dashboard-supervisor.html',
        encargado: 'pages/dashboard-encargado.html'
      };

      setTimeout(() => {
        window.location.href = routes[role] || 'pages/dashboard.html';
      }, 800);

    } catch (error) {
      showAlert(error.message || 'Credenciales inválidas.', 'error');
      setFieldError(inputUser, true);
      setFieldError(inputPass, true);
      inputPass.value = '';
    }

    setLoading(false);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Helper para resetear login (útil en desarrollo)
window.resetLogin = () => {
  localStorage.clear();
  sessionStorage.clear();
  location.reload();
};