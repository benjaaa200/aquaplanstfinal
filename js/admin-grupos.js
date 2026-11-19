(function () {
  'use strict';

  var state = {
    grupos: [],
    usuarios: [],
    equipo: [],
    filtros: { buscar: '', supervisor: '', estado: '' },
    editingId: null,
    detalleId: null
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function normalizar(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function nombreUsuario(usuario) {
    return (usuario && (usuario.nombre_completo || usuario.username)) || 'Sin nombre';
  }

  function rolDe(usuario) {
    return String((usuario && usuario.rol) || '').toLowerCase();
  }

  function supervisores() {
    return state.usuarios
      .filter(function (usuario) { return rolDe(usuario) === 'supervisor'; })
      .sort(function (a, b) { return nombreUsuario(a).localeCompare(nombreUsuario(b)); });
  }

  function supervisoresActivos() {
    return supervisores().filter(function (usuario) { return usuario.activo; });
  }

  function encargadosActivos() {
    return state.usuarios
      .filter(function (usuario) {
        return rolDe(usuario) === 'encargado' && usuario.activo;
      })
      .sort(function (a, b) { return nombreUsuario(a).localeCompare(nombreUsuario(b)); });
  }

  function equipoPorId(id) {
    return state.equipo.find(function (item) { return item.id === id; }) || null;
  }

  function grupoPorId(id) {
    return state.grupos.find(function (item) { return item.id === id; }) || null;
  }

  function iniciales(nombre) {
    var partes = String(nombre || '?').trim().split(/\s+/);
    return ((partes[0] || '?').charAt(0) + (partes[1] || '').charAt(0)).toUpperCase();
  }

  function grupoDeEncargado(usuarioId, excluirGrupoId) {
    return state.grupos.find(function (grupo) {
      if (grupo.id === excluirGrupoId) return false;
      return (grupo.miembros || []).some(function (miembro) {
        return miembro.id === usuarioId;
      });
    }) || null;
  }

  function mostrarCarga() {
    byId('groupsGrid').innerHTML =
      '<div class="ops-empty"><i class="ph ph-circle-notch"></i><h3>Cargando grupos...</h3></div>';
  }

  function cargar(mostrarSpinner) {
    if (mostrarSpinner) mostrarCarga();
    return Promise.all([
      Ops.get('/grupos/'),
      Ops.get('/usuarios/'),
      Ops.get('/equipo/').catch(function () { return []; })
    ]).then(function (results) {
      state.grupos = results[0] || [];
      state.usuarios = results[1] || [];
      state.equipo = results[2] || [];
      prepararFiltroSupervisores();
      render();
    }).catch(function (error) {
      byId('groupsGrid').innerHTML = Ops.vacio(
        'No se pudieron cargar los grupos',
        error.message
      );
      showToast(error.message, 'error');
    });
  }

  function prepararFiltroSupervisores() {
    var select = byId('groupSupervisorFilter');
    var actual = select.value;
    select.innerHTML = '<option value="">Todos</option>' + supervisores().map(function (usuario) {
      return '<option value="' + usuario.id + '">' +
        Ops.escape(nombreUsuario(usuario)) +
        (usuario.activo ? '' : ' (inactivo)') +
        '</option>';
    }).join('');
    select.value = actual;
    state.filtros.supervisor = select.value;
  }

  function render() {
    renderKPIs();
    renderGrupos();
  }

  function renderKPIs() {
    var activos = state.grupos.filter(function (grupo) { return grupo.activo; }).length;
    var supervisorIds = {};
    var miembroIds = {};
    var sectorIds = {};
    state.grupos.forEach(function (grupo) {
      if (grupo.supervisor_id) supervisorIds[grupo.supervisor_id] = true;
      (grupo.miembros || []).forEach(function (miembro) { miembroIds[miembro.id] = true; });
      (grupo.sectores || []).forEach(function (sector) { sectorIds[sector.id] = true; });
    });
    byId('groupKPIs').innerHTML =
      '<div class="ops-card"><div class="ops-muted">Grupos activos</div><div class="stat-value">' + activos + '</div><div class="ops-small">' + state.grupos.length + ' en total</div></div>' +
      '<div class="ops-card"><div class="ops-muted">Supervisores</div><div class="stat-value">' + Object.keys(supervisorIds).length + '</div><div class="ops-small">con grupo asignado</div></div>' +
      '<div class="ops-card"><div class="ops-muted">Encargados</div><div class="stat-value">' + Object.keys(miembroIds).length + '</div><div class="ops-small">integrados a un grupo</div></div>' +
      '<div class="ops-card"><div class="ops-muted">Sectores cubiertos</div><div class="stat-value">' + Object.keys(sectorIds).length + '</div><div class="ops-small">según supervisor</div></div>';
  }

  function gruposFiltrados() {
    var buscar = normalizar(state.filtros.buscar).trim();
    var supervisor = state.filtros.supervisor;
    var estado = state.filtros.estado;
    return state.grupos.filter(function (grupo) {
      if (supervisor && String(grupo.supervisor_id) !== String(supervisor)) return false;
      if (estado === '1' && !grupo.activo) return false;
      if (estado === '0' && grupo.activo) return false;
      if (!buscar) return true;
      var texto = [
        grupo.nombre,
        grupo.descripcion,
        grupo.supervisor_nombre,
        (grupo.miembros || []).map(function (miembro) {
          return nombreUsuario(miembro) + ' ' + (miembro.username || '');
        }).join(' '),
        (grupo.sectores || []).map(function (sector) { return sector.nombre; }).join(' ')
      ].join(' ');
      return normalizar(texto).indexOf(buscar) !== -1;
    });
  }

  function renderGrupos() {
    var grid = byId('groupsGrid');
    var grupos = gruposFiltrados();
    if (!grupos.length) {
      grid.innerHTML = Ops.vacio(
        state.grupos.length ? 'Sin grupos para estos filtros' : 'Todavía no hay grupos de trabajo',
        state.grupos.length
          ? 'Ajusta la búsqueda o los filtros para ver otros grupos.'
          : 'Crea el primer grupo y asigna un supervisor con sus encargados.'
      );
      return;
    }
    grid.innerHTML = grupos.map(tarjetaGrupo).join('');
  }

  function tarjetaGrupo(grupo) {
    var color = grupo.color || '#5E7A55';
    var sectores = grupo.sectores || [];
    var miembros = grupo.miembros || [];
    var chipsSectores = sectores.slice(0, 4).map(function (sector) {
      return '<span class="group-chip"><span class="dot" style="background:' + Ops.escape(sector.color || color) + '"></span>' +
        Ops.escape(sector.nombre) + '</span>';
    }).join('');
    if (sectores.length > 4) {
      chipsSectores += '<span class="group-chip">+' + (sectores.length - 4) + ' sectores</span>';
    }
    if (!chipsSectores) {
      chipsSectores = '<span class="group-empty-inline">Sin sectores asignados al supervisor.</span>';
    }
    var chipsMiembros = miembros.slice(0, 5).map(function (miembro) {
      return '<span class="group-member" title="' + Ops.escape(nombreUsuario(miembro)) + '">' +
        '<span class="group-member-avatar">' + Ops.escape(iniciales(nombreUsuario(miembro))) + '</span>' +
        Ops.escape(nombreUsuario(miembro).split(' ')[0]) +
        '</span>';
    }).join('');
    if (miembros.length > 5) {
      chipsMiembros += '<span class="group-member">+' + (miembros.length - 5) + '</span>';
    }
    if (!chipsMiembros) {
      chipsMiembros = '<span class="group-empty-inline">Sin encargados asignados.</span>';
    }
    return '<article class="group-card' + (grupo.activo ? '' : ' is-inactive') + '" style="--group-color:' + Ops.escape(color) + '" data-group-id="' + grupo.id + '">' +
      '<div class="group-card-head">' +
        '<span class="group-swatch"></span>' +
        '<div><h3>' + Ops.escape(grupo.nombre) + '</h3>' +
          '<div class="ops-muted">Supervisor: ' + Ops.escape(grupo.supervisor_nombre || 'Sin asignar') + '</div></div>' +
        '<span class="ops-pill ' + (grupo.activo ? '' : 'neutral') + '">' + (grupo.activo ? 'Activo' : 'Inactivo') + '</span>' +
      '</div>' +
      (grupo.descripcion ? '<p class="group-card-description">' + Ops.escape(grupo.descripcion) + '</p>' : '') +
      '<div class="group-stats">' +
        '<div><strong>' + grupo.total_miembros + '</strong><span>Encargados</span></div>' +
        '<div><strong>' + grupo.total_sectores + '</strong><span>Sectores</span></div>' +
        '<div><strong>' + grupo.tareas_abiertas + '</strong><span>Tareas abiertas</span></div>' +
      '</div>' +
      '<div class="group-chip-row">' + chipsSectores + '</div>' +
      '<div class="group-members">' + chipsMiembros + '</div>' +
      '<div class="group-card-actions">' +
        '<button type="button" class="btn-secondary btn-small" data-group-action="ver"><i class="ph ph-eye"></i> Detalle</button>' +
        '<button type="button" class="btn-icon" data-group-action="editar" title="Editar grupo" aria-label="Editar grupo"><i class="ph ph-pencil-simple"></i></button>' +
        '<button type="button" class="btn-icon danger" data-group-action="eliminar" title="Eliminar grupo" aria-label="Eliminar grupo"><i class="ph ph-trash"></i></button>' +
      '</div>' +
    '</article>';
  }

  function abrirModal(grupoId) {
    var grupo = grupoId ? grupoPorId(grupoId) : null;
    state.editingId = grupo ? grupo.id : null;
    byId('groupForm').reset();
    byId('groupId').value = grupo ? grupo.id : '';
    byId('groupModalTitle').textContent = grupo ? 'Editar grupo de trabajo' : 'Nuevo grupo de trabajo';
    byId('groupSaveBtn').textContent = grupo ? 'Guardar cambios' : 'Guardar grupo';
    byId('groupNombre').value = grupo ? (grupo.nombre || '') : '';
    byId('groupDescripcion').value = grupo ? (grupo.descripcion || '') : '';
    byId('groupColor').value = (grupo && grupo.color) || '#5E7A55';
    byId('groupActivo').checked = grupo ? Boolean(grupo.activo) : true;
    byId('groupMemberSearch').value = '';
    llenarSupervisores(grupo ? grupo.supervisor_id : null);
    llenarMiembros(grupo);
    Ops.abrirModal('groupModal');
  }

  function llenarSupervisores(seleccionado) {
    var select = byId('groupSupervisor');
    var lista = supervisoresActivos().slice();
    var actual = seleccionado || Number(select.value) || null;
    if (actual) {
      var existente = state.usuarios.find(function (usuario) { return usuario.id === actual; });
      if (existente && !lista.some(function (usuario) { return usuario.id === actual; })) {
        lista.push(existente);
      }
    }
    select.innerHTML = '<option value="">Selecciona un supervisor</option>' + lista.map(function (usuario) {
      return '<option value="' + usuario.id + '">' +
        Ops.escape(nombreUsuario(usuario)) +
        (usuario.activo ? '' : ' (inactivo)') +
        '</option>';
    }).join('');
    select.value = actual ? String(actual) : '';
  }

  function llenarMiembros(grupo) {
    var seleccionados = {};
    (grupo && grupo.miembros || []).forEach(function (miembro) {
      seleccionados[miembro.id] = true;
    });
    var lista = encargadosActivos();
    if (grupo) {
      (grupo.miembros || []).forEach(function (miembro) {
        if (!lista.some(function (item) { return item.id === miembro.id; })) {
          lista.push(miembro);
        }
      });
    }
    lista.sort(function (a, b) { return nombreUsuario(a).localeCompare(nombreUsuario(b)); });
    var contenedor = byId('groupMemberOptions');
    if (!lista.length) {
      contenedor.innerHTML = '<div class="ops-muted">No hay encargados activos disponibles. Crea uno desde Usuarios.</div>';
      actualizarContadorMiembros();
      return;
    }
    contenedor.innerHTML = lista.map(function (usuario) {
      var equipo = equipoPorId(usuario.id);
      var otroGrupo = grupoDeEncargado(usuario.id, state.editingId);
      var meta = '@' + (usuario.username || 'usuario');
      if (equipo) {
        meta += ' · ' + (equipo.tareas_pendientes || 0) + ' tareas pendientes';
      }
      return '<label class="group-member-option' + (seleccionados[usuario.id] ? ' is-selected' : '') + '">' +
        '<input type="checkbox" value="' + usuario.id + '"' + (seleccionados[usuario.id] ? ' checked' : '') + '>' +
        '<span><strong>' + Ops.escape(nombreUsuario(usuario)) + '</strong>' +
          '<small>' + Ops.escape(meta) + '</small>' +
          (otroGrupo ? '<small class="group-member-warning">Ya está en ' + Ops.escape(otroGrupo.nombre) + '</small>' : '') +
        '</span>' +
      '</label>';
    }).join('');
    actualizarContadorMiembros();
  }

  function actualizarContadorMiembros() {
    var total = document.querySelectorAll('#groupMemberOptions input[type="checkbox"]:checked').length;
    byId('groupMemberCount').textContent = total + ' seleccionado' + (total === 1 ? '' : 's');
    document.querySelectorAll('#groupMemberOptions .group-member-option').forEach(function (label) {
      var checkbox = label.querySelector('input[type="checkbox"]');
      label.classList.toggle('is-selected', Boolean(checkbox && checkbox.checked));
    });
  }

  function filtrarMiembros() {
    var texto = normalizar(byId('groupMemberSearch').value).trim();
    document.querySelectorAll('#groupMemberOptions .group-member-option').forEach(function (label) {
      label.hidden = Boolean(texto) && normalizar(label.textContent).indexOf(texto) === -1;
    });
  }

  function miembrosSeleccionados() {
    return Array.prototype.map.call(
      document.querySelectorAll('#groupMemberOptions input[type="checkbox"]:checked'),
      function (checkbox) { return Number(checkbox.value); }
    );
  }

  function guardar(event) {
    event.preventDefault();
    var boton = byId('groupSaveBtn');
    var supervisorId = Number(byId('groupSupervisor').value) || null;
    if (!supervisorId) {
      showToast('Selecciona un supervisor para el grupo.', 'error');
      return;
    }
    var payload = {
      nombre: byId('groupNombre').value.trim(),
      descripcion: byId('groupDescripcion').value.trim() || null,
      supervisor_id: supervisorId,
      color: byId('groupColor').value,
      activo: byId('groupActivo').checked,
      miembros: miembrosSeleccionados()
    };
    boton.disabled = true;
    var accion = state.editingId
      ? Ops.put('/grupos/' + state.editingId, payload)
      : Ops.post('/grupos/', payload);
    accion.then(function () {
      Ops.cerrarModal('groupModal');
      showToast(state.editingId ? 'Grupo actualizado.' : 'Grupo creado.', 'success');
      state.editingId = null;
      return cargar();
    }).catch(function (error) {
      showToast(error.message, 'error');
    }).finally(function () {
      boton.disabled = false;
    });
  }

  function verDetalle(grupoId) {
    state.detalleId = grupoId;
    byId('groupDetailBody').innerHTML =
      '<div class="ops-empty"><i class="ph ph-circle-notch"></i><h3>Cargando grupo...</h3></div>';
    Ops.abrirModal('groupDetailModal');
    Ops.get('/grupos/' + grupoId).then(function (grupo) {
      renderDetalle(grupo);
    }).catch(function (error) {
      byId('groupDetailBody').innerHTML = Ops.vacio('No se pudo cargar el grupo', error.message);
    });
  }

  function renderDetalle(grupo) {
    var color = grupo.color || '#5E7A55';
    var miembros = grupo.miembros || [];
    var sectores = grupo.sectores || [];
    var miembrosHtml = miembros.length
      ? '<div class="group-detail-members">' + miembros.map(function (miembro) {
          return '<div class="group-detail-member">' +
            '<span class="group-member-avatar" style="background:' + Ops.escape(color) + '">' + Ops.escape(iniciales(nombreUsuario(miembro))) + '</span>' +
            '<div class="group-detail-member-info"><strong>' + Ops.escape(nombreUsuario(miembro)) + '</strong>' +
              '<small>@' + Ops.escape(miembro.username) + ' · ' + Ops.escape(miembro.email || 'sin email') + '</small></div>' +
            '<div class="group-detail-member-stats">' +
              '<span class="ops-pill">' + (miembro.tareas_pendientes || 0) + ' tareas</span>' +
              '<span class="ops-pill neutral">' + (miembro.cultivos_count || 0) + ' cultivos</span>' +
              (miembro.incidencias_abiertas ? '<span class="ops-pill warning">' + miembro.incidencias_abiertas + ' incidencias</span>' : '') +
            '</div>' +
          '</div>';
        }).join('') + '</div>'
      : '<p class="ops-muted">Este grupo todavía no tiene encargados.</p>';
    var sectoresHtml = sectores.length
      ? '<div class="group-chip-row">' + sectores.map(function (sector) {
          return '<span class="group-chip"><span class="dot" style="background:' + Ops.escape(sector.color || color) + '"></span>' +
            Ops.escape(sector.nombre) + '</span>';
        }).join('') + '</div>'
      : '<p class="ops-muted">El supervisor no tiene sectores asignados.</p>';

    byId('groupDetailBody').innerHTML =
      '<div class="ops-card-head">' +
        '<div><h3>' + Ops.escape(grupo.nombre) + '</h3>' +
          '<div class="ops-muted">Supervisor: ' + Ops.escape(grupo.supervisor_nombre || 'Sin asignar') + ' · creado ' + Ops.fechaHora(grupo.fecha_creacion) + '</div></div>' +
        '<span class="ops-pill ' + (grupo.activo ? '' : 'neutral') + '">' + (grupo.activo ? 'Activo' : 'Inactivo') + '</span>' +
      '</div>' +
      (grupo.descripcion ? '<p class="group-card-description" style="margin-top:10px">' + Ops.escape(grupo.descripcion) + '</p>' : '') +
      '<div class="group-detail-summary">' +
        '<div><div class="ops-muted">Encargados</div><strong>' + grupo.total_miembros + '</strong></div>' +
        '<div><div class="ops-muted">Sectores</div><strong>' + grupo.total_sectores + '</strong></div>' +
        '<div><div class="ops-muted">Tareas abiertas</div><strong>' + grupo.tareas_abiertas + '</strong></div>' +
        '<div><div class="ops-muted">Incidencias abiertas</div><strong>' + grupo.incidencias_abiertas + '</strong></div>' +
      '</div>' +
      '<div class="group-detail-section"><h3>Sectores del supervisor</h3>' + sectoresHtml + '</div>' +
      '<div class="group-detail-section"><h3>Encargados del grupo</h3>' + miembrosHtml + '</div>' +
      '<div class="group-detail-actions">' +
        '<button type="button" class="btn-primary" data-detail-action="editar"><i class="ph ph-pencil-simple"></i> Editar grupo</button>' +
        '<a class="btn-secondary" href="../pages/equipo.html"><i class="ph ph-users"></i> Abrir equipo</a>' +
        '<button type="button" class="btn-secondary" data-detail-action="eliminar"><i class="ph ph-trash"></i> Eliminar</button>' +
      '</div>';

    var editarBtn = byId('groupDetailBody').querySelector('[data-detail-action="editar"]');
    if (editarBtn) {
      editarBtn.addEventListener('click', function () {
        Ops.cerrarModal('groupDetailModal');
        abrirModal(grupo.id);
      });
    }
    var eliminarBtn = byId('groupDetailBody').querySelector('[data-detail-action="eliminar"]');
    if (eliminarBtn) {
      eliminarBtn.addEventListener('click', function () { eliminarGrupo(grupo.id); });
    }
  }

  function eliminarGrupo(grupoId) {
    var grupo = grupoPorId(grupoId);
    if (!grupo) return;
    Ops.confirmar(
      '¿Eliminar el grupo "' + grupo.nombre + '"? Los encargados no serán eliminados.',
      'Eliminar grupo de trabajo'
    ).then(function (confirmado) {
      if (!confirmado) return;
      Ops.del('/grupos/' + grupoId).then(function () {
        Ops.cerrarModal('groupDetailModal');
        showToast('Grupo eliminado.', 'success');
        return cargar();
      }).catch(function (error) {
        showToast(error.message, 'error');
      });
    });
  }

  function init() {
    var usuario = Ops.usuario();
    if (!usuario || !Ops.esAdmin()) {
      showToast('Acceso denegado. Solo administradores.', 'error');
      window.location.href = '../pages/dashboard.html';
      return;
    }

    byId('groupNewBtn').addEventListener('click', function () { abrirModal(null); });
    byId('groupRefreshBtn').addEventListener('click', function () { cargar(true); });
    byId('groupForm').addEventListener('submit', guardar);
    byId('groupSearch').addEventListener('input', Ops.debounce(function () {
      state.filtros.buscar = byId('groupSearch').value;
      renderGrupos();
    }, 200));
    byId('groupSupervisorFilter').addEventListener('change', function () {
      state.filtros.supervisor = byId('groupSupervisorFilter').value;
      renderGrupos();
    });
    byId('groupStatusFilter').addEventListener('change', function () {
      state.filtros.estado = byId('groupStatusFilter').value;
      renderGrupos();
    });
    byId('groupMemberSearch').addEventListener('input', filtrarMiembros);
    byId('groupMemberOptions').addEventListener('change', actualizarContadorMiembros);

    byId('groupsGrid').addEventListener('click', function (event) {
      var boton = event.target.closest('[data-group-action]');
      if (!boton) return;
      var tarjeta = boton.closest('[data-group-id]');
      if (!tarjeta) return;
      var grupoId = Number(tarjeta.getAttribute('data-group-id'));
      var accion = boton.getAttribute('data-group-action');
      if (accion === 'ver') verDetalle(grupoId);
      else if (accion === 'editar') abrirModal(grupoId);
      else if (accion === 'eliminar') eliminarGrupo(grupoId);
    });

    if (window.AquaUI && typeof AquaUI.registerRefresh === 'function') {
      AquaUI.registerRefresh(function () { cargar(false); });
    }

    cargar(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
