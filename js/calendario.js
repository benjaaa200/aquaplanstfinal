(function () {
  'use strict';

  var state = {
    eventos: [],
    sectores: [],
    usuarios: [],
    cultivos: [],
    userId: null,
    cursor: new Date(),
    view: 'mes',
    openedId: null
  };

  var TIPOS = ['evento', 'mantenimiento', 'inspeccion'];

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function keyOf(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function toInput(date) {
    return keyOf(date) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function toApi(date) {
    return keyOf(date) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function cargarOpciones() {
    return Promise.all([
      Ops.get('/instalaciones/').catch(function () { return []; }),
      Ops.get('/equipo/').catch(function () { return []; }),
      Ops.get('/cultivos/').catch(function () { return []; }),
      Ops.get('/auth/me').catch(function () { return null; })
    ]).then(function (results) {
      state.sectores = results[0] || [];
      state.usuarios = results[1] || [];
      state.cultivos = results[2] || [];
      state.userId = results[3] ? results[3].id : null;
      Ops.llenarSelect(document.getElementById('calSector'), state.sectores, { label: 'nombre', placeholder: 'Todos' });
      Ops.llenarSelect(document.getElementById('calResponsable'), state.usuarios, { label: 'nombre_completo', placeholder: 'Todos' });
      Ops.llenarSelect(document.getElementById('eventSectorForm'), state.sectores, { label: 'nombre', placeholder: 'Sin sector' });
      Ops.llenarSelect(document.getElementById('eventCultivoForm'), state.cultivos, { label: 'nombre', placeholder: 'Sin cultivo' });
      Ops.llenarSelect(document.getElementById('eventResponsableForm'), state.usuarios, { label: 'nombre_completo', placeholder: 'Sin asignar' });
      var sectorParam = Ops.params().get('sector');
      if (sectorParam) document.getElementById('calSector').value = sectorParam;
    });
  }

  function inicioSemana(date) {
    var start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  function rangoVista() {
    if (state.view === 'dia') {
      var day = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), state.cursor.getDate());
      var dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      return { start: day, end: dayEnd };
    }
    if (state.view === 'semana') {
      var weekStart = inicioSemana(state.cursor);
      var weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      return { start: weekStart, end: weekEnd };
    }
    var first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
    var offset = (first.getDay() + 6) % 7;
    var start = new Date(first);
    start.setDate(first.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    var end = new Date(start);
    end.setDate(start.getDate() + 41);
    end.setHours(23, 59, 59, 999);
    return { start: start, end: end };
  }

  function cargar() {
    var range = rangoVista();
    var params = [
      'fecha_inicio=' + encodeURIComponent(toApi(range.start)),
      'fecha_fin=' + encodeURIComponent(toApi(range.end))
    ];
    var tipo = document.getElementById('calTipo').value;
    var sector = document.getElementById('calSector').value;
    var responsable = document.getElementById('calResponsable').value;
    if (tipo) params.push('tipo=' + encodeURIComponent(tipo));
    if (sector) params.push('sector_id=' + encodeURIComponent(sector));
    if (responsable) params.push('responsable_id=' + encodeURIComponent(responsable));
    return Ops.get('/calendario/eventos?' + params.join('&')).then(function (rows) {
      state.eventos = rows || [];
      render();
      cargarResumen();
    }).catch(function (error) {
      document.getElementById('calendarGrid').innerHTML = Ops.vacio('No se pudo cargar el calendario', error.message);
      showToast(error.message, 'error');
    });
  }

  function cargarResumen() {
    Ops.get('/calendario/resumen').then(function (data) {
      if (!data) return;
      document.getElementById('calKPIs').innerHTML =
        '<div class="ops-card"><div class="ops-muted">Programados</div><div class="stat-value">' + (data.programados || 0) + '</div><div class="ops-small">' + (data.en_ejecucion || 0) + ' en ejecución</div></div>' +
        '<div class="ops-card"><div class="ops-muted">Completados</div><div class="stat-value">' + (data.completados || 0) + '</div><div class="ops-small">de ' + (data.total || 0) + ' eventos</div></div>' +
        '<div class="ops-card"><div class="ops-muted">Atrasados</div><div class="stat-value">' + (data.atrasados || 0) + '</div><div class="ops-small">requieren seguimiento</div></div>' +
        '<div class="ops-card"><div class="ops-muted">Mantenimientos</div><div class="stat-value">' + (data.mantenimientos || 0) + '</div><div class="ops-small">' + (data.inspecciones || 0) + ' inspecciones</div></div>';
    });
  }

  function agruparPorDia() {
    var byDay = {};
    state.eventos.forEach(function (evento) {
      var date = new Date(evento.fecha_inicio);
      if (isNaN(date.getTime())) return;
      var key = keyOf(date);
      (byDay[key] = byDay[key] || []).push(evento);
    });
    return byDay;
  }

  function tituloVista(range) {
    if (state.view === 'dia') {
      var label = state.cursor.toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (state.view === 'semana') {
      var startLabel = range.start.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
      var endLabel = range.end.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
      return 'Semana del ' + startLabel + ' al ' + endLabel;
    }
    var monthName = state.cursor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    return monthName.charAt(0).toUpperCase() + monthName.slice(1);
  }

  function chip(evento) {
    var tipoClass = TIPOS.indexOf(evento.tipo) !== -1 ? evento.tipo : 'otro';
    var stateClass = evento.atrasado ? ' atrasado' : (evento.estado === 'completado' ? ' completado' : '');
    var hora = new Date(evento.fecha_inicio);
    return '<button type="button" class="cal-event ' + tipoClass + stateClass + '" data-event="' + evento.id + '" title="' + Ops.escape(evento.titulo) + '">' +
      (isNaN(hora.getTime()) ? '' : pad(hora.getHours()) + ':' + pad(hora.getMinutes()) + ' · ') +
      Ops.escape(evento.titulo) + '</button>';
  }

  function renderCeldas(range, count, marcarOtroMes) {
    var byDay = agruparPorDia();
    var today = keyOf(new Date());
    var html = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(function (dia) {
      return '<div class="cal-dow">' + dia + '</div>';
    }).join('');
    var day = new Date(range.start);
    for (var index = 0; index < count; index += 1) {
      var key = keyOf(day);
      var otherMonth = marcarOtroMes && day.getMonth() !== state.cursor.getMonth();
      var items = byDay[key] || [];
      var classes = 'cal-cell' + (otherMonth ? ' other-month' : '') + (key === today ? ' today' : '');
      html += '<div class="' + classes + '" data-day="' + key + '">' +
        '<span class="cal-date">' + day.getDate() + '</span>' +
        items.slice(0, 6).map(chip).join('') +
        (items.length > 6 ? '<span class="ops-small">+' + (items.length - 6) + ' más</span>' : '') +
      '</div>';
      day.setDate(day.getDate() + 1);
    }
    var grid = document.getElementById('calendarGrid');
    grid.innerHTML = html;
    grid.querySelectorAll('[data-event]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        abrirDetalle(Number(button.getAttribute('data-event')));
      });
    });
    grid.querySelectorAll('.cal-cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        var key = cell.getAttribute('data-day');
        nueva(new Date(key + 'T09:00'));
      });
    });
  }

  function renderDia(range) {
    var eventos = state.eventos.slice().sort(function (a, b) {
      return new Date(a.fecha_inicio) - new Date(b.fecha_inicio);
    });
    var grid = document.getElementById('calendarGrid');
    if (!eventos.length) {
      grid.innerHTML = Ops.vacio('Sin eventos este día', 'Haz clic en "Nuevo evento" para programar una actividad.');
      return;
    }
    grid.innerHTML = '<div class="cal-day-list" style="grid-column:1/-1">' + eventos.map(function (evento) {
      var hora = new Date(evento.fecha_inicio);
      return '<div class="cal-day-item" data-event="' + evento.id + '">' +
        '<div class="cal-day-time">' + (isNaN(hora.getTime()) ? '—' : pad(hora.getHours()) + ':' + pad(hora.getMinutes())) + '</div>' +
        '<div style="flex:1"><strong style="font-size:13px">' + Ops.escape(evento.titulo) + '</strong> ' + Ops.estadoPill(evento.estado) +
          '<div class="ops-small">' + Ops.escape(Ops.categoriaLabel(evento.tipo)) + ' · ' + Ops.escape(evento.sector_nombre || 'Sin sector') + ' · ' + Ops.escape(evento.responsable_nombre || 'Sin asignar') + '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
    grid.querySelectorAll('[data-event]').forEach(function (item) {
      item.addEventListener('click', function () {
        abrirDetalle(Number(item.getAttribute('data-event')));
      });
    });
  }

  function render() {
    var range = rangoVista();
    document.getElementById('calMes').textContent = tituloVista(range);
    if (state.view === 'dia') {
      renderDia(range);
      return;
    }
    renderCeldas(range, state.view === 'semana' ? 7 : 42, state.view === 'mes');
  }

  function nueva(fecha) {
    document.getElementById('eventModalTitle').textContent = 'Nuevo evento';
    document.getElementById('eventForm').reset();
    document.getElementById('eventId').value = '';
    document.getElementById('eventSaveBtn').textContent = 'Crear evento';
    document.getElementById('eventInicio').value = toInput(fecha || new Date());
    Ops.abrirModal('eventModal');
  }

  function editar(evento) {
    document.getElementById('eventModalTitle').textContent = 'Editar evento';
    document.getElementById('eventId').value = evento.id;
    document.getElementById('eventTitulo').value = evento.titulo || '';
    document.getElementById('eventDescripcion').value = evento.descripcion || '';
    document.getElementById('eventTipo').value = evento.tipo || 'evento';
    document.getElementById('eventCategoria').value = evento.categoria || 'otras';
    document.getElementById('eventInicio').value = evento.fecha_inicio
      ? toInput(new Date(evento.fecha_inicio)) : '';
    document.getElementById('eventFin').value = evento.fecha_fin
      ? toInput(new Date(evento.fecha_fin)) : '';
    document.getElementById('eventSectorForm').value = evento.sector_id || '';
    document.getElementById('eventCultivoForm').value = evento.cultivo_id || '';
    document.getElementById('eventResponsableForm').value = evento.responsable_id || '';
    document.getElementById('eventSaveBtn').textContent = 'Guardar cambios';
    Ops.cerrarModal('eventDetailModal');
    Ops.abrirModal('eventModal');
  }

  function guardar(event) {
    event.preventDefault();
    var id = document.getElementById('eventId').value;
    var payload = {
      titulo: document.getElementById('eventTitulo').value.trim(),
      descripcion: document.getElementById('eventDescripcion').value.trim() || null,
      tipo: document.getElementById('eventTipo').value,
      categoria: document.getElementById('eventCategoria').value,
      fecha_inicio: document.getElementById('eventInicio').value,
      fecha_fin: document.getElementById('eventFin').value || null,
      sector_id: Number(document.getElementById('eventSectorForm').value) || null,
      cultivo_id: Number(document.getElementById('eventCultivoForm').value) || null,
      responsable_id: Number(document.getElementById('eventResponsableForm').value) || null
    };
    var action = id ? Ops.put('/calendario/eventos/' + id, payload) : Ops.post('/calendario/eventos', payload);
    action.then(function () {
      Ops.cerrarModal('eventModal');
      showToast(id ? 'Evento actualizado.' : 'Evento creado.', 'success');
      cargar();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function abrirDetalle(id) {
    document.getElementById('eventDetailBody').innerHTML =
      '<div class="ops-empty"><i class="ph ph-circle-notch"></i><h3>Cargando evento…</h3></div>';
    Ops.abrirModal('eventDetailModal');
    Ops.get('/calendario/eventos/' + id).then(function (evento) {
      renderDetalle(evento);
    }).catch(function (error) {
      document.getElementById('eventDetailBody').innerHTML = Ops.vacio('No se pudo cargar el evento', error.message);
    });
  }

  function renderDetalle(evento) {
    var staff = Ops.esStaff();
    var puedeGestionar = staff || evento.responsable_id === state.userId;
    var puedeEditar = staff || evento.creador_id === state.userId || evento.responsable_id === state.userId;
    var abierto = ['programado', 'en_ejecucion', 'atrasado'].indexOf(evento.estado) !== -1;
    var acciones = '';
    if (puedeGestionar && abierto) {
      acciones += '<button type="button" class="btn-primary" id="eventCompleteBtn"><i class="ph ph-check-circle"></i> Completar</button>';
      acciones += '<button type="button" class="btn-secondary" id="eventCancelBtn">Cancelar evento</button>';
      if (evento.estado === 'programado') {
        acciones += '<button type="button" class="btn-secondary" id="eventStartBtn">Iniciar ejecución</button>';
      }
    }
    if (puedeEditar) {
      acciones += '<button type="button" class="btn-secondary" id="eventEditBtn"><i class="ph ph-pencil-simple"></i> Editar</button>';
    }
    if (Ops.esAdmin()) {
      acciones += '<button type="button" class="btn-secondary" id="eventDeleteBtn"><i class="ph ph-trash"></i> Eliminar</button>';
    }

    document.getElementById('eventDetailBody').innerHTML =
      '<div class="ops-card-head"><div><h3>' + Ops.escape(evento.titulo) + '</h3>' +
        '<div class="ops-muted">' + Ops.escape(Ops.categoriaLabel(evento.tipo)) + ' · ' + Ops.fechaHora(evento.fecha_inicio) + '</div></div>' +
        Ops.estadoPill(evento.estado) + '</div>' +
      '<div class="ops-grid three" style="margin:14px 0">' +
        '<div><div class="ops-muted">Tipo</div><strong>' + Ops.escape(Ops.categoriaLabel(evento.tipo)) + '</strong></div>' +
        '<div><div class="ops-muted">Categoría</div><strong>' + Ops.escape(Ops.categoriaLabel(evento.categoria)) + '</strong></div>' +
        '<div><div class="ops-muted">Sector</div><strong>' + Ops.escape(evento.sector_nombre || 'Sin sector') + '</strong></div>' +
        '<div><div class="ops-muted">Cultivo</div><strong>' + Ops.escape(evento.cultivo_nombre || '—') + '</strong></div>' +
        '<div><div class="ops-muted">Responsable</div><strong>' + Ops.escape(evento.responsable_nombre || 'Sin asignar') + '</strong></div>' +
        '<div><div class="ops-muted">Fecha fin</div><strong>' + (evento.fecha_fin ? Ops.fechaHora(evento.fecha_fin) : '—') + '</strong></div>' +
      '</div>' +
      (evento.descripcion ? '<p style="font-size:13px;color:var(--g-text-soft)">' + Ops.escape(evento.descripcion) + '</p>' : '') +
      (evento.resultado ? '<p class="ops-muted"><strong>Resultado:</strong> ' + Ops.escape(evento.resultado) + '</p>' : '') +
      (evento.observaciones ? '<p class="ops-muted"><strong>Observaciones:</strong> ' + Ops.escape(evento.observaciones) + '</p>' : '') +
      (evento.recomendaciones ? '<p class="ops-muted"><strong>Recomendaciones:</strong> ' + Ops.escape(evento.recomendaciones) + '</p>' : '') +
      (evento.incidencia ? '<p class="ops-muted"><strong>Incidencia generada:</strong> <a href="incidencias.html?id=' + evento.incidencia.id + '">' + Ops.escape(evento.incidencia.titulo) + '</a> ' + Ops.estadoPill(evento.incidencia.estado) + '</p>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' + acciones + '</div>';

    var completeBtn = document.getElementById('eventCompleteBtn');
    if (completeBtn) {
      completeBtn.addEventListener('click', function () {
        document.getElementById('completeForm').reset();
        document.getElementById('completeEventId').value = evento.id;
        document.getElementById('completeTitle').textContent = 'Completar: ' + evento.titulo;
        document.getElementById('incidenciaExtra').hidden = true;
        Ops.abrirModal('completeModal');
      });
    }
    var startBtn = document.getElementById('eventStartBtn');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        cambiarEstado(evento.id, 'en_ejecucion');
      });
    }
    var cancelBtn = document.getElementById('eventCancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        Ops.confirmar('¿Cancelar el evento "' + evento.titulo + '"?').then(function (ok) {
          if (ok) cambiarEstado(evento.id, 'cancelado');
        });
      });
    }
    var editBtn = document.getElementById('eventEditBtn');
    if (editBtn) editBtn.addEventListener('click', function () { editar(evento); });
    var deleteBtn = document.getElementById('eventDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        Ops.confirmar('¿Eliminar definitivamente el evento "' + evento.titulo + '"?').then(function (ok) {
          if (!ok) return;
          Ops.del('/calendario/eventos/' + evento.id).then(function () {
            Ops.cerrarModal('eventDetailModal');
            showToast('Evento eliminado.', 'success');
            cargar();
          }).catch(function (error) { showToast(error.message, 'error'); });
        });
      });
    }
  }

  function cambiarEstado(id, estado) {
    Ops.patch('/calendario/eventos/' + id + '/estado', { estado: estado }).then(function () {
      Ops.cerrarModal('eventDetailModal');
      showToast('Evento actualizado.', 'success');
      cargar();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function completar(event) {
    event.preventDefault();
    var id = document.getElementById('completeEventId').value;
    var payload = {
      resultado: document.getElementById('completeResultado').value.trim() || null,
      observaciones: document.getElementById('completeObservaciones').value.trim() || null,
      recomendaciones: document.getElementById('completeRecomendaciones').value.trim() || null,
      crear_incidencia: document.getElementById('completeIncidencia').checked,
      incidencia_titulo: document.getElementById('completeIncTitulo').value.trim() || null,
      incidencia_descripcion: document.getElementById('completeIncDesc').value.trim() || null
    };
    Ops.post('/calendario/eventos/' + id + '/completar', payload).then(function (data) {
      Ops.cerrarModal('completeModal');
      Ops.cerrarModal('eventDetailModal');
      showToast(data && data.incidencia_generada
        ? 'Evento completado e incidencia creada.'
        : 'Evento completado.', 'success');
      cargar();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function init() {
    var user = Ops.usuario();
    if (!user) return;
    cargarOpciones().then(function () {
      cargar().then(function () {
        var id = Ops.params().get('id');
        if (id) abrirDetalle(Number(id));
        var fecha = Ops.params().get('fecha');
        if (fecha) {
          var parsed = new Date(fecha);
          if (!isNaN(parsed.getTime())) {
            state.cursor = parsed;
            cargar();
          }
        }
      });
    });
    function mover(delta) {
      if (state.view === 'dia') {
        state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), state.cursor.getDate() + delta);
      } else if (state.view === 'semana') {
        state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), state.cursor.getDate() + delta * 7);
      } else {
        state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
      }
      cargar();
    }
    document.getElementById('calPrev').addEventListener('click', function () { mover(-1); });
    document.getElementById('calNext').addEventListener('click', function () { mover(1); });
    document.getElementById('calToday').addEventListener('click', function () {
      state.cursor = new Date();
      cargar();
    });
    document.querySelectorAll('.cal-view-switch button').forEach(function (button) {
      button.addEventListener('click', function () {
        state.view = button.getAttribute('data-vista');
        document.querySelectorAll('.cal-view-switch button').forEach(function (item) {
          item.classList.toggle('active', item === button);
        });
        cargar();
      });
    });
    document.getElementById('calRefresh').addEventListener('click', cargar);
    document.getElementById('calNewBtn').addEventListener('click', function () { nueva(new Date()); });
    document.getElementById('eventForm').addEventListener('submit', guardar);
    document.getElementById('completeForm').addEventListener('submit', completar);
    document.getElementById('completeIncidencia').addEventListener('change', function (event) {
      document.getElementById('incidenciaExtra').hidden = !event.target.checked;
    });
    ['calTipo', 'calSector', 'calResponsable'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', cargar);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
