(function () {
  'use strict';

  var state = {
    incidencias: [],
    sectores: [],
    cultivos: [],
    usuarios: [],
    userId: null,
    detalle: null
  };

  var ESTADOS = ['nueva', 'pendiente_revision', 'asignada', 'en_proceso', 'resuelta', 'cerrada'];

  function cargarOpciones() {
    return Promise.all([
      Ops.get('/instalaciones/').catch(function () { return []; }),
      Ops.get('/cultivos/').catch(function () { return []; }),
      Ops.get('/equipo/').catch(function () { return []; }),
      Ops.get('/auth/me').catch(function () { return null; })
    ]).then(function (results) {
      state.sectores = results[0] || [];
      state.cultivos = results[1] || [];
      state.usuarios = results[2] || [];
      state.userId = results[3] ? results[3].id : null;
      Ops.llenarSelect(document.getElementById('incSector'), state.sectores, { label: 'nombre', placeholder: 'Todos' });
      Ops.llenarSelect(document.getElementById('incSectorForm'), state.sectores, { label: 'nombre', placeholder: 'Selecciona un sector' });
      Ops.llenarSelect(document.getElementById('incCultivoForm'), state.cultivos, { label: 'nombre', placeholder: 'Sin cultivo' });
      var sectorParam = Ops.params().get('sector');
      if (sectorParam) document.getElementById('incSector').value = sectorParam;
    });
  }

  function cargar() {
    var params = [];
    ['incEstado:estado', 'incCategoria:categoria', 'incPrioridad:prioridad', 'incSector:sector_id'].forEach(function (pair) {
      var parts = pair.split(':');
      var value = document.getElementById(parts[0]).value;
      if (value) params.push(parts[1] + '=' + encodeURIComponent(value));
    });
    var buscar = document.getElementById('incBuscar').value.trim();
    if (buscar) params.push('buscar=' + encodeURIComponent(buscar));
    var path = '/incidencias/' + (params.length ? '?' + params.join('&') : '');
    document.getElementById('incList').innerHTML =
      '<div class="ops-empty"><i class="ph ph-circle-notch"></i><h3>Cargando incidencias…</h3></div>';
    return Ops.get(path).then(function (rows) {
      state.incidencias = rows || [];
      renderLista();
      cargarKPIs();
    }).catch(function (error) {
      document.getElementById('incList').innerHTML = Ops.vacio('No se pudieron cargar las incidencias', error.message);
      showToast(error.message, 'error');
    });
  }

  function cargarKPIs() {
    Ops.get('/incidencias/estadisticas').then(function (data) {
      if (!data) return;
      document.getElementById('incKPIs').innerHTML =
        '<div class="ops-card"><div class="ops-muted">Incidencias abiertas</div><div class="stat-value">' + (data.abiertas || 0) + '</div><div class="ops-small">de ' + data.total + ' registradas</div></div>' +
        '<div class="ops-card"><div class="ops-muted">Resueltas</div><div class="stat-value">' + (data.resueltas || 0) + '</div><div class="ops-small">' + (data.cerradas || 0) + ' cerradas</div></div>' +
        '<div class="ops-card"><div class="ops-muted">Prioridad crítica</div><div class="stat-value">' + ((data.por_prioridad && data.por_prioridad.critica) || 0) + '</div><div class="ops-small">requieren atención inmediata</div></div>';
    });
  }

  function renderLista() {
    var list = document.getElementById('incList');
    if (!state.incidencias.length) {
      list.innerHTML = Ops.vacio('Sin incidencias', 'No hay incidencias con estos filtros. Registra la primera para comenzar el seguimiento.');
      return;
    }
    list.innerHTML = state.incidencias.map(function (item) {
      return '<article class="incident-card" data-id="' + item.id + '">' +
        '<div>' +
          '<h4>' + Ops.escape(item.titulo) + '</h4>' +
          '<p>' + Ops.escape(item.descripcion) + '</p>' +
          '<div class="incident-meta">' +
            '<span class="ops-pill neutral">' + Ops.escape(Ops.categoriaLabel(item.categoria)) + '</span>' +
            '<span><i class="ph ph-map-pin"></i> ' + Ops.escape(item.sector_nombre || 'Sin sector') + '</span>' +
            (item.cultivo_nombre ? '<span><i class="ph ph-plant"></i> ' + Ops.escape(item.cultivo_nombre) + '</span>' : '') +
            '<span><i class="ph ph-user"></i> ' + Ops.escape(item.reportador_nombre || 'Sistema') + '</span>' +
            '<span><i class="ph ph-clock"></i> ' + Ops.fechaHora(item.fecha_creacion) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="incident-side">' +
          Ops.prioridadPill(item.prioridad) +
          Ops.estadoPill(item.estado) +
          (item.asignado_nombre ? '<span class="ops-small">' + Ops.escape(item.asignado_nombre) + '</span>' : '<span class="ops-small">Sin asignar</span>') +
        '</div>' +
      '</article>';
    }).join('');
    list.querySelectorAll('.incident-card').forEach(function (card) {
      card.addEventListener('click', function () {
        abrirDetalle(Number(card.getAttribute('data-id')));
      });
    });
  }

  function nueva() {
    document.getElementById('incModalTitle').textContent = 'Registrar incidencia';
    document.getElementById('incForm').reset();
    document.getElementById('incId').value = '';
    Ops.abrirModal('incModal');
  }

  function editar(item) {
    document.getElementById('incModalTitle').textContent = 'Editar incidencia';
    document.getElementById('incId').value = item.id;
    document.getElementById('incTitulo').value = item.titulo || '';
    document.getElementById('incDescripcion').value = item.descripcion || '';
    document.getElementById('incCategoriaForm').value = item.categoria || 'otros';
    document.getElementById('incPrioridadForm').value = item.prioridad || 'media';
    document.getElementById('incSectorForm').value = item.sector_id || '';
    document.getElementById('incCultivoForm').value = item.cultivo_id || '';
    Ops.cerrarModal('incDetailModal');
    Ops.abrirModal('incModal');
  }

  function guardar(event) {
    event.preventDefault();
    var id = document.getElementById('incId').value;
    var payload = {
      titulo: document.getElementById('incTitulo').value.trim(),
      descripcion: document.getElementById('incDescripcion').value.trim(),
      categoria: document.getElementById('incCategoriaForm').value,
      prioridad: document.getElementById('incPrioridadForm').value,
      sector_id: Number(document.getElementById('incSectorForm').value) || null,
      cultivo_id: Number(document.getElementById('incCultivoForm').value) || null
    };
    var action = id ? Ops.put('/incidencias/' + id, payload) : Ops.post('/incidencias/', payload);
    action.then(function () {
      Ops.cerrarModal('incModal');
      showToast(id ? 'Incidencia actualizada.' : 'Incidencia registrada.', 'success');
      cargar();
    }).catch(function (error) {
      showToast(error.message, 'error');
    });
  }

  function abrirDetalle(id) {
    document.getElementById('incDetailBody').innerHTML =
      '<div class="ops-empty"><i class="ph ph-circle-notch"></i><h3>Cargando incidencia…</h3></div>';
    Ops.abrirModal('incDetailModal');
    Ops.get('/incidencias/' + id).then(function (item) {
      state.detalle = item;
      renderDetalle(item);
    }).catch(function (error) {
      document.getElementById('incDetailBody').innerHTML = Ops.vacio('No se pudo cargar la incidencia', error.message);
    });
  }

  function renderDetalle(item) {
    var staff = Ops.esStaff();
    var puedeEstado = staff || item.asignado_a === state.userId;
    var puedeEditar = staff || (item.reportado_por === state.userId && ['nueva', 'pendiente_revision'].indexOf(item.estado) !== -1);
    var puedeEscalar = !Ops.esAdmin() && ['resuelta', 'cerrada'].indexOf(item.estado) === -1;
    var historial = (item.comentarios || []).length
      ? '<div class="timeline">' + item.comentarios.map(function (comentario) {
          return '<div class="timeline-item">' +
            '<strong>' + Ops.escape(comentario.usuario_nombre) + '</strong> ' +
            (comentario.estado_nuevo ? Ops.estadoPill(comentario.estado_nuevo) : '') +
            '<p>' + Ops.escape(comentario.comentario) + '</p>' +
            '<small>' + Ops.fechaHora(comentario.fecha_creacion) + '</small>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="ops-muted">Sin historial todavía.</p>';

    var controles = '';
    if (puedeEstado) {
      controles += '<div class="form-row" style="margin-top:14px">' +
        '<div class="form-group" style="flex:2"><label>Nuevo estado</label><select id="incEstadoDetalle">' +
          ESTADOS.map(function (estado) {
            return '<option value="' + estado + '"' + (item.estado === estado ? ' selected' : '') + '>' +
              Ops.estadoPill(estado).replace(/<[^>]+>/g, '') + '</option>';
          }).join('') +
        '</select></div>' +
        '<div class="form-group" style="flex:3"><label>Comentario de seguimiento</label><input type="text" id="incComentarioEstado" maxlength="2000" placeholder="Opcional"></div>' +
        '<div class="form-group" style="flex:0;display:flex;align-items:flex-end"><button type="button" class="btn-primary" id="incEstadoBtn">Actualizar</button></div>' +
      '</div>';
    }
    if (staff) {
      controles += '<div class="form-row">' +
        '<div class="form-group" style="flex:2"><label>Asignar responsable</label><select id="incAsignadoDetalle">' +
          '<option value="">Sin asignar</option>' +
          state.usuarios.map(function (usuario) {
            return '<option value="' + usuario.id + '"' + (item.asignado_a === usuario.id ? ' selected' : '') + '>' +
              Ops.escape(usuario.nombre_completo || usuario.username) + '</option>';
          }).join('') +
        '</select></div>' +
        '<div class="form-group" style="flex:0;display:flex;align-items:flex-end"><button type="button" class="btn-secondary" id="incAsignarBtn">Asignar</button></div>' +
      '</div>';
    }

    document.getElementById('incDetailBody').innerHTML =
      '<div class="ops-card-head"><div><h3>' + Ops.escape(item.titulo) + '</h3>' +
        '<div class="ops-muted">Registrada por ' + Ops.escape(item.reportador_nombre || 'Sistema') + ' · ' + Ops.fechaHora(item.fecha_creacion) + '</div></div>' +
        Ops.estadoPill(item.estado) + '</div>' +
      '<div class="ops-grid three" style="margin:14px 0">' +
        '<div><div class="ops-muted">Categoría</div><strong>' + Ops.escape(Ops.categoriaLabel(item.categoria)) + '</strong></div>' +
        '<div><div class="ops-muted">Prioridad</div>' + Ops.prioridadPill(item.prioridad) + '</div>' +
        '<div><div class="ops-muted">Sector</div><strong>' + Ops.escape(item.sector_nombre || 'Sin sector') + '</strong></div>' +
        '<div><div class="ops-muted">Cultivo</div><strong>' + Ops.escape(item.cultivo_nombre || '—') + '</strong></div>' +
        '<div><div class="ops-muted">Responsable</div><strong>' + Ops.escape(item.asignado_nombre || 'Sin asignar') + '</strong></div>' +
        '<div><div class="ops-muted">Resolución</div><strong>' + (item.fecha_resolucion ? Ops.fechaHora(item.fecha_resolucion) : 'Pendiente') + '</strong></div>' +
      '</div>' +
      '<p style="font-size:13px;color:var(--g-text-soft)">' + Ops.escape(item.descripcion) + '</p>' +
      (item.resolucion ? '<p class="ops-muted"><strong>Resolución:</strong> ' + Ops.escape(item.resolucion) + '</p>' : '') +
      controles +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
        (puedeEscalar ? '<button type="button" class="btn-primary" id="incEscalarBtn"><i class="ph ph-arrow-circle-up"></i> Escalar a administración</button>' : '') +
        (puedeEditar ? '<button type="button" class="btn-secondary" id="incEditBtn"><i class="ph ph-pencil-simple"></i> Editar</button>' : '') +
        (Ops.esAdmin() ? '<button type="button" class="btn-secondary" id="incDeleteBtn"><i class="ph ph-trash"></i> Eliminar</button>' : '') +
      '</div>' +
      '<hr style="border:none;border-top:1px solid var(--g-border);margin:18px 0">' +
      '<h3 style="font-size:14px;margin-bottom:12px">Historial y comentarios</h3>' +
      historial +
      '<form id="incCommentForm" style="margin-top:14px">' +
        '<div class="form-group"><label>Agregar comentario</label><textarea id="incComment" rows="2" maxlength="2000" required></textarea></div>' +
        '<button type="submit" class="btn-primary btn-small">Comentar</button>' +
      '</form>';

    var estadoBtn = document.getElementById('incEstadoBtn');
    if (estadoBtn) {
      estadoBtn.addEventListener('click', function () {
        Ops.put('/incidencias/' + item.id + '/estado', {
          estado: document.getElementById('incEstadoDetalle').value,
          comentario: document.getElementById('incComentarioEstado').value.trim() || null
        }).then(function () {
          showToast('Estado actualizado.', 'success');
          abrirDetalle(item.id);
          cargar();
        }).catch(function (error) { showToast(error.message, 'error'); });
      });
    }
    var asignarBtn = document.getElementById('incAsignarBtn');
    if (asignarBtn) {
      asignarBtn.addEventListener('click', function () {
        var asignado = Number(document.getElementById('incAsignadoDetalle').value) || null;
        Ops.put('/incidencias/' + item.id, { asignado_a: asignado }).then(function () {
          showToast(asignado ? 'Incidencia asignada.' : 'Asignación retirada.', 'success');
          abrirDetalle(item.id);
          cargar();
        }).catch(function (error) { showToast(error.message, 'error'); });
      });
    }
    var escalarBtn = document.getElementById('incEscalarBtn');
    if (escalarBtn) {
      escalarBtn.addEventListener('click', function () {
        Ops.confirmar('Se asignará a un administrador y subirá la prioridad. ¿Escalar la incidencia?', 'Escalar incidencia').then(function (ok) {
          if (!ok) return;
          escalarBtn.disabled = true;
          Ops.post('/incidencias/' + item.id + '/escalar', {}).then(function (actualizada) {
            state.detalle = actualizada;
            showToast('Incidencia escalada a administración.', 'success');
            renderDetalle(actualizada);
            cargar();
          }).catch(function (error) {
            escalarBtn.disabled = false;
            showToast(error.message, 'error');
          });
        });
      });
    }
    var editBtn = document.getElementById('incEditBtn');
    if (editBtn) editBtn.addEventListener('click', function () { editar(item); });
    var deleteBtn = document.getElementById('incDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        Ops.confirmar('¿Eliminar definitivamente la incidencia "' + item.titulo + '"?').then(function (ok) {
          if (!ok) return;
          Ops.del('/incidencias/' + item.id).then(function () {
            Ops.cerrarModal('incDetailModal');
            showToast('Incidencia eliminada.', 'success');
            cargar();
          }).catch(function (error) { showToast(error.message, 'error'); });
        });
      });
    }
    document.getElementById('incCommentForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var text = document.getElementById('incComment').value.trim();
      if (!text) return;
      Ops.post('/incidencias/' + item.id + '/comentarios', { comentario: text }).then(function () {
        showToast('Comentario agregado.', 'success');
        abrirDetalle(item.id);
      }).catch(function (error) { showToast(error.message, 'error'); });
    });
  }

  function init() {
    var user = Ops.usuario();
    if (!user) return;
    cargarOpciones().then(function () {
      cargar().then(function () {
        var id = Ops.params().get('id');
        if (id) abrirDetalle(Number(id));
      });
    });
    document.getElementById('incNewBtn').addEventListener('click', nueva);
    document.getElementById('incForm').addEventListener('submit', guardar);
    document.getElementById('incRefresh').addEventListener('click', cargar);
    ['incEstado', 'incCategoria', 'incPrioridad', 'incSector'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', cargar);
    });
    document.getElementById('incBuscar').addEventListener('input', Ops.debounce(cargar, 350));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
