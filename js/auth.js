/**
 * AquaPlants - Módulo de Autenticación (Vanilla JS)
 * Maneja la validación de sesión, decodificación de JWT y cierre de sesión.
 */

// Obtener el token del almacenamiento local
function getToken() {
    return localStorage.getItem('aquaplants_token') || sessionStorage.getItem('aquaplants_token');
}

// Decodificar el payload del JWT (sin validar firma, solo para leer datos en frontend)
function decodeJWT(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(function (c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                })
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Error al decodificar JWT:', error);
        return null;
    }
}

// Verificar autenticación y redirigir si no es válido
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '../index.html';
        return null;
    }

    const payload = decodeJWT(token);
    if (!payload) {
        clearSession();
        window.location.href = '../index.html';
        return null;
    }

    // Verificar expiración (exp viene en segundos, Date.now() en milisegundos)
    if (payload.exp && Date.now() >= payload.exp * 1000) {
        clearSession();
        alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
        window.location.href = '../index.html';
        return null;
    }

    return payload; // Retorna { sub: "username", role: "admin", exp: 1234567890 }
}

// Limpiar sesión y redirigir
function logout() {
    clearSession();
    window.location.href = '../index.html';
}

function clearSession() {
    localStorage.removeItem('aquaplants_token');
    sessionStorage.removeItem('aquaplants_token');
}

// Generar headers estándar para peticiones fetch autenticadas
function getAuthHeaders() {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

// Manejador global de errores de fetch (ej. 401 Unauthorized)
async function handleFetchResponse(response) {
    if (response.status === 401) {
        clearSession();
        window.location.href = '../index.html';
        throw new Error('Sesión no autorizada');
    }
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Error HTTP: ${response.status}`);
    }
    return response.json();
}

// ============================================================
// Puente de compatibilidad para los dashboards por rol.
// Los dashboards usan window.AquaAuth para autenticación y utilidades.
// ============================================================
(function () {
    const loginPath = function () {
        return /\/pages\/|\/admin\//.test(location.pathname) ? '../index.html' : 'index.html';
    };

    window.AquaAuth = {
        getUser() {
            const payload = decodeJWT(getToken());
            if (!payload) return null;
            return {
                username: payload.sub || payload.username,
                name: payload.name || payload.sub || payload.username,
                role: (payload.role || payload.rol || '').toLowerCase()
            };
        },

        requireAuth(allowedRoles = []) {
            const payload = this.getUser();
            if (!payload) {
                window.location.href = loginPath();
                return null;
            }

            if (allowedRoles.length > 0) {
                const allowed = allowedRoles.map((r) => String(r).toLowerCase());
                const role = (payload.role || '').toLowerCase();
                if (!allowed.includes(role)) {
                    const routes = {
                        admin: 'dashboard-admin.html',
                        administrador: 'dashboard-admin.html',
                        supervisor: 'dashboard-supervisor.html',
                        encargado: 'dashboard-encargado.html'
                    };
                    window.location.href = routes[role] || loginPath();
                    return null;
                }
            }

            return payload;
        },

        getToken,

        logout() {
            clearSession();
            window.location.href = loginPath();
        }
    };
})();