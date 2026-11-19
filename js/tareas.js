(function () {
  'use strict';

  var state = {
    tareas: [],
    usuarios: [],
    sectores: [],
    cultivos: [],
    grupos: [],
    rol: '',
    view: 'kanban',
    userId: null,
    detail: null
  };

  var COLUMNS = [
    { estado: 'pendiente', titulo: 'Pendientes', match: ['pendiente', 'atrasada'] },
    { estado: 'en_progreso', titulo: 'En progreso', match: ['en_progreso'] },
    { estado: 'en_revision', titulo: 'En revisión', match: ['en_revision'] },
    { estado: 'completada', titulo: 'Completadas', match: ['completada', 'cancelada'] }
  ];

  var ESTADOS = ['pendiente', 'en_progreso', 'en_revision', 'completada', 'atrasada', 'cancelada'];

  function toLocalInput(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    var pad = function (part) { return String(part).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function responsablesDisponibles(usuarios, rol, grupos) {
    if (rol !== 'supervisor' || !grupos.length) return usuarios;
    var ids = {};
    grupos.forEach(function (grupo) {
      (grupo.miembros || []).forEach(function (miembro) { ids[miembro.id] = true; });
    });
    return usuarios.filter(function (usuario) {
      return ids[usuario.id] && String(usuario.rol || '').toLowerCase() === 'encargado';
    });
  }

  function actualizarHintResponsable() {
    var hint = document.getElementById('taskResponsableHint');
    if (!hint) return;
    if (state.rol !== 'supervisor') {
      hint.hidden = true;
      return;
    }
    hint.hidden = false;
    hint.textContent = state.grupos.length
      ? 'Solo se muestran encargados de tus grupos de trabajo.'
      : 'Aún no tienes grupos de trabajo; el administrador debe asignarte encargados.';
  }

  function cargarOpciones() {
    return Promise.all([
      Ops.get('/equipo/').catch(function () { return []; }),
      Ops.get('/instalaciones/').catch(function () { return []; }),
      Ops.get('/cultivos/').catch(function () { return []; }),
      Ops.get('/auth/me').catch(function () { return null; }),
      Ops.get('/grupos/').catch(function () { return []; })
    ]).then(function (results) {
      state.usuarios = results[0] || [];
      state.sectores = results[1] || [];
      state.cultivos = results[2] || [];
      state.grupos = results[4] || [];
      var user = results[3];
      state.userId = user ? user.id : null;
      state.rol = String((user && (user.role || user.rol)) || '').toLowerCase();
      state.usuarios = responsablesDisponibles(state.usuarios, state.rol, state.grupos);
      Ops.llenarSelect(document.getElementById('taskResponsable'), state.usuarios, { label: 'nombre_completo', placeholder: 'Todos' });
      Ops.llenarSelect(document.getElementById('taskSector'), state.sectores, { label: 'nombre', placeholder: 'Todos' });
      Ops.llenarSelect(document.getElementById('taskResponsableForm'), state.usuarios, { label: 'nombre_completo', placeholder: 'Sin asignar' });
      Ops.llenarSelect(document.getElementById('taskSectorForm'), state.sectores, { label: 'nombre', placeholder: 'Sin sector' });
      Ops.llenarSelect(document.getElementById('taskCultivoForm'), state.cultivos, { label: 'nombre', placeholder: 'Sin cultivo' });
      actualizarHintResponsable();
    });
  }

  function cargar() {
    var params = [];
    var prioridad = document.getElementById('taskPrioridad').value;
    var responsable = document.getElementById('taskResponsable').value;
    var sector = document.getElementById('taskSector').value;
    var buscar = document.getElementById('taskBuscar').value.trim();
    if (prioridad) params.push('prioridad=' + encodeURIComponent(prioridad));
    if (responsable) params.push('responsable_id=' + encodeURIComponent(responsable));
    if (sector) params.push('sector_id=' + encodeURIComponent(sector));
    if (buscar) params.push('buscar=' + encodeURIComponent(buscar));
    var path = '/tareas/' + (params.length ? '?' + params.join('&') : '');
    return Ops.get(path).then(function (rows) {
      state.tareas = rows || [];
      render();
    }).catch(function (error) {
      document.getElementById('kanbanBoard').innerHTML = Ops.vacio('No se pudieron cargar las tareas', error.message);
      showToast(error.message, 'error');
    });
  }

  function cargarResumen() {
    Ops.get('/tareas/resumen').then(function (resumen) {
      if (!resumen) return;
      document.getElementById('taskKPIs').innerHTML =
        '<div class="ops-card"><div class="ops-muted">Pendientes</div><div class="stat-value">' + (resumen.pendientes || 0) + '</div><div class="ops-small">' + (resumen.atrasadas || 0) + ' atrasadas</div></div>' +
        '<div class="ops-card"><div class="ops-muted">En curso</div><div class="stat-value">' + ((resumen.en_progreso || 0) + (resumen.en_revision || 0)) + '</div><div class="ops-small">en progreso o revisión</div></div>' +
        '<div class="ops-card"><div class="ops-muted">Completadas</div><div class="stat-value">' + (resumen.completadas || 0) + '</div><div class="ops-small">' + (resumen.mis_tareas || 0) + ' asignadas a ti</div></div>';
    });
  }

  function puedeCambiar(tarea) {
    return Ops.esStaff() || tarea.responsable_id === state.userId;
  }

  function tarjeta(tarea) {
    var draggable = puedeCambiar(tarea) ? ' draggable="true"' : '';
    return '<article class="kanban-card" data-id="' + tarea.id + '"' + draggable + '>' +
      '<h4>' + Ops.escape(tarea.titulo) + '</h4>' +
      (tarea.descripcion ? '<p>' + Ops.escape(tarea.descripcion) + '</p>' : '') +
      '<div class="kanban-meta">' +
        Ops.prioridadPill(tarea.prioridad) +
        (tarea.atrasada ? '<span class="ops-pill danger">Atrasada</span>' : '') +
        '<small>' + Ops.escape(tarea.responsable_nombre || 'Sin asignar') + '</small>' +
      '</div>' +
      '<div class="kanban-meta" style="margin-top:6px">' +
        '<small>' + Ops.escape(tarea.sector_nombre || 'General') + '</small>' +
        (tarea.fecha_limite ? '<small>· ' + Ops.fecha(tarea.fecha_limite) + '</small>' : '') +
      '</div>' +
    '</article>';
  }

  function renderKanban() {
    var board = document.getElementById('kanbanBoard');
    if (!state.tareas.length) {
      board.innerHTML = Ops.vacio('Sin tareas', 'Crea una tarea o ajusta los filtros para comenzar.');
      return;
    }
    board.innerHTML = COLUMNS.map(function (column) {
      var items = state.tareas.filter(function (tarea) {
        return column.match.indexOf(tarea.estado) !== -1;
      });
      return '<section class="kanban-col" data-estado="' + column.estado + '">' +
        '<div class="kanban-col-head"><strong>' + column.titulo + '</strong><span>' + items.length + '</span></div>' +
        '<div class="kanban-cards">' + (items.length ? items.map(tarjeta).join('') : '<div class="ops-small" style="padding:8px">Sin tareas</div>') + '</div>' +
      '</section>';
    }).join('');
    board.querySelectorAll('.kanban-col').forEach(function (column) {
      column.addEventListener('dragover', function (event) {
        event.preventDefault();
        column.classList.add('drag-over');
      });
      column.addEventListener('dragleave', function () {
        column.classList.remove('drag-over');
      });
      column.addEventListener('drop', function (event) {
        event.preventDefault();
        column.classList.remove('drag-over');
        var id = Number(event.dataTransfer.getData('text/plain'));
        if (id) cambiarEstado(id, column.getAttribute('data-estado'));
      });
    });
    board.querySelectorAll('.kanban-card').forEach(function (card) {
      card.addEventListener('dragstart', function (event) {
        event.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', function () {
        card.classList.remove('dragging');
      });
      card.addEventListener('click', function () {
        abrirDetalle(Number(card.getAttribute('data-id')));
      });
    });
  }

  function renderLista() {
    var tbody = document.getElementById('taskTableBody');
    if (!state.tareas.length) {
      tbody.innerHTML = '<tr><td colspan="7">' + Ops.vacio('Sin tareas', 'No hay tareas para estos filtros.') + '</td></tr>';
      return;
    }
    tbody.innerHTML = state.tareas.map(function (tarea) {
      return '<tr>' +
        '<td><strong>' + Ops.escape(tarea.titulo) + '</strong><div class="ops-small">' + Ops.escape(tarea.categoria) + '</div></td>' +
        '<td>' + Ops.escape(tarea.responsable_nombre || 'Sin asignar') + '</td>' +
        '<td>' + Ops.escape(tarea.sector_nombre || 'General') + '</td>' +
        '<td>' + Ops.prioridadPill(tarea.prioridad) + '</td>' +
        '<td>' + Ops.estadoPill(tarea.estado) + '</td>' +
        '<td>' + (tarea.fecha_limite ? Ops.fecha(tarea.fecha_limite) : '—') + '</td>' +
        '<td><button type="button" class="btn-icon" data-open="' + tarea.id + '" title="Ver detalle"><i class="ph ph-eye"></i></button></td>' +
      '</tr>';
    }).join('');
    tbody.querySelectorAll('[data-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        abrirDetalle(Number(button.getAttribute('data-open')));
      });
    });
  }

  function render() {
    var kanban = document.getElementById('kanbanBoard');
    var list = document.getElementById('taskListView');
    kanban.hidden = state.view !== 'kanban';
    list.hidden = state.view !== 'lista';
    if (state.view === 'kanban') renderKanban();
    else renderLista();
    cargarResumen();
    var newButton = document.getElementById('taskNewBtn');
    if (newButton) newButton.hidden = !Ops.esStaff();
  }

  function cambiarEstado(id, estado) {
    Ops.put('/tareas/' + id + '/estado', { estado: estado }).then(function () {
      showToast('Estado actualizado.', 'success');
      cargar();
      if (state.detail && state.detail.id === id) abrirDetalle(id);
    }).catch(function (error) {
      showToast(error.message, 'error');
      cargar();
    });
  }

  function abrirDetalle(id) {
    document.getElementById('taskDetailBody').innerHTML =
      '<div class="ops-empty"><i class="ph ph-circle-notch"></i><h3>Cargando tarea…</h3></div>';
    Ops.abrirModal('taskDetailModal');
    Ops.get('/tareas/' + id).then(function (tarea) {
      state.detail = tarea;
      renderDetalle(tarea);
    }).catch(function (error) {
      document.getElementById('taskDetailBody').innerHTML = Ops.vacio('No se pudo cargar la tarea', error.message);
    });
  }

  function renderDetalle(tarea) {
    var stateOptions = ESTADOS.map(function (estado) {
      return '<option value="' + estado + '"' + (tarea.estado === estado ? ' selected' : '') + '>' +
        Ops.estadoPill(estado).replace(/<[^>]+>/g, '') + '</option>';
    }).join('');
    var comentarios = (tarea.comentarios || []).length
      ? '<div class="timeline">' + tarea.comentarios.map(function (item) {
          return '<div class="timeline-item">' +
            '<strong>' + Ops.escape(item.usuario_nombre) + '</strong> ' +
            (item.estado_nuevo ? Ops.estadoPill(item.estado_nuevo) : '') +
            '<p>' + Ops.escape(item.comentario) + '</p>' +
            '<small>' + Ops.fechaHora(item.fecha_creacion) + '</small>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="ops-muted">Sin historial todavía.</p>';
    var acciones = '';
    if (puedeCambiar(tarea)) {
      acciones += '<div class="form-group" style="margin-top:14px"><label>Cambiar estado</label>' +
        '<div style="display:flex;gap:8px"><select id="detailEstado">' + stateOptions + '</select>' +
        '<button type="button" class="btn-primary" id="detailEstadoBtn">Actualizar</button></div></div>';
    }
    if (Ops.esStaff()) {
      acciones += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        '<button type="button" class="btn-secondary" id="detailEditBtn"><i class="ph ph-pencil-simple"></i> Editar</button>' +
        (Ops.esAdmin() ? '<button type="button" class="btn-secondary" id="detailDeleteBtn"><i class="ph ph-trash"></i> Eliminar</button>' : '') +
      '</div>';
    }
    document.getElementById('taskDetailBody').innerHTML =
      '<div class="ops-card-head"><div><h3>' + Ops.escape(tarea.titulo) + '</h3>' +
        '<div class="ops-muted">Creada por ' + Ops.escape(tarea.creador_nombre || 'Sistema') + ' · ' + Ops.fechaHora(tarea.fecha_creacion) + '</div></div>' +
        Ops.estadoPill(tarea.estado) + '</div>' +
      '<div class="ops-grid three" style="margin:14px 0">' +
        '<div><div class="ops-muted">Prioridad</div>' + Ops.prioridadPill(tarea.prioridad) + '</div>' +
        '<div><div class="ops-muted">Responsable</div><strong>' + Ops.escape(tarea.responsable_nombre || 'Sin asignar') + '</strong></div>' +
        '<div><div class="ops-muted">Sector</div><strong>' + Ops.escape(tarea.sector_nombre || 'General') + '</strong></div>' +
        '<div><div class="ops-muted">Cultivo</div><strong>' + Ops.escape(tarea.cultivo_nombre || '—') + '</strong></div>' +
        '<div><div class="ops-muted">Fecha límite</div><strong>' + (tarea.fecha_limite ? Ops.fechaHora(tarea.fecha_limite) : '—') + '</strong></div>' +
        '<div><div class="ops-muted">Completada</div><strong>' + (tarea.fecha_completada ? Ops.fechaHora(tarea.fecha_completada) : '—') + '</strong></div>' +
      '</div>' +
      (tarea.descripcion ? '<p style="font-size:13px;color:var(--g-text-soft)">' + Ops.escape(tarea.descripcion) + '</p>' : '') +
      (tarea.observaciones ? '<p class="ops-muted"><strong>Observaciones:</strong> ' + Ops.escape(tarea.observaciones) + '</p>' : '') +
      acciones +
      '<hr style="border:none;border-top:1px solid var(--g-border);margin:18px 0">' +
      '<h3 style="font-size:14px;margin-bottom:12px">Historial y comentarios</h3>' +
      comentarios +
      '<form id="detailCommentForm" style="margin-top:14px">' +
        '<div class="form-group"><label>Agregar comentario</label><textarea id="detailComment" rows="2" maxlength="2000" required></textarea></div>' +
        '<button type="submit" class="btn-primary btn-small">Comentar</button>' +
      '</form>';

    var estadoBtn = document.getElementById('detailEstadoBtn');
    if (estadoBtn) {
      estadoBtn.addEventListener('click', function () {
        cambiarEstado(tarea.id, document.getElementById('detailEstado').value);
      });
    }
    var editBtn = document.getElementById('detailEditBtn');
    if (editBtn) editBtn.addEventListener('click', function () { editar(tarea); });
    var deleteBtn = document.getElementById('detailDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        Ops.confirmar('¿Eliminar definitivamente la tarea "' + tarea.titulo + '"?').then(function (ok) {
          if (!ok) return;
          Ops.del('/tareas/' + tarea.id).then(function () {
            Ops.cerrarModal('taskDetailModal');
            showToast('Tarea eliminada.', 'success');
            cargar();
          }).catch(function (error) { showToast(error.message, 'error'); });
        });
      });
    }
    document.getElementById('detailCommentForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var text = document.getElementById('detailComment').value.trim();
      if (!text) return;
      Ops.post('/tareas/' + tarea.id + '/comentarios', { comentario: text }).then(function () {
        showToast('Comentario agregado.', 'success');
        abrirDetalle(tarea.id);
      }).catch(function (error) { showToast(error.message, 'error'); });
    });
  }

  function nueva() {
    document.getElementById('taskModalTitle').textContent = 'Nueva tarea';
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('taskSaveBtn').textContent = 'Crear tarea';
    Ops.abrirModal('taskModal');
  }

  function editar(tarea) {
    document.getElementById('taskModalTitle').textContent = 'Editar tarea';
    document.getElementById('taskId').value = tarea.id;
    document.getElementById('taskTitulo').value = tarea.titulo || '';
    document.getElementById('taskDescripcion').value = tarea.descripcion || '';
    document.getElementById('taskCategoria').value = tarea.categoria || 'general';
    document.getElementById('taskPrioridadForm').value = tarea.prioridad || 'media';
    var responsableSelect = document.getElementById('taskResponsableForm');
    if (tarea.responsable_id && !Array.prototype.some.call(
      responsableSelect.options,
      function (option) { return Number(option.value) === tarea.responsable_id; }
    )) {
      var fallback = document.createElement('option');
      fallback.value = tarea.responsable_id;
      fallback.textContent = tarea.responsable_nombre || ('Usuario #' + tarea.responsable_id);
      responsableSelect.appendChild(fallback);
    }
    responsableSelect.value = tarea.responsable_id || '';
    document.getElementById('taskSectorForm').value = tarea.sector_id || '';
    document.getElementById('taskCultivoForm').value = tarea.cultivo_id || '';
    document.getElementById('taskLimite').value = toLocalInput(tarea.fecha_limite);
    document.getElementById('taskObservaciones').value = tarea.observaciones || '';
    document.getElementById('taskSaveBtn').textContent = 'Guardar cambios';
    Ops.cerrarModal('taskDetailModal');
    Ops.abrirModal('taskModal');
  }

  function guardar(event) {
    event.preventDefault();
    var id = document.getElementById('taskId').value;
    var payload = {
      titulo: document.getElementById('taskTitulo').value.trim(),
      descripcion: document.getElementById('taskDescripcion').value.trim() || null,
      categoria: document.getElementById('taskCategoria').value,
      prioridad: document.getElementById('taskPrioridadForm').value,
      responsable_id: Number(document.getElementById('taskResponsableForm').value) || null,
      sector_id: Number(document.getElementById('taskSectorForm').value) || null,
      cultivo_id: Number(document.getElementById('taskCultivoForm').value) || null,
      fecha_limite: document.getElementById('taskLimite').value || null,
      observaciones: document.getElementById('taskObservaciones').value.trim() || null
    };
    var action = id ? Ops.put('/tareas/' + id, payload) : Ops.post('/tareas/', payload);
    action.then(function () {
      Ops.cerrarModal('taskModal');
      showToast(id ? 'Tarea actualizada.' : 'Tarea creada.', 'success');
      cargar();
    }).catch(function (error) {
      showToast(error.message, 'error');
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
    document.getElementById('taskNewBtn').hidden = !Ops.esStaff();
    document.getElementById('taskNewBtn').addEventListener('click', nueva);
    document.getElementById('taskForm').addEventListener('submit', guardar);
    document.getElementById('taskViewBtn').addEventListener('click', function () {
      state.view = state.view === 'kanban' ? 'lista' : 'kanban';
      document.getElementById('taskViewBtn').innerHTML = state.view === 'kanban'
        ? '<i class="ph ph-list"></i> Ver lista'
        : '<i class="ph ph-kanban"></i> Ver kanban';
      render();
    });
    ['taskPrioridad', 'taskResponsable', 'taskSector'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', cargar);
    });
    document.getElementById('taskBuscar').addEventListener('input', Ops.debounce(cargar, 350));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
