(function () {
  'use strict';

  var state = {
    tab: 'productos',
    productos: [],
    catalogo: [],
    sectores: [],
    movimientos: [],
    solicitudes: [],
    alerts: null,
    productoParam: null
  };

  var CATEGORIAS = ['semillas', 'nutrientes', 'fertilizantes', 'herramientas', 'repuestos', 'limpieza', 'materiales', 'otros'];

  function cargarSectores() {
    return Ops.get('/instalaciones/').catch(function () { return []; }).then(function (rows) {
      state.sectores = rows || [];
      Ops.llenarSelect(document.getElementById('movSector'), state.sectores, { label: 'nombre', placeholder: 'Todos' });
      Ops.llenarSelect(document.getElementById('movSectorForm'), state.sectores, { label: 'nombre', placeholder: 'Sin sector' });
      Ops.llenarSelect(document.getElementById('solSectorForm'), state.sectores, { label: 'nombre', placeholder: 'Sin sector' });
    });
  }

  function cargarProductos() {
    var params = [];
    var categoria = document.getElementById('invCategoria').value;
    var buscar = document.getElementById('invBuscar').value.trim();
    if (categoria) params.push('categoria=' + encodeURIComponent(categoria));
    if (buscar) params.push('buscar=' + encodeURIComponent(buscar));
    if (document.getElementById('invBajoStock').checked) params.push('bajo_stock=true');
    return Ops.get('/inventario/productos' + (params.length ? '?' + params.join('&') : '')).then(function (rows) {
      state.productos = rows || [];
      renderProductos();
      cargarCatalogo();
    }).catch(function (error) {
      document.getElementById('invProductBody').innerHTML = '<tr><td colspan="7">' + Ops.vacio('No se pudo cargar el inventario', error.message) + '</td></tr>';
      showToast(error.message, 'error');
    });
  }

  function cargarCatalogo() {
    return Ops.get('/inventario/productos').then(function (rows) {
      state.catalogo = rows || [];
      llenarSelectsProductos();
      cargarKPIs();
    }).catch(function () {});
  }

  function llenarSelectsProductos() {
    var activos = state.catalogo.filter(function (producto) { return producto.activo; });
    var selects = ['movProducto', 'movProductoForm', 'solProductoForm'];
    selects.forEach(function (id) {
      var select = document.getElementById(id);
      if (!select) return;
      var current = select.value;
      var items = id === 'movProducto' ? state.catalogo : activos;
      Ops.llenarSelect(select, items, {
        label: 'nombre',
        placeholder: id === 'movProducto' ? 'Todos' : 'Selecciona un producto'
      });
      if (current) select.value = current;
    });
  }

  function cargarKPIs() {
    Promise.all([
      Ops.get('/inventario/alertas').catch(function () { return null; }),
      Ops.get('/inventario/solicitudes?estado=pendiente').catch(function () { return []; })
    ]).then(function (results) {
      state.alerts = results[0];
      var pendientes = (results[1] || []).length;
      var total = state.catalogo.filter(function (producto) { return producto.activo; }).length;
      var agotados = state.alerts ? state.alerts.agotados : 0;
      var bajos = state.alerts ? state.alerts.bajos : 0;
      document.getElementById('invKPIs').innerHTML =
        '<div class="inv-kpi"><strong>' + total + '</strong><span>Productos activos</span></div>' +
        '<div class="inv-kpi warning"><strong>' + bajos + '</strong><span>Stock bajo</span></div>' +
        '<div class="inv-kpi danger"><strong>' + agotados + '</strong><span>Agotados</span></div>' +
        '<div class="inv-kpi"><strong>' + pendientes + '</strong><span>Solicitudes pendientes</span></div>';
    });
  }

  function renderProductos() {
    var body = document.getElementById('invProductBody');
    if (!state.productos.length) {
      body.innerHTML = '<tr><td colspan="7">' + Ops.vacio('Sin productos', 'Agrega el primer producto al inventario.') + '</td></tr>';
      return;
    }
    body.innerHTML = state.productos.map(function (producto) {
      var total = Math.max(producto.stock_minimo * 2, producto.stock, 1);
      var pct = Math.max(0, Math.min(100, Math.round((producto.stock / total) * 100)));
      var barClass = producto.agotado ? 'out' : (producto.stock_bajo ? 'low' : '');
      var estado = producto.agotado
        ? '<span class="ops-pill danger">Agotado</span>'
        : (producto.stock_bajo ? '<span class="ops-pill warning">Bajo</span>' : '<span class="ops-pill">OK</span>');
      var acciones = '<div class="inv-actions">';
      if (Ops.esStaff() && producto.activo) acciones += '<button type="button" class="btn-icon" data-move="' + producto.id + '" title="Movimiento"><i class="ph ph-arrows-down-up"></i></button>';
      if (Ops.esAdmin()) {
        acciones += '<button type="button" class="btn-icon" data-edit="' + producto.id + '" title="Editar"><i class="ph ph-pencil-simple"></i></button>';
        acciones += '<button type="button" class="btn-icon" data-delete="' + producto.id + '" title="Eliminar"><i class="ph ph-trash"></i></button>';
      }
      acciones += '</div>';
      return '<tr>' +
        '<td><div class="inv-product-name">' + Ops.escape(producto.nombre) + '</div><div class="inv-product-code">' + Ops.escape(producto.codigo) + '</div></td>' +
        '<td>' + Ops.escape(Ops.categoriaLabel(producto.categoria)) + '</td>' +
        '<td><strong>' + producto.stock + ' ' + Ops.escape(producto.unidad) + '</strong><div class="stock-bar ' + barClass + '"><i style="width:' + pct + '%"></i></div></td>' +
        '<td>' + producto.stock_minimo + ' ' + Ops.escape(producto.unidad) + '</td>' +
        '<td>' + Ops.escape(producto.ubicacion || '—') + '</td>' +
        '<td>' + estado + (producto.activo ? '' : ' <span class="ops-pill neutral">Inactivo</span>') + '</td>' +
        '<td>' + acciones + '</td>' +
      '</tr>';
    }).join('');
    body.querySelectorAll('[data-move]').forEach(function (button) {
      button.addEventListener('click', function () { abrirMovimiento(Number(button.getAttribute('data-move'))); });
    });
    body.querySelectorAll('[data-edit]').forEach(function (button) {
      button.addEventListener('click', function () { editarProducto(Number(button.getAttribute('data-edit'))); });
    });
    body.querySelectorAll('[data-delete]').forEach(function (button) {
      button.addEventListener('click', function () { eliminarProducto(Number(button.getAttribute('data-delete'))); });
    });
  }

  function abrirProducto(producto) {
    document.getElementById('productModalTitle').textContent = producto ? 'Editar producto' : 'Nuevo producto';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = producto ? producto.id : '';
    document.getElementById('productActivoGroup').hidden = !producto;
    document.getElementById('productStock').disabled = !!producto;
    if (producto) {
      document.getElementById('productNombre').value = producto.nombre || '';
      document.getElementById('productCodigo').value = producto.codigo || '';
      document.getElementById('productCategoria').value = producto.categoria || 'otros';
      document.getElementById('productUnidad').value = producto.unidad || '';
      document.getElementById('productStock').value = producto.stock;
      document.getElementById('productMinimo').value = producto.stock_minimo;
      document.getElementById('productUbicacion').value = producto.ubicacion || '';
      document.getElementById('productDescripcion').value = producto.descripcion || '';
      document.getElementById('productActivo').checked = !!producto.activo;
    }
    Ops.abrirModal('productModal');
  }

  function editarProducto(id) {
    var producto = state.productos.filter(function (item) { return item.id === id; })[0];
    if (producto) abrirProducto(producto);
  }

  function guardarProducto(event) {
    event.preventDefault();
    var id = document.getElementById('productId').value;
    var payload = {
      nombre: document.getElementById('productNombre').value.trim(),
      codigo: document.getElementById('productCodigo').value.trim(),
      categoria: document.getElementById('productCategoria').value,
      unidad: document.getElementById('productUnidad').value.trim(),
      stock_minimo: Number(document.getElementById('productMinimo').value) || 0,
      ubicacion: document.getElementById('productUbicacion').value.trim() || null,
      descripcion: document.getElementById('productDescripcion').value.trim() || null
    };
    if (!id) payload.stock = Number(document.getElementById('productStock').value) || 0;
    else payload.activo = document.getElementById('productActivo').checked;
    var action = id ? Ops.put('/inventario/productos/' + id, payload) : Ops.post('/inventario/productos', payload);
    action.then(function () {
      Ops.cerrarModal('productModal');
      showToast(id ? 'Producto actualizado.' : 'Producto creado.', 'success');
      cargarProductos();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function eliminarProducto(id) {
    var producto = state.productos.filter(function (item) { return item.id === id; })[0];
    if (!producto) return;
    Ops.confirmar('¿Eliminar "' + producto.nombre + '"? Si tiene historial solo se desactivará.').then(function (ok) {
      if (!ok) return;
      Ops.del('/inventario/productos/' + id).then(function (data) {
        showToast(data && data.message ? data.message : 'Producto eliminado.', 'success');
        cargarProductos();
      }).catch(function (error) { showToast(error.message, 'error'); });
    });
  }

  function abrirMovimiento(productoId) {
    document.getElementById('movementForm').reset();
    document.getElementById('movProductoForm').value = productoId || '';
    Ops.abrirModal('movementModal');
  }

  function abrirSolicitud() {
    document.getElementById('requestForm').reset();
    Ops.abrirModal('requestModal');
  }

  function guardarMovimiento(event) {
    event.preventDefault();
    var payload = {
      producto_id: Number(document.getElementById('movProductoForm').value),
      tipo: document.getElementById('movTipoForm').value,
      cantidad: Number(document.getElementById('movCantidad').value),
      motivo: document.getElementById('movMotivo').value.trim() || null,
      sector_id: Number(document.getElementById('movSectorForm').value) || null
    };
    Ops.post('/inventario/movimientos', payload).then(function () {
      Ops.cerrarModal('movementModal');
      showToast('Movimiento registrado.', 'success');
      cargarProductos();
      cargarMovimientos();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function guardarSolicitud(event) {
    event.preventDefault();
    var payload = {
      producto_id: Number(document.getElementById('solProductoForm').value),
      cantidad: Number(document.getElementById('solCantidad').value),
      motivo: document.getElementById('solMotivo').value.trim() || null,
      sector_id: Number(document.getElementById('solSectorForm').value) || null
    };
    Ops.post('/inventario/solicitudes', payload).then(function () {
      Ops.cerrarModal('requestModal');
      showToast('Solicitud enviada.', 'success');
      switchTab('solicitudes');
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function cargarMovimientos() {
    var params = [];
    var tipo = document.getElementById('movTipo').value;
    var producto = document.getElementById('movProducto').value;
    var sector = document.getElementById('movSector').value;
    if (tipo) params.push('tipo=' + encodeURIComponent(tipo));
    if (producto) params.push('producto_id=' + encodeURIComponent(producto));
    if (sector) params.push('sector_id=' + encodeURIComponent(sector));
    Ops.get('/inventario/movimientos' + (params.length ? '?' + params.join('&') : '')).then(function (rows) {
      state.movimientos = rows || [];
      renderMovimientos();
    }).catch(function (error) {
      document.getElementById('movBody').innerHTML = '<tr><td colspan="7">' + Ops.vacio('No se pudieron cargar los movimientos', error.message) + '</td></tr>';
    });
  }

  function renderMovimientos() {
    var body = document.getElementById('movBody');
    if (!state.movimientos.length) {
      body.innerHTML = '<tr><td colspan="7">' + Ops.vacio('Sin movimientos', 'Aún no se registran entradas, salidas o ajustes.') + '</td></tr>';
      return;
    }
    body.innerHTML = state.movimientos.map(function (movimiento) {
      var signo = movimiento.tipo === 'entrada' ? '+' : (movimiento.tipo === 'salida' ? '−' : '=');
      return '<tr>' +
        '<td>' + Ops.fechaHora(movimiento.fecha_creacion) + '</td>' +
        '<td><strong>' + Ops.escape(movimiento.producto_nombre) + '</strong></td>' +
        '<td><span class="ops-pill ' + (movimiento.tipo === 'salida' ? 'warning' : (movimiento.tipo === 'ajuste' ? 'neutral' : '')) + '">' + Ops.escape(Ops.categoriaLabel(movimiento.tipo)) + '</span></td>' +
        '<td><strong>' + signo + ' ' + movimiento.cantidad + '</strong></td>' +
        '<td>' + Ops.escape(movimiento.usuario_nombre || 'Sistema') + '</td>' +
        '<td>' + Ops.escape(movimiento.sector_nombre || '—') + '</td>' +
        '<td>' + Ops.escape(movimiento.motivo || '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  function cargarSolicitudes() {
    var estado = document.getElementById('solEstado').value;
    Ops.get('/inventario/solicitudes' + (estado ? '?estado=' + encodeURIComponent(estado) : '')).then(function (rows) {
      state.solicitudes = rows || [];
      renderSolicitudes();
    }).catch(function (error) {
      document.getElementById('solBody').innerHTML = '<tr><td colspan="7">' + Ops.vacio('No se pudieron cargar las solicitudes', error.message) + '</td></tr>';
    });
  }

  function renderSolicitudes() {
    var body = document.getElementById('solBody');
    if (!state.solicitudes.length) {
      body.innerHTML = '<tr><td colspan="7">' + Ops.vacio('Sin solicitudes', 'Las solicitudes de insumos aparecerán aquí.') + '</td></tr>';
      return;
    }
    body.innerHTML = state.solicitudes.map(function (solicitud) {
      var acciones = '';
      if (Ops.esStaff() && solicitud.estado === 'pendiente') {
        acciones = '<button type="button" class="btn-secondary btn-small" data-resolve="' + solicitud.id + '">Resolver</button>';
      }
      return '<tr>' +
        '<td>' + Ops.fechaHora(solicitud.fecha_creacion) + '</td>' +
        '<td><strong>' + Ops.escape(solicitud.producto_nombre) + '</strong><div class="ops-small">' + Ops.escape(solicitud.motivo || '') + '</div></td>' +
        '<td>' + solicitud.cantidad + '</td>' +
        '<td>' + Ops.escape(solicitud.solicitante_nombre || '—') + '</td>' +
        '<td>' + Ops.escape(solicitud.sector_nombre || '—') + '</td>' +
        '<td>' + Ops.estadoPill(solicitud.estado) + '</td>' +
        '<td>' + acciones + '</td>' +
      '</tr>';
    }).join('');
    body.querySelectorAll('[data-resolve]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = Number(button.getAttribute('data-resolve'));
        var solicitud = state.solicitudes.filter(function (item) { return item.id === id; })[0];
        if (!solicitud) return;
        document.getElementById('resolveForm').reset();
        document.getElementById('resolveId').value = solicitud.id;
        document.getElementById('resolveInfo').innerHTML =
          '<strong>' + Ops.escape(solicitud.producto_nombre) + '</strong> · ' +
          solicitud.cantidad + ' unidades · ' + Ops.escape(solicitud.solicitante_nombre || '') +
          '<br>' + Ops.escape(solicitud.motivo || 'Sin motivo indicado');
        Ops.abrirModal('resolveModal');
      });
    });
  }

  function resolverSolicitud(event) {
    event.preventDefault();
    var id = document.getElementById('resolveId').value;
    var payload = {
      estado: document.getElementById('resolveEstado').value,
      comentario: document.getElementById('resolveComentario').value.trim() || null
    };
    Ops.put('/inventario/solicitudes/' + id, payload).then(function () {
      Ops.cerrarModal('resolveModal');
      showToast('Solicitud resuelta.', 'success');
      cargarSolicitudes();
      cargarProductos();
    }).catch(function (error) { showToast(error.message, 'error'); });
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.ops-tabs button').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== tab;
    });
    if (tab === 'productos') cargarProductos();
    if (tab === 'movimientos') cargarMovimientos();
    if (tab === 'solicitudes') cargarSolicitudes();
  }

  function init() {
    var user = Ops.usuario();
    if (!user) return;
    var params = Ops.params();
    state.productoParam = params.get('producto');
    var initialTab = params.get('tab');
    if (['productos', 'movimientos', 'solicitudes'].indexOf(initialTab) === -1) initialTab = 'productos';

    document.getElementById('invNewBtn').hidden = !Ops.esAdmin();
    document.getElementById('invMovBtn').hidden = !Ops.esStaff();
    document.getElementById('movNewBtn').hidden = !Ops.esStaff();

    cargarSectores().then(function () {
      cargarProductos().then(function () {
        if (state.productoParam) {
          document.getElementById('movProducto').value = state.productoParam;
        }
        switchTab(initialTab);
      });
    });

    document.querySelectorAll('.ops-tabs button').forEach(function (button) {
      button.addEventListener('click', function () { switchTab(button.getAttribute('data-tab')); });
    });
    document.getElementById('invNewBtn').addEventListener('click', function () { abrirProducto(null); });
    document.getElementById('invMovBtn').addEventListener('click', function () { abrirMovimiento(null); });
    document.getElementById('movNewBtn').addEventListener('click', function () { abrirMovimiento(null); });
    document.getElementById('solNewBtn').addEventListener('click', abrirSolicitud);
    document.getElementById('productForm').addEventListener('submit', guardarProducto);
    document.getElementById('movementForm').addEventListener('submit', guardarMovimiento);
    document.getElementById('requestForm').addEventListener('submit', guardarSolicitud);
    document.getElementById('resolveForm').addEventListener('submit', resolverSolicitud);

    document.getElementById('invCategoria').addEventListener('change', cargarProductos);
    document.getElementById('invBajoStock').addEventListener('change', cargarProductos);
    document.getElementById('invBuscar').addEventListener('input', Ops.debounce(cargarProductos, 350));
    ['movTipo', 'movProducto', 'movSector'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', cargarMovimientos);
    });
    document.getElementById('solEstado').addEventListener('change', cargarSolicitudes);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
