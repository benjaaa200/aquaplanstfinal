/* Utilidades compartidas por los módulos operativos de AquaPlants. */
(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fecha(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('es-CL');
  }

  function fechaHora(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function usuario() {
    try {
      if (window.AquaAuth) return window.AquaAuth.getUser();
      if (typeof checkAuth === 'function') return checkAuth();
    } catch (error) {
      console.error(error);
    }
    return null;
  }

  function rol() {
    var user = usuario();
    return ((user && user.role) || '').toLowerCase();
  }

  function esAdmin() {
    return ['admin', 'administrador'].indexOf(rol()) !== -1;
  }

  function esStaff() {
    return esAdmin() || rol() === 'supervisor';
  }

  function get(path) {
    return apiClient.get(path);
  }

  function post(path, data) {
    return apiClient.post(path, data);
  }

  function put(path, data) {
    return apiClient.put(path, data);
  }

  function patch(path, data) {
    return apiClient.patch(path, data);
  }

  function del(path) {
    return apiClient.delete(path);
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, wait || 250);
    };
  }

  function initModals() {
    document.addEventListener('click', function (event) {
      var closer = event.target.closest('[data-close-modal]');
      if (closer) {
        var modal = document.getElementById(closer.getAttribute('data-close-modal'));
        if (modal) modal.classList.remove('active');
      }
      if (event.target.classList && event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        Array.prototype.forEach.call(document.querySelectorAll('.modal.active'), function (modal) {
          modal.classList.remove('active');
        });
      }
    });
  }

  function abrirModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  function cerrarModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  function confirmar(mensaje, titulo) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal active';
      overlay.innerHTML =
        '<div class="modal-content" style="max-width:420px">' +
          '<div class="modal-header"><h2>' + escapeHtml(titulo || 'Confirmar acción') + '</h2></div>' +
          '<p style="font-size:13px;color:var(--g-text-soft);margin:0 0 18px">' + escapeHtml(mensaje) + '</p>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn-secondary" data-answer="no">Cancelar</button>' +
            '<button type="button" class="btn-primary" data-answer="yes">Confirmar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (event) {
        var answer = event.target.getAttribute('data-answer');
        if (answer) {
          document.body.removeChild(overlay);
          resolve(answer === 'yes');
        } else if (event.target === overlay) {
          document.body.removeChild(overlay);
          resolve(false);
        }
      });
    });
  }

  function vacio(titulo, mensaje) {
    return '<div class="ops-empty">' +
      '<i class="ph ph-plant"></i>' +
      '<h3>' + escapeHtml(titulo || 'Sin resultados') + '</h3>' +
      '<p>' + escapeHtml(mensaje || 'Todavía no hay registros para mostrar.') + '</p>' +
      '</div>';
  }

  var ESTADO_LABELS = {
    nueva: 'Nueva',
    pendiente_revision: 'Pendiente de revisión',
    asignada: 'Asignada',
    en_proceso: 'En proceso',
    resuelta: 'Resuelta',
    cerrada: 'Cerrada',
    pendiente: 'Pendiente',
    en_progreso: 'En progreso',
    en_revision: 'En revisión',
    completada: 'Completada',
    atrasada: 'Atrasada',
    cancelada: 'Cancelada',
    programado: 'Programado',
    en_ejecucion: 'En ejecución',
    completado: 'Completado',
    atrasado: 'Atrasado',
    cancelado: 'Cancelado',
    pendiente_aprobacion: 'Pendiente',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada'
  };

  function estadoPill(estado) {
    var valor = String(estado || '').toLowerCase();
    var clase = 'info';
    if (['resuelta', 'cerrada', 'completada', 'completado', 'aprobada'].indexOf(valor) !== -1) clase = '';
    if (['atrasada', 'atrasado', 'cancelada', 'cancelado', 'rechazada'].indexOf(valor) !== -1) clase = 'danger';
    if (['en_proceso', 'en_progreso', 'en_revision', 'en_ejecucion', 'pendiente_revision', 'asignada'].indexOf(valor) !== -1) clase = 'warning';
    return '<span class="ops-pill ' + clase + '">' + escapeHtml(ESTADO_LABELS[valor] || estado) + '</span>';
  }

  function prioridadPill(prioridad) {
    var valor = String(prioridad || 'media').toLowerCase();
    return '<span class="ops-pill priority-' + escapeHtml(valor) + '">' + escapeHtml(valor) + '</span>';
  }

  function categoriaLabel(valor) {
    return String(valor || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (char) { return char.toUpperCase(); });
  }

  function llenarSelect(select, items, config) {
    if (!select) return;
    config = config || {};
    var valueKey = config.value || 'id';
    var labelKey = config.label || 'nombre';
    var current = select.value;
    select.innerHTML = '<option value="">' + escapeHtml(config.placeholder || 'Todos') + '</option>';
    (items || []).forEach(function (item) {
      var option = document.createElement('option');
      option.value = item[valueKey];
      option.textContent = item[labelKey];
      select.appendChild(option);
    });
    if (current) select.value = current;
  }

  window.Ops = {
    escape: escapeHtml,
    fecha: fecha,
    fechaHora: fechaHora,
    usuario: usuario,
    rol: rol,
    esAdmin: esAdmin,
    esStaff: esStaff,
    get: get,
    post: post,
    put: put,
    patch: patch,
    del: del,
    params: params,
    debounce: debounce,
    abrirModal: abrirModal,
    cerrarModal: cerrarModal,
    confirmar: confirmar,
    vacio: vacio,
    estadoPill: estadoPill,
    prioridadPill: prioridadPill,
    categoriaLabel: categoriaLabel,
    llenarSelect: llenarSelect
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModals);
  } else {
    initModals();
  }
})();
