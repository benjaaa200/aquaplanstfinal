(function () {
  'use strict';

  var TIPOS_SECTOR = {
    cultivo: { label: 'Zona de cultivo', icon: 'ph-plant', color: '#5E7A55' },
    deposito: { label: 'Depósito', icon: 'ph-cylinder', color: '#4F7E86' },
    bomba: { label: 'Bomba', icon: 'ph-engine', color: '#B5813F' },
    trabajo: { label: 'Área de trabajo', icon: 'ph-users-three', color: '#8A8352' },
    almacen: { label: 'Almacén', icon: 'ph-warehouse', color: '#A9714E' },
    otro: { label: 'Otro', icon: 'ph-map-pin', color: '#6E7B76' }
  };

  var ORDEN_TIPOS = ['cultivo', 'deposito', 'bomba', 'trabajo', 'almacen', 'otro'];
  var DENSIDADES = ['compacta', 'normal', 'comoda'];

  var state = {
    todos: [],
    visibles: [],
    seleccionado: null,
    overlapIds: {},
    actualizado: null,
    densidad: 'normal',
    cargando: false,
    suprimirClick: false
  };

  var drag = null;

  function clamp(valor, minimo, maximo) {
    return Math.min(maximo, Math.max(minimo, valor));
  }

  function formatoNumero(valor) {
    var numero = Number(valor);
    if (!isFinite(numero)) return '0';
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(numero);
  }

  function plural(cantidad, singular, varios) {
    return Number(cantidad) === 1 ? singular : varios;
  }

  function normalizar(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function colorValido(valor) {
    return /^#[0-9a-fA-F]{6}$/.test(String(valor || '')) ? valor : null;
  }

  function sumar(items, campo) {
    return items.reduce(function (total, item) {
      return total + (Number(item[campo]) || 0);
    }, 0);
  }

  function buscarSector(id) {
    var sectores = state.todos.concat(state.visibles);
    for (var i = 0; i < sectores.length; i += 1) {
      if (sectores[i].id === id) return sectores[i];
    }
    return null;
  }

  function indiceVisible(id) {
    for (var i = 0; i < state.visibles.length; i += 1) {
      if (state.visibles[i].id === id) return i;
    }
    return -1;
  }

  function rectSector(sector) {
    var layout = sector.layout || {};
    var ancho = clamp(parseInt(layout.ancho, 10) || 4, 1, 12);
    var x = clamp(parseInt(layout.posicion_x, 10) || 0, 0, 12 - ancho);
    var alto = clamp(parseInt(layout.alto, 10) || 2, 1, 12);
    var y = clamp(parseInt(layout.posicion_y, 10) || 0, 0, 60);
    return { x: x, y: y, w: ancho, h: alto };
  }

  function seCruzan(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function aplicarFiltros() {
    var estado = document.getElementById('mapEstado').value;
    var tipo = document.getElementById('mapTipo').value;
    var consulta = normalizar(document.getElementById('mapBuscar').value.trim());

    state.visibles = state.todos.filter(function (sector) {
      if (estado === 'activas' && !sector.activa) return false;
      if (estado === 'inactivas' && sector.activa) return false;
      if (tipo) {
        var tieneTipo = (sector.cultivos || []).some(function (cultivo) {
          return String(cultivo.tipo_planta || '').toLowerCase() === tipo.toLowerCase();
        });
        if (!tieneTipo) return false;
      }
      if (consulta) {
        var contenido = normalizar([
          sector.nombre,
          sector.ubicacion,
          sector.descripcion,
          sector.responsable_nombre
        ].join(' '));
        if (contenido.indexOf(consulta) === -1) return false;
      }
      return true;
    });
  }

  function cargar() {
    if (state.cargando) return;
    state.cargando = true;
    alternarCarga(true);
    var canvas = document.getElementById('mapCanvas');
    if (!state.todos.length) {
      canvas.classList.add('is-empty');
      canvas.innerHTML =
        '<div class="ops-empty"><i class="ph ph-circle-notch map-spin"></i>' +
        '<h3>Cargando mapa…</h3><p>Obteniendo instalaciones y su estado operativo.</p></div>';
    }
    Ops.get('/mapa/').then(function (data) {
      state.todos = data.sectores || [];
      state.actualizado = new Date();
      render();
      finalizarCarga();
    }).catch(function (error) {
      showToast(error.message, 'error');
      if (!state.todos.length) {
        canvas.innerHTML = Ops.vacio('No se pudo cargar el mapa', error.message);
      }
      finalizarCarga();
    });
  }

  function finalizarCarga() {
    state.cargando = false;
    alternarCarga(false);
  }

  function alternarCarga(activo) {
    var boton = document.getElementById('mapRefresh');
    if (!boton) return;
    boton.classList.toggle('is-loading', activo);
    boton.disabled = activo;
    var icono = boton.querySelector('i');
    if (icono) icono.className = activo ? 'ph ph-circle-notch' : 'ph ph-arrows-clockwise';
  }

  function render() {
    aplicarFiltros();
    renderKPIs();
    renderTipos();
    renderMapa();
    renderLeyenda();
    renderOverlap();
    renderHint();
    actualizarBotones();
    asegurarSeleccion();
    mostrarActualizado();
  }

  function renderKPIs() {
    var visibles = state.visibles;
    var activos = visibles.filter(function (sector) { return sector.activa; }).length;
    var inactivos = visibles.length - activos;
    var conCultivos = visibles.filter(function (sector) { return sector.cultivos_count > 0; }).length;
    var conIncidencias = visibles.filter(function (sector) { return sector.incidencias_abiertas > 0; }).length;
    var cultivos = sumar(visibles, 'cultivos_count');
    var incidencias = sumar(visibles, 'incidencias_abiertas');
    var alertas = sumar(visibles, 'alertas_count');
    var dispositivos = sumar(visibles, 'dispositivos_count');

    document.getElementById('mapKPIs').innerHTML =
      tarjetaKPI('ph-map-trifold', 'green', 'Sectores', visibles.length,
        activos + ' ' + plural(activos, 'activo', 'activos') + ' · ' +
        inactivos + ' ' + plural(inactivos, 'inactivo', 'inactivos')) +
      tarjetaKPI('ph-plant', 'aqua', 'Cultivos', cultivos,
        'en ' + conCultivos + ' ' + plural(conCultivos, 'sector', 'sectores')) +
      tarjetaKPI('ph-warning-diamond', 'amber', 'Incidencias', incidencias,
        incidencias
          ? conIncidencias + ' ' + plural(conIncidencias, 'sector afectado', 'sectores afectados')
          : 'sin pendientes') +
      tarjetaKPI('ph-broadcast', 'rose', 'Alertas IoT', alertas,
        dispositivos + ' ' + plural(dispositivos, 'dispositivo monitoreado', 'dispositivos monitoreados'));
  }

  function tarjetaKPI(icono, tono, etiqueta, valor, detalle) {
    return '<div class="ops-card map-kpi">' +
      '<span class="map-kpi-icon tone-' + tono + '"><i class="ph ' + icono + '"></i></span>' +
      '<div class="map-kpi-body">' +
        '<div class="ops-muted">' + etiqueta + '</div>' +
        '<div class="map-kpi-value">' + valor + '</div>' +
        '<div class="ops-small">' + detalle + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderTipos() {
    var select = document.getElementById('mapTipo');
    var actual = select.value;
    var tipos = {};
    state.todos.forEach(function (sector) {
      (sector.cultivos || []).forEach(function (cultivo) {
        var nombre = cultivo.tipo_planta;
        if (!nombre) return;
        tipos[nombre] = (tipos[nombre] || 0) + 1;
      });
    });
    var opciones = Object.keys(tipos).sort(function (a, b) {
      return a.localeCompare(b, 'es');
    });
    select.innerHTML = '<option value="">Todos los cultivos</option>' + opciones.map(function (tipo) {
      return '<option value="' + Ops.escape(tipo) + '">' + Ops.escape(tipo) +
        ' (' + tipos[tipo] + ')</option>';
    }).join('');
    if (opciones.indexOf(actual) !== -1) select.value = actual;
  }

  function renderMapa() {
    var canvas = document.getElementById('mapCanvas');
    canvas.setAttribute('data-density', state.densidad);
    state.overlapIds = {};
    canvas.classList.toggle('is-empty', !state.visibles.length);

    if (!state.visibles.length) {
      canvas.innerHTML = estadoVacioMapa();
      return;
    }

    var rectangulos = state.visibles.map(function (sector) {
      return { id: sector.id, rect: rectSector(sector) };
    });
    rectangulos.forEach(function (a) {
      rectangulos.forEach(function (b) {
        if (a.id !== b.id && seCruzan(a.rect, b.rect)) {
          state.overlapIds[a.id] = true;
          state.overlapIds[b.id] = true;
        }
      });
    });

    canvas.innerHTML = state.visibles.map(function (sector) {
      return celdaSector(sector, Boolean(state.overlapIds[sector.id]));
    }).join('');
  }

  function estadoVacioMapa() {
    if (state.todos.length) {
      return '<div class="ops-empty map-empty">' +
        '<span class="map-empty-icon"><i class="ph ph-funnel"></i></span>' +
        '<h3>Sin resultados con estos filtros</h3>' +
        '<p>Prueba con otro estado, cultivo o término de búsqueda para volver a ver tus instalaciones.</p>' +
        '<div class="map-empty-actions">' +
          '<button type="button" class="btn-secondary btn-small" data-map-action="clear">' +
            '<i class="ph ph-funnel-x"></i> Limpiar filtros</button>' +
        '</div>' +
      '</div>';
    }
    return '<div class="ops-empty map-empty">' +
      '<span class="map-empty-icon"><i class="ph ph-map-trifold"></i></span>' +
      '<h3>Aún no hay instalaciones en el mapa</h3>' +
      '<p>Registra tu primera instalación para verla como sector, asignarle cultivos y monitorear sus alertas e incidencias desde un solo lugar.</p>' +
      '<div class="map-empty-actions">' +
        (Ops.esAdmin()
          ? '<a class="btn-primary btn-small" href="../admin/instalaciones.html">' +
            '<i class="ph ph-plus"></i> Crear instalación</a>'
          : '') +
        '<button type="button" class="btn-secondary btn-small" data-map-action="reload">' +
          '<i class="ph ph-arrows-clockwise"></i> Actualizar</button>' +
      '</div>' +
      '<div class="map-empty-steps">' +
        '<span><b>1</b> Crea la instalación</span>' +
        '<span><b>2</b> Asígnale cultivos</span>' +
        '<span><b>3</b> Ajusta su distribución</span>' +
      '</div>' +
    '</div>';
  }

  function celdaSector(sector, superpuesto) {
    var layout = sector.layout || {};
    var clave = TIPOS_SECTOR[layout.tipo_sector] ? layout.tipo_sector : 'cultivo';
    var meta = TIPOS_SECTOR[clave];
    var rect = rectSector(sector);
    var color = colorValido(layout.color) || meta.color;
    var activo = state.seleccionado === sector.id;
    var responsable = sector.responsable_nombre || 'Sin responsable';
    var ubicacion = sector.ubicacion || 'Sin ubicación';
    var area = Number(sector.area_m2) || 0;
    var dispositivos = Number(sector.dispositivos_count) || 0;
    var cultivos = Number(sector.cultivos_count) || 0;
    var incidencias = Number(sector.incidencias_abiertas) || 0;
    var alertas = Number(sector.alertas_count) || 0;
    var estadoTexto = sector.activa ? 'Activo' : 'Inactivo';
    var estilo = 'grid-column:' + (rect.x + 1) + ' / span ' + rect.w +
      ';grid-row:' + (rect.y + 1) + ' / span ' + rect.h +
      ';--tile-accent-color:' + Ops.escape(color) + ';';
    var etiqueta = sector.nombre + ', ' + meta.label + ', ' +
      estadoTexto.toLowerCase() + ', ' + cultivos + ' cultivos, ' + ubicacion;

    return '<button type="button" class="map-tile tipo-' + clave +
      (rect.h === 1 ? ' tile-flat' : '') +
      (rect.w <= 3 ? ' tile-narrow' : '') +
      (sector.activa ? '' : ' inactive') +
      (superpuesto ? ' overlap' : '') +
      (activo ? ' active' : '') + '"' +
      ' style="' + estilo + '"' +
      ' data-sector="' + sector.id + '"' +
      ' aria-pressed="' + (activo ? 'true' : 'false') + '"' +
      ' aria-label="' + Ops.escape(etiqueta) + '"' +
      ' title="' + Ops.escape(etiqueta) + '">' +
      '<span class="tile-accent"></span>' +
      '<span class="tile-head">' +
        '<span class="tile-icon"><i class="ph ' + meta.icon + '"></i></span>' +
        '<span class="tile-type">' + Ops.escape(meta.label) + '</span>' +
        '<span class="tile-status"><span class="tile-status-dot"></span>' +
          '<span class="tile-status-text">' + estadoTexto + '</span></span>' +
      '</span>' +
      '<span class="tile-name">' + Ops.escape(sector.nombre) + '</span>' +
      '<span class="tile-meta"><i class="ph ph-user"></i>' + Ops.escape(responsable) + '</span>' +
      '<span class="tile-meta tile-place"><i class="ph ph-map-pin"></i>' + Ops.escape(ubicacion) + '</span>' +
      '<span class="tile-stats">' +
        '<span title="' + cultivos + ' cultivos"><i class="ph ph-plant"></i>' + cultivos + '</span>' +
        (area
          ? '<span title="' + formatoNumero(area) + ' m²"><i class="ph ph-ruler"></i>' +
            formatoNumero(area) + ' m²</span>'
          : '') +
        (dispositivos
          ? '<span title="' + dispositivos + ' dispositivos"><i class="ph ph-cpu"></i>' +
            dispositivos + '</span>'
          : '') +
        (incidencias
          ? '<span class="danger" title="' + incidencias + ' incidencias abiertas">' +
            '<i class="ph ph-warning"></i>' + incidencias + '</span>'
          : '') +
        (alertas
          ? '<span class="warning" title="' + alertas + ' alertas IoT">' +
            '<i class="ph ph-bell-ringing"></i>' + alertas + '</span>'
          : '') +
      '</span>' +
      (superpuesto
        ? '<span class="tile-overlap" title="Se superpone con otro sector"><i class="ph ph-warning"></i></span>'
        : '') +
    '</button>';
  }

  function renderLeyenda() {
    var conteo = {};
    state.visibles.forEach(function (sector) {
      var clave = (sector.layout || {}).tipo_sector || 'cultivo';
      if (!TIPOS_SECTOR[clave]) clave = 'cultivo';
      conteo[clave] = (conteo[clave] || 0) + 1;
    });
    var claves = Object.keys(conteo).sort(function (a, b) {
      return ORDEN_TIPOS.indexOf(a) - ORDEN_TIPOS.indexOf(b);
    });
    document.getElementById('mapLegend').innerHTML = claves.length
      ? claves.map(function (clave) {
          var meta = TIPOS_SECTOR[clave];
          return '<span><i style="background:' + meta.color + '"></i>' +
            meta.label + ' <b>' + conteo[clave] + '</b></span>';
        }).join('')
      : '<span class="legend-empty"><i class="ph ph-info"></i> Sin sectores visibles.</span>';
  }

  function renderOverlap() {
    var ids = Object.keys(state.overlapIds);
    var caja = document.getElementById('mapOverlap');
    if (!ids.length) {
      caja.hidden = true;
      caja.innerHTML = '';
      return;
    }
    caja.hidden = false;
    caja.innerHTML = '<i class="ph ph-warning"></i>' +
      '<span>' + ids.length + ' sectores se superponen en la cuadrícula.</span>' +
      (Ops.esAdmin()
        ? '<button type="button" class="btn-secondary btn-small" id="mapFixOverlap"><i class="ph ph-magic-wand"></i> Ordenar automáticamente</button>'
        : '<span class="ops-small">Pide a un administrador que reorganice el mapa.</span>');
  }

  function renderHint() {
    var hint = document.getElementById('mapHint');
    if (!hint) return;
    if (!state.todos.length) {
      hint.textContent = 'Aún no hay instalaciones registradas.';
    } else if (state.visibles.length === state.todos.length) {
      hint.textContent = Ops.esAdmin() && state.todos.length > 1
        ? 'Selecciona un sector para ver su detalle. Arrastra los sectores para moverlos en la cuadrícula.'
        : 'Selecciona un sector para consultar su estado y detalle operativo.';
    } else {
      hint.textContent = 'Mostrando ' + state.visibles.length + ' de ' +
        state.todos.length + ' sectores según los filtros.';
    }
  }

  function actualizarBotones() {
    var auto = document.getElementById('mapAutoBtn');
    if (auto) auto.hidden = !Ops.esAdmin() || state.todos.length < 2;
    var config = document.getElementById('mapConfigBtn');
    if (config) config.hidden = !Ops.esAdmin() || !state.todos.length;
    var dragHint = document.getElementById('mapDragHint');
    if (dragHint) dragHint.hidden = !Ops.esAdmin() || !state.todos.length;
  }

  function mostrarActualizado() {
    var etiqueta = document.getElementById('mapUpdated');
    if (!etiqueta) return;
    etiqueta.textContent = state.actualizado
      ? 'Actualizado ' + state.actualizado.toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';
  }

  function asegurarSeleccion() {
    if (!state.visibles.length) {
      state.seleccionado = null;
      if (state.todos.length) {
        renderDetalleVacio(
          'Sin resultados',
          'Ningún sector coincide con los filtros aplicados.'
        );
      } else {
        renderDetalleVacio(
          'Sin instalaciones',
          'Crea una instalación para ver aquí su estado, cultivos y alertas.'
        );
      }
      return;
    }
    var actual = null;
    for (var i = 0; i < state.visibles.length; i += 1) {
      if (state.visibles[i].id === state.seleccionado) {
        actual = state.visibles[i];
        break;
      }
    }
    if (!actual) actual = state.visibles[0];
    state.seleccionado = actual.id;
    renderDetalle(actual);
    marcarActivo();
  }

  function marcarActivo() {
    Array.prototype.forEach.call(
      document.querySelectorAll('#mapCanvas .map-tile'),
      function (tile) {
        var activo = Number(tile.getAttribute('data-sector')) === state.seleccionado;
        tile.classList.toggle('active', activo);
        tile.setAttribute('aria-pressed', activo ? 'true' : 'false');
      }
    );
  }

  function seleccionar(id) {
    var sector = buscarSector(id);
    if (!sector) return;
    state.seleccionado = sector.id;
    marcarActivo();
    renderDetalle(sector);
  }

  function navegarSector(direccion) {
    if (state.visibles.length < 2) return;
    var indice = indiceVisible(state.seleccionado);
    if (indice === -1) return;
    var destino = (indice + (direccion === 'next' ? 1 : -1) + state.visibles.length) %
      state.visibles.length;
    seleccionar(state.visibles[destino].id);
  }

  function renderDetalleVacio(titulo, mensaje) {
    var accion = !state.todos.length && Ops.esAdmin()
      ? '<a class="btn-primary btn-small" href="../admin/instalaciones.html">' +
        '<i class="ph ph-plus"></i> Crear instalación</a>'
      : '';
    document.getElementById('mapDetail').innerHTML =
      '<div class="detail-empty">' +
        '<div class="detail-empty-icon"><i class="ph ph-hand-pointing"></i></div>' +
        '<h3>' + Ops.escape(titulo) + '</h3>' +
        '<p>' + Ops.escape(mensaje) + '</p>' +
        (state.todos.length
          ? '<div class="detail-empty-hints">' +
              '<span><i class="ph ph-cursor-click"></i> Haz clic en una zona</span>' +
              '<span><i class="ph ph-funnel"></i> Filtra por estado o cultivo</span>' +
            '</div>'
          : '') +
        (accion ? '<div class="detail-empty-actions">' + accion + '</div>' : '') +
      '</div>';
  }

  function renderDetalle(sector) {
    var panel = document.getElementById('mapDetail');
    var layout = sector.layout || {};
    var clave = TIPOS_SECTOR[layout.tipo_sector] ? layout.tipo_sector : 'cultivo';
    var meta = TIPOS_SECTOR[clave];
    var indice = indiceVisible(sector.id);
    var total = state.visibles.length;
    panel.setAttribute('aria-live', 'polite');

    var cultivos = (sector.cultivos || []).length
      ? sector.cultivos.map(function (cultivo) {
          var detalle = Ops.escape(cultivo.tipo_planta || 'sin tipo') +
            (cultivo.area_m2 ? ' · ' + Ops.escape(cultivo.area_m2) + ' m²' : '');
          return '<span class="detail-list-item">' +
            '<span><b>' + Ops.escape(cultivo.nombre) + '</b><small>' + detalle + '</small></span>' +
            Ops.estadoPill(cultivo.estado) +
          '</span>';
        }).join('')
      : '<span class="ops-muted">Sin cultivos asociados.</span>';

    var incidencias = (sector.incidencias || []).length
      ? sector.incidencias.map(function (incidencia) {
          return '<span class="detail-list-item">' +
            '<span><b>' + Ops.escape(incidencia.titulo) + '</b>' +
            '<small>' + Ops.fecha(incidencia.fecha_creacion) + '</small></span>' +
            Ops.prioridadPill(incidencia.prioridad) +
          '</span>';
        }).join('')
      : '<span class="ops-muted">Sin incidencias abiertas.</span>';

    var acciones = '' +
      '<a class="btn-ghost btn-small" href="cultivos.html?instalacion=' + sector.id + '">' +
        '<i class="ph ph-plant"></i> Cultivos</a>' +
      '<a class="btn-ghost btn-small" href="incidencias.html?sector=' + sector.id + '">' +
        '<i class="ph ph-warning-diamond"></i> Incidencias</a>' +
      '<a class="btn-ghost btn-small" href="calendario.html?sector=' + sector.id + '">' +
        '<i class="ph ph-calendar-dots"></i> Calendario</a>' +
      (Ops.esAdmin()
        ? '<button type="button" class="btn-ghost btn-small" data-config-sector>' +
          '<i class="ph ph-sliders-horizontal"></i> Distribución</button>' +
          '<a class="btn-ghost btn-small" href="../admin/instalaciones.html">' +
          '<i class="ph ph-gear"></i> Administrar</a>'
        : '');

    panel.innerHTML =
      (total > 1
        ? '<div class="detail-nav">' +
            '<button type="button" class="icon-btn" data-nav="prev" title="Sector anterior" aria-label="Sector anterior">' +
              '<i class="ph ph-caret-left"></i></button>' +
            '<span>' + (indice + 1) + ' de ' + total + '</span>' +
            '<button type="button" class="icon-btn" data-nav="next" title="Sector siguiente" aria-label="Sector siguiente">' +
              '<i class="ph ph-caret-right"></i></button>' +
          '</div>'
        : '') +
      '<div class="detail-hero">' +
        '<div>' +
          '<div class="detail-type"><i class="ph ' + meta.icon + '"></i>' + meta.label + '</div>' +
          '<h2>' + Ops.escape(sector.nombre) + '</h2>' +
          '<div class="detail-place"><i class="ph ph-map-pin"></i>' +
            Ops.escape(sector.ubicacion || 'Sin ubicación registrada') + '</div>' +
        '</div>' +
        '<span class="ops-pill ' + (sector.activa ? '' : 'neutral') + '">' +
          (sector.activa ? 'Activo' : 'Inactivo') +
        '</span>' +
      '</div>' +
      '<div class="detail-stats">' +
        datoDetalle(sector.cultivos_count, 'Cultivos', '') +
        datoDetalle(sector.dispositivos_count, 'Dispositivos', '') +
        datoDetalle(sector.incidencias_abiertas, 'Incidencias', sector.incidencias_abiertas ? 'danger' : '') +
        datoDetalle(sector.alertas_count, 'Alertas IoT', sector.alertas_count ? 'warn' : '') +
      '</div>' +
      '<dl class="detail-kv">' +
        '<dt>Responsable</dt><dd>' + Ops.escape(sector.responsable_nombre || 'Sin asignar') + '</dd>' +
        '<dt>Área</dt><dd>' + (sector.area_m2 ? Ops.escape(sector.area_m2) + ' m²' : '—') + '</dd>' +
        '<dt>Inspección</dt><dd>' + (sector.ultima_inspeccion
          ? Ops.fecha(sector.ultima_inspeccion.fecha)
          : 'Sin registro') + '</dd>' +
        '<dt>Mantención</dt><dd>' + (sector.proximo_mantenimiento
          ? Ops.fechaHora(sector.proximo_mantenimiento.fecha)
          : 'Sin programar') + '</dd>' +
      '</dl>' +
      '<div class="detail-section"><h4>Cultivos</h4>' +
        '<div class="detail-list">' + cultivos + '</div></div>' +
      '<div class="detail-section"><h4>Incidencias abiertas</h4>' +
        '<div class="detail-list">' + incidencias + '</div></div>' +
      '<div class="detail-actions">' + acciones + '</div>';
  }

  function datoDetalle(valor, etiqueta, tono) {
    return '<div class="detail-stat' + (tono ? ' ' + tono : '') + '">' +
      '<b>' + (Number(valor) || 0) + '</b><span>' + etiqueta + '</span></div>';
  }

  function configurar() {
    if (!Ops.esAdmin()) return;
    var sector = buscarSector(state.seleccionado);
    if (!sector) {
      showToast('Selecciona primero un sector en el mapa.', 'info');
      return;
    }
    var layout = sector.layout || {};
    var tipo = TIPOS_SECTOR[layout.tipo_sector] ? layout.tipo_sector : 'cultivo';
    document.getElementById('cfgX').value = layout.posicion_x || 0;
    document.getElementById('cfgY').value = layout.posicion_y || 0;
    document.getElementById('cfgAncho').value = layout.ancho || 4;
    document.getElementById('cfgAlto').value = layout.alto || 2;
    document.getElementById('cfgTipo').value = tipo;
    document.getElementById('cfgColor').value =
      colorValido(layout.color) || TIPOS_SECTOR[tipo].color;
    Ops.abrirModal('mapConfigModal');
  }

  function guardarConfig(event) {
    event.preventDefault();
    if (!state.seleccionado) return;
    var x = Number(document.getElementById('cfgX').value);
    var ancho = Number(document.getElementById('cfgAncho').value);
    if (x + ancho > 12) {
      showToast('La posición X más el ancho no puede superar 12 columnas.', 'error');
      return;
    }
    Ops.put('/mapa/config/' + state.seleccionado, {
      posicion_x: x,
      posicion_y: Number(document.getElementById('cfgY').value),
      ancho: ancho,
      alto: Number(document.getElementById('cfgAlto').value),
      tipo_sector: document.getElementById('cfgTipo').value,
      color: document.getElementById('cfgColor').value
    }).then(function () {
      Ops.cerrarModal('mapConfigModal');
      showToast('Distribución del sector actualizada.', 'success');
      cargar();
    }).catch(function (error) {
      showToast(error.message, 'error');
    });
  }

  function ordenarMapa() {
    if (!Ops.esAdmin()) {
      showToast('Solo un administrador puede reorganizar el mapa.', 'info');
      return;
    }
    var sectores = state.todos.slice().sort(function (a, b) {
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
    if (!sectores.length) return;

    var actualizaciones = [];
    var x = 0;
    var y = 0;
    var altoFila = 0;
    sectores.forEach(function (sector) {
      var layout = sector.layout || {};
      var ancho = clamp(parseInt(layout.ancho, 10) || 4, 1, 12);
      var alto = clamp(parseInt(layout.alto, 10) || 2, 1, 12);
      if (x + ancho > 12) {
        x = 0;
        y += altoFila;
        altoFila = 0;
      }
      actualizaciones.push({
        id: sector.id,
        payload: {
          posicion_x: x,
          posicion_y: y,
          ancho: ancho,
          alto: alto,
          tipo_sector: layout.tipo_sector || 'cultivo',
          color: colorValido(layout.color) || TIPOS_SECTOR[layout.tipo_sector || 'cultivo'].color
        }
      });
      x += ancho;
      altoFila = Math.max(altoFila, alto);
    });

    Ops.confirmar(
      'Se reorganizarán ' + actualizaciones.length +
        ' sectores para eliminar superposiciones. ¿Continuar?',
      'Ordenar mapa'
    ).then(function (confirmado) {
      if (!confirmado) return;
      var boton = document.getElementById('mapAutoBtn');
      if (boton) boton.disabled = true;
      guardarSecuencial(actualizaciones, 0).then(function () {
        if (boton) boton.disabled = false;
        showToast('Distribución reorganizada.', 'success');
        cargar();
      }).catch(function (error) {
        if (boton) boton.disabled = false;
        showToast('No se pudo completar: ' + error.message, 'error');
      });
    });
  }

  function guardarSecuencial(actualizaciones, indice) {
    if (indice >= actualizaciones.length) return Promise.resolve();
    var item = actualizaciones[indice];
    return Ops.put('/mapa/config/' + item.id, item.payload).then(function () {
      return guardarSecuencial(actualizaciones, indice + 1);
    });
  }

  function celdaDesdePunto(clientLeft, clientTop, rect) {
    var canvas = document.getElementById('mapCanvas');
    var caja = canvas.getBoundingClientRect();
    var estilos = window.getComputedStyle(canvas);
    var padIzq = parseFloat(estilos.paddingLeft) || 0;
    var padSup = parseFloat(estilos.paddingTop) || 0;
    var padDer = parseFloat(estilos.paddingRight) || 0;
    var gap = parseFloat(estilos.gap) || 8;
    var anchoUtil = canvas.clientWidth - padIzq - padDer;
    var anchoColumna = Math.max(1, (anchoUtil - gap * 11) / 12);
    var altoFila = parseFloat(estilos.gridAutoRows) || 64;
    var x = Math.round(
      (clientLeft - caja.left - padIzq + canvas.scrollLeft) / (anchoColumna + gap)
    );
    var y = Math.round(
      (clientTop - caja.top - padSup + canvas.scrollTop) / (altoFila + gap)
    );
    return {
      x: clamp(x, 0, 12 - rect.w),
      y: clamp(y, 0, 50)
    };
  }

  function iniciarArrastre(event) {
    if (!Ops.esAdmin() || event.button !== 0 || state.cargando) return;
    if (event.pointerType === 'touch') return;
    var tile = event.target.closest('.map-tile');
    if (!tile) return;
    var sector = buscarSector(Number(tile.getAttribute('data-sector')));
    if (!sector) return;
    var caja = tile.getBoundingClientRect();
    drag = {
      id: sector.id,
      tile: tile,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - caja.left,
      offsetY: event.clientY - caja.top,
      origen: rectSector(sector),
      moved: false
    };
    tile.classList.add('is-draggable');
  }

  function moverArrastre(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var dx = event.clientX - drag.startX;
    var dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    drag.moved = true;
    state.suprimirClick = true;
    event.preventDefault();
    drag.tile.classList.add('dragging');
    drag.tile.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
  }

  function soltarArrastre(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var info = drag;
    drag = null;
    info.tile.classList.remove('dragging', 'is-draggable');
    info.tile.style.transform = '';
    if (!info.moved) return;

    setTimeout(function () { state.suprimirClick = false; }, 250);
    var sector = buscarSector(info.id);
    if (!sector) return;
    var destino = celdaDesdePunto(
      event.clientX - info.offsetX,
      event.clientY - info.offsetY,
      info.origen
    );
    if (destino.x === info.origen.x && destino.y === info.origen.y) return;

    var anterior = { x: info.origen.x, y: info.origen.y };
    var layout = sector.layout || {};
    var tipo = TIPOS_SECTOR[layout.tipo_sector] ? layout.tipo_sector : 'cultivo';
    sector.layout = layout;
    sector.layout.posicion_x = destino.x;
    sector.layout.posicion_y = destino.y;
    state.actualizado = new Date();
    render();

    Ops.put('/mapa/config/' + info.id, {
      posicion_x: destino.x,
      posicion_y: destino.y,
      ancho: info.origen.w,
      alto: info.origen.h,
      tipo_sector: tipo,
      color: colorValido(layout.color) || TIPOS_SECTOR[tipo].color
    }).catch(function (error) {
      sector.layout.posicion_x = anterior.x;
      sector.layout.posicion_y = anterior.y;
      render();
      showToast(
        'No se pudo mover el sector: ' +
          (error && error.message ? error.message : 'error de red'),
        'error'
      );
    });
  }

  function cancelarArrastre() {
    if (!drag) return;
    drag.tile.classList.remove('dragging', 'is-draggable');
    drag.tile.style.transform = '';
    drag = null;
  }

  function restablecer() {
    document.getElementById('mapEstado').value = '';
    document.getElementById('mapTipo').value = '';
    document.getElementById('mapBuscar').value = '';
    state.seleccionado = null;
    render();
    showToast('Filtros restablecidos.', 'info');
  }

  function leerDensidad() {
    try {
      var guardada = localStorage.getItem('aquaplants_mapa_densidad');
      if (DENSIDADES.indexOf(guardada) !== -1) return guardada;
    } catch (error) { /* almacenamiento no disponible */ }
    return 'normal';
  }

  function aplicarDensidad() {
    var canvas = document.getElementById('mapCanvas');
    if (canvas) canvas.setAttribute('data-density', state.densidad);
    Array.prototype.forEach.call(
      document.querySelectorAll('.map-zoom [data-density]'),
      function (boton) {
        var activo = boton.getAttribute('data-density') === state.densidad;
        boton.classList.toggle('active', activo);
        boton.setAttribute('aria-pressed', activo ? 'true' : 'false');
      }
    );
  }

  function setDensidad(valor) {
    if (DENSIDADES.indexOf(valor) === -1) return;
    state.densidad = valor;
    try { localStorage.setItem('aquaplants_mapa_densidad', valor); } catch (error) { /* ignorar */ }
    aplicarDensidad();
  }

  function alternarPantallaCompleta() {
    var tarjeta = document.getElementById('mapCard');
    if (!document.fullscreenElement && tarjeta && tarjeta.requestFullscreen) {
      tarjeta.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  function sincronizarPantallaCompleta() {
    var boton = document.getElementById('mapFullscreen');
    if (!boton) return;
    var activo = Boolean(document.fullscreenElement);
    boton.innerHTML = '<i class="ph ' + (activo ? 'ph-arrows-in' : 'ph-arrows-out') + '"></i>';
    boton.title = activo ? 'Salir de pantalla completa' : 'Pantalla completa';
    boton.setAttribute('aria-label', boton.title);
  }

  function moverFoco(event) {
    var desplazamientos = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 3,
      ArrowUp: -3
    };
    if (!(event.key in desplazamientos)) return;
    var tiles = Array.prototype.slice.call(
      document.querySelectorAll('#mapCanvas .map-tile')
    );
    var indice = tiles.indexOf(document.activeElement);
    if (indice === -1) return;
    event.preventDefault();
    var destino = clamp(indice + desplazamientos[event.key], 0, tiles.length - 1);
    if (tiles[destino]) tiles[destino].focus();
  }

  function init() {
    var user = Ops.usuario();
    if (!user) return;

    state.densidad = leerDensidad();
    aplicarDensidad();
    actualizarBotones();

    var canvas = document.getElementById('mapCanvas');
    canvas.classList.toggle('is-editable', Ops.esAdmin());
    canvas.addEventListener('click', function (event) {
      var accion = event.target.closest('[data-map-action]');
      if (accion) {
        if (accion.getAttribute('data-map-action') === 'clear') restablecer();
        if (accion.getAttribute('data-map-action') === 'reload') cargar();
        return;
      }
      if (state.suprimirClick) {
        state.suprimirClick = false;
        return;
      }
      var tile = event.target.closest('.map-tile');
      if (!tile) return;
      seleccionar(Number(tile.getAttribute('data-sector')));
    });
    canvas.addEventListener('keydown', moverFoco);
    canvas.addEventListener('pointerdown', iniciarArrastre);
    document.addEventListener('pointermove', moverArrastre);
    document.addEventListener('pointerup', soltarArrastre);
    document.addEventListener('pointercancel', cancelarArrastre);
    window.addEventListener('blur', cancelarArrastre);

    document.getElementById('mapEstado').addEventListener('change', render);
    document.getElementById('mapTipo').addEventListener('change', render);
    document.getElementById('mapBuscar').addEventListener('input', Ops.debounce(render, 150));

    document.getElementById('mapRefresh').addEventListener('click', cargar);
    document.getElementById('mapReset').addEventListener('click', restablecer);
    document.getElementById('mapAutoBtn').addEventListener('click', ordenarMapa);
    document.getElementById('mapConfigBtn').addEventListener('click', configurar);
    document.getElementById('mapConfigForm').addEventListener('submit', guardarConfig);
    document.getElementById('mapFullscreen').addEventListener('click', alternarPantallaCompleta);
    document.addEventListener('fullscreenchange', sincronizarPantallaCompleta);

    document.getElementById('mapOverlap').addEventListener('click', function (event) {
      if (event.target.closest('#mapFixOverlap')) ordenarMapa();
    });
    document.getElementById('mapDetail').addEventListener('click', function (event) {
      var nav = event.target.closest('[data-nav]');
      if (nav) {
        navegarSector(nav.getAttribute('data-nav'));
        return;
      }
      if (event.target.closest('[data-config-sector]')) configurar();
    });
    Array.prototype.forEach.call(
      document.querySelectorAll('.map-zoom [data-density]'),
      function (boton) {
        boton.addEventListener('click', function () {
          setDensidad(boton.getAttribute('data-density'));
        });
      }
    );

    cargar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
