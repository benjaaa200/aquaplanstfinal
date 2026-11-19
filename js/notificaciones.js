(function () {
  'use strict';

  var state = {
    notificaciones: [],
    usuarios: []
  };

  var CATEGORIAS = {
    sistema: ['ph-gear', 'neutral'],
    riego: ['ph-drop', 'info'],
    sensores: ['ph-cpu', 'info'],
    alerta: ['ph-warning', 'danger'],
    incidencia: ['ph-warning-octagon', 'danger'],
    mantenimiento: ['ph-wrench', 'warning'],
    inspeccion: ['ph-magnifying-glass', 'info'],
    inventario: ['ph-package', 'warning'],
    tarea: ['ph-check-square', 'info'],
    calendario: ['ph-calendar', 'info'],
    equipo: ['ph-users', 'neutral'],
    clima: ['ph-cloud-sun', 'info']
  };

  function categoriaMeta(categoria) {
    return CATEGORIAS[categoria] || ['ph-bell', 'neutral'];
  }

  function prioridadPill(prioridad) {
    var valor = String(prioridad || 'info');
    var clase = valor === 'urgente' ? 'danger' : (valor === 'importante' ? 'warning' : 'info');
    return '<span class="ops-pill ' + clase + '">' + Ops.escape(Ops.categoriaLabel(valor)) + '</span>';
  }

  function cargarUsuarios() {
    if (!Ops.esAdmin()) return Promise.resolve();
    return Ops.get('/equipo/').catch(function () { return []; }).then(function (rows) {
      state.usuarios = rows || [];
      var select = document.getElementById('sendUsuarios');
      select.innerHTML = state.usuarios.map(function (usuario) {
        return '<option value="' + usuario.id + '">' + Ops.escape(usuario.nombre_completo || usuario.username) + '</option>';
      }).join('');
    });
  }

  function cargar() {
    var params = [];
    var categoria = document.getElementById('notifCategoria').value;
    var prioridad = document.getElementById('notifPrioridad').value;
    if (categoria) params.push('categoria=' + encodeURIComponent(categoria));
    if (prioridad) params.push('prioridad=' + encodeURIComponent(prioridad));
    if (document.getElementById('notifNoLeidas').checked) params.push('leida=false');
    Ops.get('/notificaciones/' + (params.length ? '?' + params.join('&') : '')).then(function (rows) {
      state.notificaciones = rows || [];
      render();
      cargarResumen();
    }).catch(function (error) {
      document.getElementById('notifList').innerHTML = Ops.vacio('No se pudieron cargar las notificaciones', error.message);
      showToast(error.message, 'error');
    });
  }

  function cargarResumen() {
    Ops.get('/notificaciones/resumen').then(function (data) {
      if (!data) return;
      document.getElementById('notifKPIs').innerHTML =
        '<div class="ops-card"><div class="ops-muted">Total</div><div class="stat-value">' + (data.total || 0) + '</div><div class="ops-small">notificaciones recibidas</div></div>' +
        '<div class="ops-card"><div class="ops-muted">No leídas</div><div class="stat-value">' + (data.no_leidas || 0) + '</div><div class="ops-small">pendientes de revisar</div></div>' +
        '<div class="ops-card"><div class="ops-muted">Urgentes</div><div class="stat-value">' + (data.urgentes || 0) + '</div><div class="ops-small">importantes o urgentes sin leer</div></div>';
    });
  }

  function render() {
    var list = document.getElementById('notifList');
    if (!state.notificaciones.length) {
      list.innerHTML = Ops.vacio('Sin notificaciones', 'Cuando ocurran eventos relevantes aparecerán aquí.');
      return;
    }
    list.innerHTML = state.notificaciones.map(function (item) {
      var meta = categoriaMeta(item.categoria);
      return '<article class="notification-item' + (item.leida ? '' : ' unread') + '" data-id="' + item.id + '">' +
        '<div class="notification-icon ' + meta[1] + '"><i class="ph ' + meta[0] + '"></i></div>' +
        '<div class="notification-main">' +
          '<div class="notification-title"><strong>' + Ops.escape(item.titulo) + '</strong>' +
          prioridadPill(item.prioridad) + '</div>' +
          '<p>' + Ops.escape(item.mensaje) + '</p>' +
          '<div class="notification-meta">' +
            '<span class="ops-pill neutral">' + Ops.escape(Ops.categoriaLabel(item.categoria)) + '</span>' +
            '<span>' + Ops.fechaHora(item.fecha_creacion) + '</span>' +
            (item.leida ? '' : '<span class="notif-unread-dot">Nueva</span>') +
          '</div>' +
        '</div>' +
        '<div class="notification-actions">' +
          (item.url ? '<a class="btn-secondary btn-small" href="' + Ops.escape(item.url) + '"><i class="ph ph-arrow-square-out"></i> Abrir</a>' : '') +
          (item.leida ? '' : '<button type="button" class="btn-secondary btn-small" data-read="' + item.id + '">Marcar leída</button>') +
          '<button type="button" class="btn-icon" data-delete="' + item.id + '" title="Eliminar"><i class="ph ph-trash"></i></button>' +
        '</div>' +
      '</article>';
    }).join('');
    list.querySelectorAll('[data-read]').forEach(function (button) {
      button.addEventListener('click', function () {
        marcarLeida(Number(button.getAttribute('data-read')));
      });
    });
    list.querySelectorAll('[data-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        eliminar(Number(button.getAttribute('data-delete')));
      });
    });
  }

  function marcarLeida(id) {
    Ops.put('/notificaciones/' + id + '/leer').then(function () {
      cargar();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function eliminar(id) {
    Ops.confirmar('¿Eliminar esta notificación?').then(function (ok) {
      if (!ok) return;
      Ops.del('/notificaciones/' + id).then(function () {
        showToast('Notificación eliminada.', 'success');
        cargar();
      }).catch(function (error) { showToast(error.message, 'error'); });
    });
  }

  function marcarTodas() {
    Ops.put('/notificaciones/marcar-todas').then(function (data) {
      showToast(data && data.updated !== undefined ? data.updated + ' notificaciones marcadas.' : 'Notificaciones actualizadas.', 'success');
      cargar();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function abrirEnvio() {
    document.getElementById('sendForm').reset();
    Ops.abrirModal('sendModal');
  }

  function enviar(event) {
    event.preventDefault();
    var roles = Array.prototype.map.call(document.querySelectorAll('.sendRol:checked'), function (input) {
      return input.value;
    });
    var usuarioIds = Array.prototype.map.call(
      document.getElementById('sendUsuarios').selectedOptions,
      function (option) { return Number(option.value); }
    );
    if (!roles.length && !usuarioIds.length) {
      showToast('Selecciona al menos un rol o usuario destinatario.', 'error');
      return;
    }
    var payload = {
      titulo: document.getElementById('sendTitulo').value.trim(),
      mensaje: document.getElementById('sendMensaje').value.trim(),
      categoria: document.getElementById('sendCategoria').value,
      prioridad: document.getElementById('sendPrioridad').value,
      url: document.getElementById('sendUrl').value.trim() || null,
      roles: roles,
      usuario_ids: usuarioIds
    };
    Ops.post('/notificaciones/enviar', payload).then(function (data) {
      Ops.cerrarModal('sendModal');
      showToast('Comunicación enviada a ' + (data.destinatarios || 0) + ' usuarios.', 'success');
      cargar();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function init() {
    var user = Ops.usuario();
    if (!user) return;
    document.getElementById('notifSendBtn').hidden = !Ops.esAdmin();
    cargarUsuarios();
    cargar();
    document.getElementById('notifMarkAll').addEventListener('click', marcarTodas);
    document.getElementById('notifSendBtn').addEventListener('click', abrirEnvio);
    document.getElementById('sendForm').addEventListener('submit', enviar);
    ['notifCategoria', 'notifPrioridad'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', cargar);
    });
    document.getElementById('notifNoLeidas').addEventListener('change', cargar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
