(function () {
  'use strict';

  var state = {
    miembros: [],
    sectores: [],
    grupos: []
  };

  function iniciales(nombre) {
    return String(nombre || '?').split(/\s+/).slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join('');
  }

  function rolLabel(rol) {
    var valor = String(rol || '').toLowerCase();
    if (valor === 'admin' || valor === 'administrador') return 'Administrador';
    if (valor === 'supervisor') return 'Supervisor';
    if (valor === 'encargado') return 'Encargado';
    return Ops.categoriaLabel(rol);
  }

  function cargarSectores() {
    return Ops.get('/instalaciones/').catch(function () { return []; }).then(function (rows) {
      state.sectores = rows || [];
    });
  }

  function cargar() {
    var params = [];
    var rol = document.getElementById('teamRol').value;
    var activo = document.getElementById('teamActivo').value;
    var buscar = document.getElementById('teamBuscar').value.trim();
    if (rol) params.push('rol=' + encodeURIComponent(rol));
    if (activo !== '') params.push('activo=' + encodeURIComponent(activo));
    if (buscar) params.push('buscar=' + encodeURIComponent(buscar));
    Ops.get('/equipo/' + (params.length ? '?' + params.join('&') : '')).then(function (rows) {
      state.miembros = rows || [];
      render();
    }).catch(function (error) {
      document.getElementById('teamGrid').innerHTML = Ops.vacio('No se pudo cargar el equipo', error.message);
      showToast(error.message, 'error');
    });
  }

  function render() {
    var tareas = state.miembros.reduce(function (total, item) { return total + (item.tareas_pendientes || 0); }, 0);
    var incidencias = state.miembros.reduce(function (total, item) { return total + (item.incidencias_abiertas || 0); }, 0);
    var activos = state.miembros.filter(function (item) { return item.activo; }).length;
    document.getElementById('teamKPIs').innerHTML =
      '<div class="ops-card"><div class="ops-muted">Integrantes visibles</div><div class="stat-value">' + state.miembros.length + '</div><div class="ops-small">' + activos + ' activos</div></div>' +
      '<div class="ops-card"><div class="ops-muted">Tareas pendientes</div><div class="stat-value">' + tareas + '</div><div class="ops-small">en todo el equipo</div></div>' +
      '<div class="ops-card"><div class="ops-muted">Incidencias abiertas</div><div class="stat-value">' + incidencias + '</div><div class="ops-small">asignadas al equipo</div></div>' +
      '<div class="ops-card"><div class="ops-muted">Supervisores</div><div class="stat-value">' + state.miembros.filter(function (item) { return (item.rol || '').toLowerCase() === 'supervisor'; }).length + '</div><div class="ops-small">' + state.miembros.filter(function (item) { return (item.rol || '').toLowerCase() === 'encargado'; }).length + ' encargados</div></div>';

    var grid = document.getElementById('teamGrid');
    if (!state.miembros.length) {
      grid.innerHTML = Ops.vacio('Sin integrantes', 'No hay usuarios que coincidan con los filtros.');
      return;
    }
    grid.innerHTML = state.miembros.map(function (miembro) {
      var sectores = (miembro.sectores || []).map(function (sector) { return sector.nombre; }).join(', ');
      return '<article class="team-card" data-id="' + miembro.id + '">' +
        '<div class="team-head">' +
          '<div class="team-avatar">' + Ops.escape(iniciales(miembro.nombre_completo || miembro.username)) + '</div>' +
          '<div><h3>' + Ops.escape(miembro.nombre_completo || miembro.username) + '</h3>' +
          '<small>' + Ops.escape(rolLabel(miembro.rol)) + ' · ' + (miembro.activo ? 'Activo' : 'Inactivo') + '</small></div>' +
        '</div>' +
        '<div class="ops-small">' + Ops.escape(sectores || 'Sin sectores asignados') + '</div>' +
        '<div class="team-stats">' +
          '<div><b>' + (miembro.tareas_pendientes || 0) + '</b>Tareas</div>' +
          '<div><b>' + (miembro.incidencias_abiertas || 0) + '</b>Incidencias</div>' +
          '<div><b>' + (miembro.cultivos_count || 0) + '</b>Cultivos</div>' +
        '</div>' +
        '<button type="button" class="btn-secondary btn-small" data-open="' + miembro.id + '">Ver ficha</button>' +
      '</article>';
    }).join('');
    grid.querySelectorAll('[data-open]').forEach(function (button) {
      button.addEventListener('click', function () { abrirFicha(Number(button.getAttribute('data-open'))); });
    });
  }

  function tarjetaMiGrupo(grupo) {
    var color = grupo.color || '#5E7A55';
    var miembros = grupo.miembros || [];
    var sectores = grupo.sectores || [];
    var chipsSectores = sectores.map(function (sector) {
      return '<span class="group-chip"><span class="dot" style="background:' + Ops.escape(sector.color || color) + '"></span>' +
        Ops.escape(sector.nombre) + '</span>';
    }).join('');
    if (!chipsSectores) {
      chipsSectores = '<span class="group-empty-inline">Sin sectores asignados.</span>';
    }
    var usuario = Ops.usuario();
    var propioUsuario = usuario ? usuario.username : null;
    var chipsMiembros = miembros.map(function (miembro) {
      var etiqueta = Ops.escape((miembro.nombre_completo || miembro.username || '').split(' ')[0]);
      return '<span class="group-member" title="' + Ops.escape(miembro.nombre_completo || miembro.username) + '">' +
        '<span class="group-member-avatar">' + Ops.escape(iniciales(miembro.nombre_completo || miembro.username)) + '</span>' +
        etiqueta + (miembro.username === propioUsuario ? ' (tú)' : '') +
        '</span>';
    }).join('');
    if (!chipsMiembros) {
      chipsMiembros = '<span class="group-empty-inline">Sin encargados asignados.</span>';
    }
    return '<article class="group-card' + (grupo.activo ? '' : ' is-inactive') + '" style="--group-color:' + Ops.escape(color) + '">' +
      '<div class="group-card-head">' +
        '<span class="group-swatch"></span>' +
        '<div><h3>' + Ops.escape(grupo.nombre) + '</h3>' +
          '<div class="ops-muted">Supervisor: ' + Ops.escape(grupo.supervisor_nombre || 'Sin asignar') + '</div></div>' +
        '<span class="ops-pill ' + (grupo.activo ? '' : 'neutral') + '">' + (grupo.activo ? 'Activo' : 'Inactivo') + '</span>' +
      '</div>' +
      (grupo.descripcion ? '<p class="group-card-description">' + Ops.escape(grupo.descripcion) + '</p>' : '') +
      '<div class="group-stats">' +
        '<div><strong>' + (grupo.total_miembros || 0) + '</strong><span>Encargados</span></div>' +
        '<div><strong>' + (grupo.total_sectores || 0) + '</strong><span>Sectores</span></div>' +
        '<div><strong>' + (grupo.tareas_abiertas || 0) + '</strong><span>Tareas abiertas</span></div>' +
      '</div>' +
      '<div class="group-chip-row">' + chipsSectores + '</div>' +
      '<div class="group-members">' + chipsMiembros + '</div>' +
    '</article>';
  }

  function cargarMiGrupo() {
    var contenedor = document.getElementById('miGrupo');
    if (!contenedor) return Promise.resolve();
    return Ops.get('/grupos/').then(function (rows) {
      state.grupos = rows || [];
      var hint = document.getElementById('miGrupoHint');
      if (!state.grupos.length) {
        if (hint) hint.textContent = 'Aún no tienes un grupo de trabajo asignado.';
        contenedor.innerHTML = Ops.vacio(
          'Sin grupo asignado',
          'El administrador debe agregarte a un grupo de trabajo.'
        );
        return;
      }
      if (hint) {
        hint.textContent = state.grupos.length === 1
          ? 'Este es el grupo de trabajo al que perteneces.'
          : 'Estos son los grupos de trabajo a los que perteneces.';
      }
      contenedor.innerHTML = '<div class="group-grid">' +
        state.grupos.map(tarjetaMiGrupo).join('') +
        '</div>';
    }).catch(function (error) {
      contenedor.innerHTML = Ops.vacio('No se pudo cargar tu grupo', error.message);
    });
  }

  function abrirFicha(id) {
    document.getElementById('memberBody').innerHTML =
      '<div class="ops-empty"><i class="ph ph-circle-notch"></i><h3>Cargando ficha…</h3></div>';
    Ops.abrirModal('memberModal');
    Ops.get('/equipo/' + id + '/actividad').then(function (data) {
      renderFicha(data.usuario, data.tareas || [], data.incidencias || []);
    }).catch(function (error) {
      document.getElementById('memberBody').innerHTML = Ops.vacio('No se pudo cargar la ficha', error.message);
    });
  }

  function renderFicha(usuario, tareas, incidencias) {
    var rol = String(usuario.rol || '').toLowerCase();
    var asignable = Ops.esAdmin()
      ? ['encargado', 'supervisor'].indexOf(rol) !== -1
      : (Ops.esStaff() && rol === 'encargado');
    var sectores = (usuario.sectores || []).length
      ? usuario.sectores.map(function (sector) { return '<span class="ops-pill neutral">' + Ops.escape(sector.nombre) + '</span>'; }).join(' ')
      : '<span class="ops-muted">Sin sectores asignados</span>';
    var tareasHtml = tareas.length
      ? '<div class="timeline">' + tareas.map(function (tarea) {
          return '<div class="timeline-item"><strong>' + Ops.escape(tarea.titulo) + '</strong> ' + Ops.estadoPill(tarea.estado) +
            '<p>' + Ops.escape(tarea.sector_nombre || 'General') + ' · ' + Ops.prioridadPill(tarea.prioridad) + '</p>' +
            '<small>' + (tarea.fecha_limite ? 'Límite: ' + Ops.fecha(tarea.fecha_limite) : 'Sin fecha límite') + '</small></div>';
        }).join('') + '</div>'
      : '<p class="ops-muted">Sin tareas asignadas.</p>';
    var incidenciasHtml = incidencias.length
      ? '<div class="timeline">' + incidencias.map(function (incidencia) {
          return '<div class="timeline-item"><strong>' + Ops.escape(incidencia.titulo) + '</strong> ' + Ops.estadoPill(incidencia.estado) +
            '<p>' + Ops.escape(incidencia.sector_nombre || 'Sin sector') + '</p>' +
            '<small>' + Ops.fechaHora(incidencia.fecha_creacion) + '</small></div>';
        }).join('') + '</div>'
      : '<p class="ops-muted">Sin incidencias relacionadas.</p>';

    document.getElementById('memberBody').innerHTML =
      '<div class="ops-card-head"><div class="team-head">' +
        '<div class="team-avatar">' + Ops.escape(iniciales(usuario.nombre_completo || usuario.username)) + '</div>' +
        '<div><h3 style="margin:0">' + Ops.escape(usuario.nombre_completo || usuario.username) + '</h3>' +
        '<div class="ops-muted">' + Ops.escape(rolLabel(usuario.rol)) + ' · @' + Ops.escape(usuario.username) + ' · ' + Ops.escape(usuario.email || 'sin correo') + '</div></div>' +
      '</div>' + (usuario.activo ? '<span class="ops-pill">Activo</span>' : '<span class="ops-pill danger">Inactivo</span>') + '</div>' +
      '<div class="ops-grid four" style="margin:14px 0">' +
        '<div><div class="ops-muted">Tareas pendientes</div><div class="stat-value">' + (usuario.tareas_pendientes || 0) + '</div></div>' +
        '<div><div class="ops-muted">Incidencias abiertas</div><div class="stat-value">' + (usuario.incidencias_abiertas || 0) + '</div></div>' +
        '<div><div class="ops-muted">Cultivos asignados</div><div class="stat-value">' + (usuario.cultivos_count || 0) + '</div></div>' +
        '<div><div class="ops-muted">Último acceso</div><strong>' + (usuario.ultimo_acceso ? Ops.fechaHora(usuario.ultimo_acceso) : '—') + '</strong></div>' +
      '</div>' +
      '<h3 style="font-size:14px;margin:16px 0 8px">Sectores asignados</h3>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + sectores + '</div>' +
      (asignable ? '<button type="button" class="btn-secondary btn-small" id="assignBtn" style="margin-top:10px"><i class="ph ph-map-pin"></i> Gestionar sectores</button>' : '') +
      '<hr style="border:none;border-top:1px solid var(--g-border);margin:18px 0">' +
      '<div class="ops-grid two">' +
        '<div><h3 style="font-size:14px;margin-bottom:10px">Tareas recientes</h3>' + tareasHtml + '</div>' +
        '<div><h3 style="font-size:14px;margin-bottom:10px">Incidencias recientes</h3>' + incidenciasHtml + '</div>' +
      '</div>';

    var assignBtn = document.getElementById('assignBtn');
    if (assignBtn) assignBtn.addEventListener('click', function () { abrirAsignacion(usuario); });
  }

  function abrirAsignacion(usuario) {
    document.getElementById('assignForm').reset();
    document.getElementById('assignUserId').value = usuario.id;
    document.getElementById('assignInfo').textContent =
      'Define los sectores bajo responsabilidad de ' + (usuario.nombre_completo || usuario.username) + '.';
    var actuales = (usuario.sectores || []).map(function (sector) { return sector.id; });
    document.getElementById('assignList').innerHTML = state.sectores.length
      ? state.sectores.map(function (sector) {
          return '<label class="assign-item"><input type="checkbox" value="' + sector.id + '"' +
            (actuales.indexOf(sector.id) !== -1 ? ' checked' : '') + '> ' +
            Ops.escape(sector.nombre) + '</label>';
        }).join('')
      : '<p class="ops-muted">No hay sectores disponibles para asignar.</p>';
    Ops.cerrarModal('memberModal');
    Ops.abrirModal('assignModal');
  }

  function guardarAsignacion(event) {
    event.preventDefault();
    var id = document.getElementById('assignUserId').value;
    var sectorIds = Array.prototype.map.call(
      document.querySelectorAll('#assignList input:checked'),
      function (input) { return Number(input.value); }
    );
    Ops.put('/equipo/' + id + '/sectores', { sector_ids: sectorIds }).then(function () {
      Ops.cerrarModal('assignModal');
      showToast('Sectores actualizados.', 'success');
      cargar();
      abrirFicha(Number(id));
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function init() {
    var user = Ops.usuario();
    if (!user) return;
    var admin = Ops.esAdmin();
    var seccionGrupo = document.getElementById('miGrupoSection');
    if (seccionGrupo && !admin) seccionGrupo.hidden = false;
    cargarSectores().then(cargar);
    if (!admin) {
      cargarMiGrupo();
      if (window.AquaUI && typeof AquaUI.registerRefresh === 'function') {
        AquaUI.registerRefresh(cargarMiGrupo);
      }
    }
    document.getElementById('teamRefresh').addEventListener('click', function () {
      cargar();
      if (!admin) cargarMiGrupo();
    });
    document.getElementById('assignForm').addEventListener('submit', guardarAsignacion);
    document.getElementById('teamRol').addEventListener('change', cargar);
    document.getElementById('teamActivo').addEventListener('change', cargar);
    document.getElementById('teamBuscar').addEventListener('input', Ops.debounce(cargar, 350));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
