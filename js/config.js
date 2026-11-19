/**
 * AquaPlants - Configuración de entorno del frontend.
 *
 * Prioridad para la URL de la API:
 * 1. <meta name="aquaplants-api-base" content="https://api.ejemplo.cl">
 * 2. window.AQUAPLANTS_API_BASE definida antes de este script.
 * 3. En local usa http://127.0.0.1:8000.
 * 4. En un dominio desplegado usa el mismo origen (proxy /api).
 */
(function () {
  var meta = document.querySelector('meta[name="aquaplants-api-base"]');
  var configured = (meta && meta.getAttribute('content')) || window.AQUAPLANTS_API_BASE || '';
  var host = window.location.hostname;
  var port = window.location.port;
  var local = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '';
  var base = configured;

  if (!base) {
    if (local) {
      base = 'http://127.0.0.1:8000';
    } else if (port === '5500' || port === '8000') {
      base = window.location.protocol + '//' + host + ':8000';
    } else {
      base = window.location.origin;
    }
  }

  base = String(base).replace(/\/+$/, '');
  window.AQUAPLANTS_API_BASE = base;
  window.AQUAPLANTS_API_URL = base + '/api';
})();
