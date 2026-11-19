/**
 * AquaPlants - Cliente API Centralizado
 * Maneja automáticamente el token JWT y los errores de autenticación.
 */

const API_BASE_URL = window.AQUAPLANTS_API_URL || '/api';

const apiClient = {
    /**
     * Realiza una petición fetch con headers de autenticación pre-configurados.
     * @param {string} endpoint - Ruta relativa (ej: '/mediciones/')
     * @param {object} options - Opciones de fetch (method, body, etc.)
     * @returns {Promise<any>} - Respuesta parseada como JSON
     */
    async request(endpoint, options = {}) {
        const token = localStorage.getItem('aquaplants_token') || sessionStorage.getItem('aquaplants_token');
        
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers
            });

            // Manejo global de sesión expirada o no autorizada
            if (response.status === 401) {
                localStorage.removeItem('aquaplants_token');
                sessionStorage.removeItem('aquaplants_token');
                console.warn('Sesión expirada o no autorizada. Redirigiendo al login...');
                window.location.href = '../index.html';
                throw new Error('Sesión no válida');
            }

            // Manejo de errores del servidor (4xx, 5xx)
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Error HTTP: ${response.status}`);
            }

            // Si la respuesta es 204 (No Content), retornar null
            if (response.status === 204) return null;

            return await response.json();

        } catch (error) {
            console.error(`[API Error] en ${endpoint}:`, error.message);
            throw error;
        }
    },

    // Métodos de conveniencia
    get: (endpoint) => apiClient.request(endpoint, { method: 'GET' }),
    post: (endpoint, data) => apiClient.request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
    put: (endpoint, data) => apiClient.request(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
    patch: (endpoint, data) => apiClient.request(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (endpoint) => apiClient.request(endpoint, { method: 'DELETE' })
};