/**
 * AquaPlants · Dispositivos IoT
 * Vista de monitoreo de la red de sensores AquaBrain.
 * Consume exclusivamente la API real: /dispositivos/, /instalaciones/.
 * La gestión (alta, cambio de estado y baja) queda limitada a administradores
 * y se valida también en el backend.
 */
(function () {
    'use strict';

    var state = {
        devices: [],
        instalaciones: [],
        puedeGestionar: false,
        loading: true,
        query: '',
        status: 'all',
        type: 'all',
        instalacion: 'all',
        sort: 'name',
        view: 'grid',
        lastSync: null,
        selectedId: null,
        signature: '',
        changed: true
    };

    var STATUS_META = {
        online: { label: 'En línea', icon: 'ph-wifi-high' },
        offline: { label: 'Sin conexión', icon: 'ph-wifi-slash' },
        maintenance: { label: 'Mantenimiento', icon: 'ph-wrench' }
    };

    var TYPE_META = {
        sensor: { label: 'Sensor', icon: 'ph-thermometer' },
        actuador: { label: 'Actuador', icon: 'ph-plugs' },
        controlador: { label: 'Controlador', icon: 'ph-cpu' }
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        var user = typeof checkAuth === 'function' ? checkAuth() : null;
        if (!user) return;

        var role = String(user.role || user.rol || '').toLowerCase();
        state.puedeGestionar = role === 'admin' || role === 'administrador';

        try {
            state.view = localStorage.getItem('aqua_devices_view') === 'list' ? 'list' : 'grid';
        } catch (error) {
            state.view = 'grid';
        }

        applyPermissions();
        bindEvents();
        setView(state.view);
        setLoading(true);

        await loadInstalaciones();
        await loadDevices(false);

        state.loading = false;
        renderAll();
        registerAutoRefresh();
        openDeviceFromUrl();
    }

    function openDeviceFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var deviceId = params.get('device');
        if (!deviceId) return;
        if (state.devices.some(function (item) {
            return String(item.id) === String(deviceId);
        })) {
            openDrawer(deviceId);
        }
    }

    function applyPermissions() {
        var create = byId('devx-create');
        if (create) create.hidden = !state.puedeGestionar;
    }

    /* ============================================================
       CARGA DE DATOS
       ============================================================ */

    async function loadInstalaciones() {
        try {
            var respuesta = await apiClient.get('/instalaciones/');
            state.instalaciones = Array.isArray(respuesta) ? respuesta : [];
        } catch (error) {
            state.instalaciones = [];
        }
        populateInstallSelects();
    }

    async function loadDevices(silent) {
        try {
            var respuesta = await apiClient.get('/dispositivos/');
            var mapped = (Array.isArray(respuesta) ? respuesta : []).map(mapDevice);
            var firma = deviceSignature(mapped);
            state.changed = firma !== state.signature;
            state.signature = firma;
            state.devices = mapped;
            state.lastSync = new Date();
            return true;
        } catch (error) {
            if (!silent) {
                showToast(error.message || 'No se pudieron cargar los dispositivos.', 'error');
            }
            return false;
        }
    }

    function deviceSignature(lista) {
        return lista.map(function (d) {
            return [d.id, d.nombre, d.tipo, d.estado, d.mac, d.ip, d.puerto, d.instalacion_id, d.modelo, d.ultimaconexion].join('|');
        }).join('~');
    }

    function mapDevice(d) {
        return {
            id: d.id,
            nombre: d.nombre || ('Dispositivo ' + d.id),
            tipo: String(d.tipo || 'sensor').toLowerCase(),
            modelo: d.modelo || '',
            mac: d.direccion_mac || '',
            ip: d.direccion_ip || '',
            puerto: d.puerto || 80,
            descripcion: d.descripcion || '',
            instalacion_id: d.instalacion_id === undefined ? null : d.instalacion_id,
            instalacion: d.instalacion_nombre || 'Sin instalación',
            estado: d.estado || '',
            status: normalizeEstado(d.estado),
            ultimaconexion: d.ultimaconexion || null,
            fechacreacion: d.fecha_creacion || null
        };
    }

    function normalizeEstado(estado) {
        var valor = String(estado || '').toLowerCase();
        if (valor === 'activo' || valor === 'online') return 'online';
        if (valor === 'mantenimiento' || valor === 'maintenance') return 'maintenance';
        return 'offline';
    }

    function isActive(device) {
        var valor = String(device.estado || '').toLowerCase();
        return valor === 'activo' || valor === 'online';
    }

    function populateInstallSelects() {
        var filter = byId('devx-filter-install');
        var modal = byId('devx-install');
        var options = state.instalaciones.map(function (item) {
            return '<option value="' + esc(item.id) + '">' +
                esc(item.nombre || ('Instalación ' + item.id)) +
                '</option>';
        }).join('');

        if (filter) {
            var actual = filter.value || state.instalacion || 'all';
            filter.innerHTML = '<option value="all">Todas las instalaciones</option>' + options;
            var existe = state.instalaciones.some(function (item) {
                return String(item.id) === String(actual);
            });
            filter.value = existe ? actual : 'all';
            state.instalacion = filter.value;
        }
        if (modal) {
            modal.innerHTML = '<option value="">Sin asignar</option>' + options;
        }
    }

    function registerAutoRefresh() {
        if (window.AquaUI && typeof window.AquaUI.registerRefresh === 'function') {
            window.AquaUI.registerRefresh(function () {
                refreshSilently();
            });
        }
    }

    async function refreshSilently() {
        var ok = await loadDevices(true);
        if (!ok) return;
        if (state.changed) renderAll();
        else renderResultsMeta();
    }

    /* ============================================================
       RENDER
       ============================================================ */

    function renderAll() {
        renderSummary();
        renderHealth();
        renderDistribution();
        renderSegments();
        renderGrid();
        renderResultsMeta();
        updateClearButton();
    }

    function countByStatus() {
        var counts = { total: state.devices.length, online: 0, offline: 0, maintenance: 0 };
        state.devices.forEach(function (device) {
            counts[device.status] = (counts[device.status] || 0) + 1;
        });
        return counts;
    }

    function renderSummary() {
        var counts = countByStatus();
        var instalaciones = state.devices.reduce(function (set, device) {
            if (device.instalacion_id !== null && device.instalacion_id !== undefined) {
                set.add(device.instalacion_id);
            }
            return set;
        }, new Set());
        var disponibilidad = counts.total ? Math.round((counts.online / counts.total) * 100) : 0;

        setCounter(byId('devx-kpi-total'), counts.total);
        setCounter(byId('devx-kpi-online'), counts.online);
        setCounter(byId('devx-kpi-offline'), counts.offline);
        setCounter(byId('devx-kpi-maintenance'), counts.maintenance);
        setCounter(byId('devx-hero-total'), counts.total);

        setText('devx-kpi-total-sub', counts.total
            ? counts.total + (counts.total === 1 ? ' dispositivo en ' : ' dispositivos en ') +
              instalaciones.size + (instalaciones.size === 1 ? ' instalación' : ' instalaciones')
            : 'Sin datos aún');
        setText('devx-kpi-online-sub', 'Disponibilidad ' + disponibilidad + '%');
        setText('devx-kpi-offline-sub', counts.offline ? 'Requieren revisión' : 'Todas responden');
        setText('devx-kpi-maintenance-sub', counts.maintenance ? 'Fuera de servicio' : 'Ninguno en taller');
    }

    function renderHealth() {
        var counts = countByStatus();
        var donut = byId('devx-donut');
        var chip = byId('devx-availability-chip');
        var valor = byId('devx-donut-value');

        if (!counts.total) {
            if (donut) donut.style.background = 'conic-gradient(var(--devx-border) 0 100%)';
            if (valor) valor.textContent = '--';
            if (chip) chip.textContent = 'Sin datos';
        } else {
            var pOnline = (counts.online / counts.total) * 100;
            var pMaint = (counts.maintenance / counts.total) * 100;
            var pOffline = (counts.offline / counts.total) * 100;
            if (donut) {
                donut.style.background = 'conic-gradient(' +
                    'var(--devx-green) 0 ' + pOnline + '%, ' +
                    'var(--devx-amber) ' + pOnline + '% ' + (pOnline + pMaint) + '%, ' +
                    'var(--devx-red) ' + (pOnline + pMaint) + '% 100%)';
            }
            if (valor) valor.textContent = Math.round(pOnline) + '%';
            if (chip) chip.textContent = Math.round(pOnline) + '% disponible';
            setText('devx-legend-online-pct', Math.round(pOnline) + '%');
            setText('devx-legend-offline-pct', Math.round(pOffline) + '%');
            setText('devx-legend-maintenance-pct', Math.round(pMaint) + '%');
        }

        setText('devx-legend-online', counts.online);
        setText('devx-legend-offline', counts.offline);
        setText('devx-legend-maintenance', counts.maintenance);
    }

    function renderDistribution() {
        var list = byId('devx-install-list');
        if (!list) return;

        var grupos = new Map();
        state.devices.forEach(function (device) {
            var clave = device.instalacion || 'Sin instalación';
            grupos.set(clave, (grupos.get(clave) || 0) + 1);
        });

        var filas = Array.from(grupos.entries()).sort(function (a, b) {
            return b[1] - a[1];
        }).slice(0, 6);

        if (!filas.length) {
            list.innerHTML = '<p class="devx-placeholder">Sin instalaciones registradas.</p>';
            return;
        }

        var maximo = filas.reduce(function (max, fila) {
            return Math.max(max, fila[1]);
        }, 1);

        list.innerHTML = filas.map(function (fila) {
            var ancho = Math.max(6, Math.round((fila[1] / maximo) * 100));
            return '<div class="devx-dist-row">' +
                '<div class="devx-dist-top">' +
                    '<span class="devx-dist-name" title="' + esc(fila[0]) + '">' + esc(fila[0]) + '</span>' +
                    '<span class="devx-dist-count"><strong>' + fila[1] + '</strong> disp.</span>' +
                '</div>' +
                '<div class="devx-bar"><span class="devx-bar-fill" style="width:' + ancho + '%"></span></div>' +
            '</div>';
        }).join('');
    }

    function renderSegments() {
        var counts = countByStatus();
        var mapa = {
            all: counts.total,
            online: counts.online,
            offline: counts.offline,
            maintenance: counts.maintenance
        };

        document.querySelectorAll('#devx-status-filter [data-status]').forEach(function (boton) {
            var clave = boton.getAttribute('data-status');
            var activo = clave === state.status;
            boton.classList.toggle('is-active', activo);
            boton.setAttribute('aria-selected', activo ? 'true' : 'false');
            var badge = boton.querySelector('[data-count]');
            if (badge) badge.textContent = mapa[clave] || 0;
        });
    }

    function renderGrid() {
        var grid = byId('devx-grid');
        if (!grid) return;

        if (state.loading) {
            grid.innerHTML = skeletonMarkup();
            return;
        }

        if (!state.devices.length) {
            grid.innerHTML = emptyState('no-devices');
            return;
        }

        var filtrados = filteredDevices();
        if (!filtrados.length) {
            grid.innerHTML = emptyState('no-results');
            return;
        }

        grid.innerHTML = filtrados.map(cardTemplate).join('');
    }

    function cardTemplate(device) {
        var status = STATUS_META[device.status] || STATUS_META.offline;
        var tipo = TYPE_META[device.tipo] || TYPE_META.sensor;
        var tiempo = device.ultimaconexion ? relativeTime(device.ultimaconexion) : 'Sin telemetría aún';
        var mac = device.mac
            ? '<button type="button" class="devx-mac" data-copy="' + esc(device.mac) + '" title="Copiar MAC">' +
                '<i class="ph ph-copy"></i>' + esc(device.mac) + '</button>'
            : '<span class="devx-mac is-empty"><i class="ph ph-plug"></i>Sin MAC registrada</span>';
        var ipMeta = device.ip
            ? '<span title="' + esc(device.ip + ':' + device.puerto) + '"><i class="ph ph-globe"></i>' +
                esc(device.ip + ':' + device.puerto) + '</span>'
            : '';

        var toggle = state.puedeGestionar
            ? '<button type="button" data-action="toggle" title="' + (isActive(device) ? 'Desactivar' : 'Activar') + '">' +
                '<i class="ph ph-power"></i></button>'
            : '';
        var remove = state.puedeGestionar
            ? '<button type="button" data-action="delete" title="Eliminar"><i class="ph ph-trash"></i></button>'
            : '';

        return '<article class="devx-card" data-id="' + device.id + '" data-type="' + esc(device.tipo) + '" data-status="' + device.status + '" tabindex="0" role="button" aria-label="Ver detalle de ' + esc(device.nombre) + '">' +
            '<div class="devx-card-top">' +
                '<div class="devx-card-icon"><i class="ph ' + tipo.icon + '"></i></div>' +
                '<div class="devx-card-heading">' +
                    '<h3 title="' + esc(device.nombre) + '">' + esc(device.nombre) + '</h3>' +
                    mac +
                '</div>' +
                '<span class="devx-badge devx-badge-' + device.status + '">' +
                    '<span class="devx-pulse"></span>' + status.label +
                '</span>' +
            '</div>' +
            '<div class="devx-card-meta">' +
                '<span title="' + esc(device.instalacion) + '"><i class="ph ph-buildings"></i>' + esc(device.instalacion) + '</span>' +
                '<span title="' + esc(device.modelo || 'Sin modelo') + '"><i class="ph ph-tag"></i>' + esc(device.modelo || 'Sin modelo') + '</span>' +
                ipMeta +
            '</div>' +
            '<div class="devx-card-foot">' +
                '<span class="devx-card-time ' + (device.ultimaconexion ? '' : 'is-muted') + '" title="' +
                    (device.ultimaconexion ? esc(fullDate(device.ultimaconexion)) : 'El dispositivo aún no recibe telemetría') + '">' +
                    '<i class="ph ph-clock"></i>' + esc(tiempo) +
                '</span>' +
                '<div class="devx-card-actions">' +
                    '<button type="button" data-action="view" title="Ver detalle"><i class="ph ph-eye"></i></button>' +
                    toggle + remove +
                '</div>' +
            '</div>' +
        '</article>';
    }

    function renderResultsMeta() {
        var filtrados = filteredDevices();
        var total = state.devices.length;
        var count = byId('devx-results-count');
        var sync = byId('devx-last-sync');

        if (count) {
            count.innerHTML = state.loading
                ? 'Cargando dispositivos…'
                : 'Mostrando <strong>' + filtrados.length + '</strong> de ' + total +
                  ' dispositivo' + (total === 1 ? '' : 's');
        }

        if (sync) {
            if (state.lastSync) {
                sync.classList.add('is-live');
                sync.innerHTML = '<i class="ph ph-pulse"></i> Sincronizado ' + relativeTime(state.lastSync);
            } else {
                sync.classList.remove('is-live');
                sync.innerHTML = '<i class="ph ph-pulse"></i> Sin sincronizar';
            }
        }
    }

    function filteredDevices() {
        var consulta = normalizeText(state.query);
        var lista = state.devices.filter(function (device) {
            if (state.status !== 'all' && device.status !== state.status) return false;
            if (state.type !== 'all' && device.tipo !== state.type) return false;
            if (state.instalacion !== 'all' && String(device.instalacion_id) !== String(state.instalacion)) return false;
            if (!consulta) return true;
            var texto = normalizeText([
                device.nombre,
                device.mac,
                device.ip,
                device.modelo,
                device.instalacion,
                device.descripcion,
                '#' + device.id
            ].join(' '));
            return texto.indexOf(consulta) !== -1;
        });

        var orden = {
            name: function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); },
            type: function (a, b) {
                return (a.tipo || '').localeCompare(b.tipo || '', 'es') ||
                    a.nombre.localeCompare(b.nombre, 'es');
            },
            status: function (a, b) {
                var peso = { offline: 0, maintenance: 1, online: 2 };
                return ((peso[a.status] || 0) - (peso[b.status] || 0)) ||
                    a.nombre.localeCompare(b.nombre, 'es');
            },
            recent: function (a, b) {
                return timeValue(b.ultimaconexion) - timeValue(a.ultimaconexion) ||
                    a.nombre.localeCompare(b.nombre, 'es');
            }
        };

        return lista.sort(orden[state.sort] || orden.name);
    }

    function setLoading(loading) {
        state.loading = loading;
        if (!loading) return;
        var grid = byId('devx-grid');
        if (grid) grid.innerHTML = skeletonMarkup();
        var count = byId('devx-results-count');
        if (count) count.textContent = 'Cargando dispositivos…';
        var sync = byId('devx-last-sync');
        if (sync) sync.innerHTML = '<i class="ph ph-pulse"></i> Sincronizando…';
    }

    /* ============================================================
       ESTADOS ESPECIALES
       ============================================================ */

    function skeletonMarkup() {
        var html = '';
        for (var i = 0; i < 6; i++) {
            html += '<div class="devx-skeleton">' +
                '<div class="devx-skel-top">' +
                    '<div class="devx-skel-icon devx-skel-line"></div>' +
                    '<div class="devx-skel-lines">' +
                        '<div class="devx-skel-line devx-skel-w60"></div>' +
                        '<div class="devx-skel-line devx-skel-w40"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="devx-skel-line devx-skel-w80"></div>' +
                '<div class="devx-skel-line devx-skel-w60"></div>' +
                '<div class="devx-skel-line devx-skel-w30"></div>' +
            '</div>';
        }
        return html;
    }

    function emptyState(kind) {
        if (kind === 'no-devices') {
            var accion = state.puedeGestionar
                ? '<button type="button" class="devx-btn devx-btn-solid" data-action="create">' +
                    '<i class="ph ph-plus"></i> Registrar dispositivo</button>'
                : '';
            return '<div class="devx-empty">' +
                '<div class="devx-empty-icon"><i class="ph ph-devices"></i></div>' +
                '<h3>Tu red está lista para crecer</h3>' +
                '<p>Aún no hay dispositivos registrados. ' +
                    (state.puedeGestionar
                        ? 'Registra el primer sensor, actuador o controlador para empezar a monitorear.'
                        : 'Cuando un administrador registre dispositivos, aparecerán aquí.') +
                '</p>' + accion +
            '</div>';
        }
        return '<div class="devx-empty">' +
            '<div class="devx-empty-icon"><i class="ph ph-magnifying-glass"></i></div>' +
            '<h3>Sin coincidencias</h3>' +
            '<p>Ningún dispositivo coincide con los filtros actuales. Prueba con otro término o restablece los filtros.</p>' +
            '<button type="button" class="devx-btn devx-btn-ghost-dark" data-action="clear">' +
                '<i class="ph ph-arrows-counter-clockwise"></i> Limpiar filtros</button>' +
        '</div>';
    }

    /* ============================================================
       INTERACCIÓN
       ============================================================ */

    function bindEvents() {
        on('devx-refresh', 'click', onRefresh);
        on('devx-export', 'click', exportCsv);
        on('devx-create', 'click', openCreateModal);
        on('devx-clear', 'click', clearFilters);

        on('devx-search', 'input', function () {
            state.query = this.value;
            renderAll();
        });
        on('devx-filter-type', 'change', function () {
            state.type = this.value;
            renderAll();
        });
        on('devx-filter-install', 'change', function () {
            state.instalacion = this.value;
            renderAll();
        });
        on('devx-sort', 'change', function () {
            state.sort = this.value;
            renderAll();
        });

        var segmentos = byId('devx-status-filter');
        if (segmentos) {
            segmentos.addEventListener('click', function (event) {
                var boton = event.target.closest('[data-status]');
                if (!boton) return;
                state.status = boton.getAttribute('data-status');
                renderAll();
            });
        }

        var kpis = document.querySelector('.devx-kpis');
        if (kpis) {
            var filtrarPorKpi = function (event) {
                var tarjeta = event.target.closest('[data-kpi-status]');
                if (!tarjeta) return;
                state.status = tarjeta.getAttribute('data-kpi-status');
                renderAll();
                scrollToGrid();
            };
            kpis.addEventListener('click', filtrarPorKpi);
            kpis.addEventListener('keydown', function (event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                if (!event.target.closest('[data-kpi-status]')) return;
                event.preventDefault();
                filtrarPorKpi(event);
            });
        }

        document.querySelectorAll('.devx-view-toggle [data-view]').forEach(function (boton) {
            boton.addEventListener('click', function () {
                setView(boton.getAttribute('data-view'));
            });
        });

        var grid = byId('devx-grid');
        if (grid) {
            grid.addEventListener('click', onGridClick);
            grid.addEventListener('keydown', onGridKeydown);
        }

        on('devx-drawer-close', 'click', closeDrawer);
        var drawerOverlay = byId('devx-drawer-overlay');
        if (drawerOverlay) {
            drawerOverlay.addEventListener('click', function (event) {
                if (event.target === drawerOverlay) closeDrawer();
            });
        }
        var drawer = byId('devx-drawer');
        if (drawer) drawer.addEventListener('click', onDrawerClick);

        on('devx-modal-close', 'click', closeModal);
        on('devx-form-cancel', 'click', closeModal);
        var modal = byId('devx-modal-overlay');
        if (modal) {
            modal.addEventListener('click', function (event) {
                if (event.target === modal) closeModal();
            });
        }
        on('devx-form', 'submit', handleCreate);

        document.addEventListener('keydown', onKeydown);
    }

    function onGridClick(event) {
        var copiar = event.target.closest('[data-copy]');
        if (copiar) {
            copyToClipboard(copiar.getAttribute('data-copy'));
            return;
        }

        var accionEl = event.target.closest('[data-action]');
        if (accionEl) {
            var card = accionEl.closest('[data-id]');
            var id = card ? card.getAttribute('data-id') : null;
            var accion = accionEl.getAttribute('data-action');
            if (accion === 'create') openCreateModal();
            else if (accion === 'clear') clearFilters();
            else if (accion === 'view' && id) openDrawer(id);
            else if (accion === 'toggle' && id) toggleDevice(id);
            else if (accion === 'delete' && id) deleteDevice(id);
            return;
        }

        var tarjeta = event.target.closest('.devx-card');
        if (tarjeta) openDrawer(tarjeta.getAttribute('data-id'));
    }

    function onGridKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var tarjeta = event.target.closest('.devx-card');
        if (!tarjeta) return;
        event.preventDefault();
        openDrawer(tarjeta.getAttribute('data-id'));
    }

    function onDrawerClick(event) {
        var copiar = event.target.closest('[data-copy]');
        if (copiar) {
            copyToClipboard(copiar.getAttribute('data-copy'));
            return;
        }
        var accionEl = event.target.closest('[data-action]');
        if (!accionEl) return;
        var id = state.selectedId;
        var accion = accionEl.getAttribute('data-action');
        if (accion === 'toggle' && id) toggleDevice(id);
        else if (accion === 'delete' && id) deleteDevice(id);
        else if (accion === 'test' && id) testConnection(id);
    }

    function onKeydown(event) {
        if (event.key === 'Escape') {
            var drawerOverlay = byId('devx-drawer-overlay');
            var modalOverlay = byId('devx-modal-overlay');
            if (drawerOverlay && !drawerOverlay.hidden) closeDrawer();
            if (modalOverlay && !modalOverlay.hidden) closeModal();
            return;
        }
        if (event.key === '/') {
            var tag = (document.activeElement && document.activeElement.tagName) || '';
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
            event.preventDefault();
            var search = byId('devx-search');
            if (search) {
                search.focus();
                search.select();
            }
        }
    }

    function setView(view) {
        state.view = view === 'list' ? 'list' : 'grid';
        try {
            localStorage.setItem('aqua_devices_view', state.view);
        } catch (error) { /* almacenamiento no disponible */ }

        document.querySelectorAll('.devx-view-toggle [data-view]').forEach(function (boton) {
            var activo = boton.getAttribute('data-view') === state.view;
            boton.classList.toggle('is-active', activo);
            boton.setAttribute('aria-pressed', activo ? 'true' : 'false');
        });

        var grid = byId('devx-grid');
        if (grid) grid.classList.toggle('is-list', state.view === 'list');
    }

    function scrollToGrid() {
        var grid = byId('devx-grid');
        if (!grid) return;
        var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
            grid.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' });
        } catch (error) {
            grid.scrollIntoView();
        }
    }

    function clearFilters() {
        state.query = '';
        state.status = 'all';
        state.type = 'all';
        state.instalacion = 'all';
        state.sort = 'name';

        setValue('devx-search', '');
        setValue('devx-filter-type', 'all');
        setValue('devx-filter-install', 'all');
        setValue('devx-sort', 'name');

        renderAll();
    }

    function updateClearButton() {
        var boton = byId('devx-clear');
        if (!boton) return;
        var activo = Boolean(state.query) ||
            state.status !== 'all' ||
            state.type !== 'all' ||
            state.instalacion !== 'all';
        boton.hidden = !activo;
    }

    async function onRefresh() {
        var boton = byId('devx-refresh');
        var icono = boton ? boton.querySelector('i') : null;
        if (boton) boton.disabled = true;
        if (icono) icono.classList.add('ph-spin');

        var ok = await loadDevices(false);
        state.loading = false;
        renderAll();

        if (icono) icono.classList.remove('ph-spin');
        if (boton) boton.disabled = false;
        if (ok) showToast('Dispositivos actualizados.', 'success');
    }

    /* ============================================================
       DETALLE (DRAWER)
       ============================================================ */

    function openDrawer(id) {
        var device = state.devices.find(function (item) {
            return String(item.id) === String(id);
        });
        if (!device) return;

        state.selectedId = device.id;
        setText('devx-drawer-title', device.nombre);
        setText('devx-drawer-sub', device.mac || device.instalacion || 'Dispositivo');
        var body = byId('devx-drawer-body');
        if (body) body.innerHTML = drawerTemplate(device);

        var overlay = byId('devx-drawer-overlay');
        var yaAbierto = overlay && overlay.classList.contains('is-open');
        if (overlay && !yaAbierto) openOverlay(overlay);
        document.body.classList.add('devx-lock');
        if (!yaAbierto) {
            var close = byId('devx-drawer-close');
            if (close) close.focus({ preventScroll: true });
        }
        updateBodyLock();
    }

    function drawerTemplate(device) {
        var status = STATUS_META[device.status] || STATUS_META.offline;
        var tipo = TYPE_META[device.tipo] || TYPE_META.sensor;
        var mac = device.mac
            ? '<button type="button" class="devx-mac" data-copy="' + esc(device.mac) + '" title="Copiar MAC">' +
                '<i class="ph ph-copy"></i>' + esc(device.mac) + '</button>'
            : '<span class="devx-mac is-empty"><i class="ph ph-plug"></i>Sin MAC registrada</span>';

        var probar = state.puedeGestionar && device.ip
            ? '<button type="button" class="devx-btn devx-btn-ghost-dark" data-action="test">' +
                '<i class="ph ph-plugs-connected"></i> Probar conexión</button>'
            : '';
        var acciones = state.puedeGestionar
            ? probar +
              '<button type="button" class="devx-btn devx-btn-ghost-dark" data-action="toggle">' +
                '<i class="ph ph-power"></i> ' + (isActive(device) ? 'Desactivar' : 'Activar') + '</button>' +
              '<button type="button" class="devx-btn devx-btn-ghost-dark" data-action="delete">' +
                '<i class="ph ph-trash"></i> Eliminar</button>'
            : '<span class="devx-readonly"><i class="ph ph-eye"></i> Vista de solo lectura</span>';

        var descripcion = device.descripcion
            ? '<div class="devx-detail-section">' +
                '<h4>Descripción</h4>' +
                '<p class="devx-detail-desc">' + esc(device.descripcion) + '</p>' +
              '</div>'
            : '';

        return '<div class="devx-detail-hero" data-type="' + esc(device.tipo) + '">' +
            '<div class="devx-card-icon"><i class="ph ' + tipo.icon + '"></i></div>' +
            '<div class="devx-detail-hero-copy">' +
                '<h3>' + esc(device.nombre) + '</h3>' +
                mac +
            '</div>' +
        '</div>' +
        '<div class="devx-detail-grid">' +
            detailItem('Estado', status.label, status.icon) +
            detailItem('Tipo', tipo.label, tipo.icon) +
            detailItem('Instalación', device.instalacion, 'ph-buildings') +
            detailItem('Modelo', device.modelo || 'Sin modelo', 'ph-tag') +
            detailItem('IP / puerto', device.ip ? device.ip + ':' + device.puerto : 'Sin IP', 'ph-globe') +
            detailItem('ID interno', '#' + device.id, 'ph-hash') +
            detailItem('Registrado', device.fechacreacion ? fullDate(device.fechacreacion) : '—', 'ph-calendar-plus') +
        '</div>' +
        '<div class="devx-detail-section">' +
            '<h4>Línea de tiempo</h4>' +
            '<ul class="devx-timeline">' +
                '<li><strong>Última comunicación</strong><em>' +
                    (device.ultimaconexion
                        ? esc(fullDate(device.ultimaconexion)) + ' · ' + esc(relativeTime(device.ultimaconexion))
                        : 'Sin telemetría recibida aún') +
                '</em></li>' +
                '<li><strong>Alta en la red</strong><em>' +
                    (device.fechacreacion ? esc(fullDate(device.fechacreacion)) : 'Sin fecha registrada') +
                '</em></li>' +
            '</ul>' +
        '</div>' +
        descripcion +
        '<div class="devx-drawer-actions">' + acciones + '</div>';
    }

    function detailItem(label, value, icon) {
        return '<div class="devx-detail-item">' +
            '<span><i class="ph ' + icon + '"></i>' + esc(label) + '</span>' +
            '<strong>' + esc(value) + '</strong>' +
        '</div>';
    }

    function closeDrawer() {
        state.selectedId = null;
        var overlay = byId('devx-drawer-overlay');
        if (overlay) closeOverlay(overlay);
        updateBodyLock();
    }

    /* ============================================================
       ALTA Y GESTIÓN
       ============================================================ */

    function openCreateModal() {
        if (!state.puedeGestionar) {
            showToast('La gestión de dispositivos está disponible solo para administradores.', 'info');
            return;
        }
        var form = byId('devx-form');
        if (form) form.reset();
        var mac = byId('devx-mac');
        if (mac) mac.classList.remove('is-invalid');

        var overlay = byId('devx-modal-overlay');
        if (overlay) openOverlay(overlay);
        document.body.classList.add('devx-lock');
        updateBodyLock();

        window.setTimeout(function () {
            var nombre = byId('devx-name');
            if (nombre) nombre.focus();
        }, 60);
    }

    function closeModal() {
        var overlay = byId('devx-modal-overlay');
        if (overlay) closeOverlay(overlay);
        updateBodyLock();
    }

    async function handleCreate(event) {
        event.preventDefault();
        if (!state.puedeGestionar) return;

        var form = event.currentTarget;
        var nombre = form.nombre.value.trim();
        var tipo = form.tipo.value;
        var modelo = form.modelo.value.trim();
        var macRaw = form.direccion_mac.value.trim();
        var macEl = byId('devx-mac');
        var ip = form.direccion_ip.value.trim();
        var puerto = parseInt(form.puerto.value, 10) || 80;
        var instalacion = (form.instalacion_id.value || '').trim();
        var descripcion = form.descripcion.value.trim();

        if (nombre.length < 2) {
            showToast('El nombre debe tener al menos 2 caracteres.', 'error');
            form.nombre.focus();
            return;
        }

        var mac = null;
        if (macRaw) {
            mac = macRaw.toUpperCase().replace(/-/g, ':');
            if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
                if (macEl) {
                    macEl.classList.add('is-invalid');
                    macEl.focus();
                }
                showToast('La dirección MAC no es válida (AA:BB:CC:DD:EE:FF).', 'error');
                return;
            }
        }
        if (macEl) macEl.classList.remove('is-invalid');

        var submit = byId('devx-form-submit');
        var contenidoOriginal = submit ? submit.innerHTML : '';
        if (submit) {
            submit.disabled = true;
            submit.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Registrando…';
        }

        try {
            var creado = await apiClient.post('/dispositivos/', {
                nombre: nombre,
                tipo: tipo,
                modelo: modelo || null,
                direccion_mac: mac,
                direccion_ip: ip || null,
                puerto: puerto,
                descripcion: descripcion || null,
                instalacion_id: instalacion ? Number(instalacion) : null
            });
            closeModal();
            await loadDevices(true);
            renderAll();
            if (creado && creado.conexion) {
                showToast(
                    creado.conexion.alcanzable
                        ? 'Dispositivo registrado y conectado (' + creado.conexion.latencia_ms + ' ms).'
                        : 'Dispositivo registrado, pero no se pudo conectar a la IP indicada.',
                    creado.conexion.alcanzable ? 'success' : 'info'
                );
            } else {
                showToast('Dispositivo registrado correctamente.', 'success');
            }
        } catch (error) {
            showToast(error.message || 'No se pudo registrar el dispositivo.', 'error');
        } finally {
            if (submit) {
                submit.disabled = false;
                submit.innerHTML = contenidoOriginal;
            }
        }
    }

    async function toggleDevice(id) {
        var device = state.devices.find(function (item) {
            return String(item.id) === String(id);
        });
        if (!device || !state.puedeGestionar) return;

        var siguiente = isActive(device) ? 'inactivo' : 'activo';
        try {
            await apiClient.patch('/dispositivos/' + device.id + '/estado', { estado: siguiente });
            await loadDevices(true);
            renderAll();
            if (state.selectedId && state.devices.some(function (item) {
                return String(item.id) === String(state.selectedId);
            })) {
                openDrawer(state.selectedId);
            }
            showToast(siguiente === 'activo' ? 'Dispositivo activado.' : 'Dispositivo desactivado.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo cambiar el estado del dispositivo.', 'error');
        }
    }

    async function testConnection(id) {
        if (!state.puedeGestionar) return;
        var device = state.devices.find(function (item) {
            return String(item.id) === String(id);
        });
        if (!device) return;
        if (!device.ip) {
            showToast('El dispositivo no tiene una IP configurada.', 'info');
            return;
        }

        try {
            var resultado = await apiClient.post('/dispositivos/' + device.id + '/probar-conexion', {});
            var conexion = (resultado && resultado.conexion) || {};
            if (conexion.alcanzable) {
                showToast('Conexión exitosa (' + conexion.latencia_ms + ' ms).', 'success');
            } else {
                showToast('Sin conexión: ' + (conexion.error || 'host inalcanzable'), 'error');
            }
            await loadDevices(true);
            renderAll();
            if (String(state.selectedId) === String(device.id)) openDrawer(device.id);
        } catch (error) {
            showToast(error.message || 'No se pudo probar la conexión.', 'error');
        }
    }

    async function deleteDevice(id) {
        if (!state.puedeGestionar) return;
        var device = state.devices.find(function (item) {
            return String(item.id) === String(id);
        });
        if (!device) return;
        if (!window.confirm('¿Eliminar «' + device.nombre + '» de forma permanente?')) return;

        try {
            await apiClient.delete('/dispositivos/' + device.id);
            if (String(state.selectedId) === String(device.id)) closeDrawer();
            await loadDevices(true);
            renderAll();
            showToast('Dispositivo eliminado.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo eliminar el dispositivo.', 'error');
        }
    }

    /* ============================================================
       EXPORTACIÓN Y UTILIDADES
       ============================================================ */

    function exportCsv() {
        var filas = filteredDevices();
        if (!filas.length) {
            showToast('No hay dispositivos para exportar con los filtros actuales.', 'info');
            return;
        }

        var encabezado = ['Nombre', 'Tipo', 'Estado', 'MAC', 'IP', 'Puerto', 'Instalación', 'Modelo', 'Última conexión', 'Registrado', 'Descripción'];
        var cuerpo = filas.map(function (device) {
            var status = STATUS_META[device.status] || STATUS_META.offline;
            var tipo = TYPE_META[device.tipo] || TYPE_META.sensor;
            return [
                device.nombre,
                tipo.label,
                status.label,
                device.mac,
                device.ip,
                device.puerto,
                device.instalacion,
                device.modelo,
                device.ultimaconexion ? fullDate(device.ultimaconexion) : '',
                device.fechacreacion ? fullDate(device.fechacreacion) : '',
                device.descripcion
            ];
        });

        var csv = [encabezado].concat(cuerpo).map(function (fila) {
            return fila.map(csvCell).join(',');
        }).join('\r\n');

        var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = 'aquaplants-dispositivos-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        showToast('Exportación CSV generada.', 'success');
    }

    function csvCell(valor) {
        var texto = String(valor === null || valor === undefined ? '' : valor).replace(/"/g, '""');
        return /[",\n\r]/.test(texto) ? '"' + texto + '"' : texto;
    }

    function copyToClipboard(texto) {
        if (!texto) return;
        var done = function () {
            showToast('MAC copiada: ' + texto, 'success');
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(texto).then(done).catch(function () {
                showToast('No se pudo copiar la MAC.', 'error');
            });
            return;
        }
        try {
            var area = document.createElement('textarea');
            area.value = texto;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
            done();
        } catch (error) {
            showToast('No se pudo copiar la MAC.', 'error');
        }
    }

    function openOverlay(el) {
        if (el._hideTimer) {
            window.clearTimeout(el._hideTimer);
            el._hideTimer = null;
        }
        el.hidden = false;
        window.requestAnimationFrame(function () {
            el.classList.add('is-open');
        });
    }

    function closeOverlay(el) {
        el.classList.remove('is-open');
        if (el._hideTimer) window.clearTimeout(el._hideTimer);
        el._hideTimer = window.setTimeout(function () {
            if (!el.classList.contains('is-open')) el.hidden = true;
            el._hideTimer = null;
            updateBodyLock();
        }, 230);
    }

    function updateBodyLock() {
        var drawer = byId('devx-drawer-overlay');
        var modal = byId('devx-modal-overlay');
        var abierto = (drawer && !drawer.hidden) || (modal && !modal.hidden);
        document.body.classList.toggle('devx-lock', Boolean(abierto));
    }

    function relativeTime(valor) {
        var fecha = valor instanceof Date ? valor : new Date(valor);
        if (Number.isNaN(fecha.getTime())) return 'Fecha desconocida';
        var diff = Date.now() - fecha.getTime();
        if (diff < 0) return 'Programado';
        var minutos = Math.floor(diff / 60000);
        if (minutos < 1) return 'hace unos segundos';
        if (minutos < 60) return 'hace ' + minutos + ' min';
        var horas = Math.floor(minutos / 60);
        if (horas < 24) return 'hace ' + horas + ' h';
        var dias = Math.floor(horas / 24);
        if (dias < 30) return 'hace ' + dias + ' d';
        return fecha.toLocaleDateString('es-CL');
    }

    function fullDate(valor) {
        if (!valor) return '—';
        var fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) return '—';
        return fecha.toLocaleString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function timeValue(valor) {
        if (!valor) return 0;
        var tiempo = new Date(valor).getTime();
        return Number.isNaN(tiempo) ? 0 : tiempo;
    }

    function normalizeText(valor) {
        return String(valor === null || valor === undefined ? '' : valor)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function setCounter(el, valor) {
        if (!el) return;
        var objetivo = Number(valor) || 0;
        var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducido) {
            el.textContent = objetivo;
            return;
        }
        var inicio = Number(el.textContent) || 0;
        if (inicio === objetivo) {
            el.textContent = objetivo;
            return;
        }
        var arranque = performance.now();
        var duracion = 520;

        function paso(ahora) {
            var progreso = Math.min(1, (ahora - arranque) / duracion);
            var suavizado = 1 - Math.pow(1 - progreso, 3);
            el.textContent = Math.round(inicio + (objetivo - inicio) * suavizado);
            if (progreso < 1) window.requestAnimationFrame(paso);
        }
        window.requestAnimationFrame(paso);
    }

    function setText(id, valor) {
        var el = byId(id);
        if (el) el.textContent = valor;
    }

    function setValue(id, valor) {
        var el = byId(id);
        if (el) el.value = valor;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function on(id, evento, handler) {
        var el = byId(id);
        if (el) el.addEventListener(evento, handler);
    }

    function esc(valor) {
        return String(valor === null || valor === undefined ? '' : valor)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
})();
