/**
 * AquaPlants · Layout compartido
 * Inyecta una única barra lateral y un único encabezado en todas las
 * páginas de la aplicación, respetando el rol del usuario autenticado.
 *
 * Requiere: js/auth.js (checkAuth / logout / AquaAuth)
 */
(function () {
  'use strict';

  if (window.__aquaLayoutLoaded) return;
  window.__aquaLayoutLoaded = true;

  var ICONS = {
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    plant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V10"/><path d="M12 10c0-4 3-7 8-7 0 5-3 8-8 7z"/><path d="M12 14c0-3-2.5-5-6-5 0 3.5 2.5 5 6 5z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>',
    cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.5c4 6 8 10 8 14a8 8 0 0 1-16 0c0-4 4-8 8-14z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    bellSmall: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    theme: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12H20M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9L17.7 6.3M6.3 17.7l-1.4 1.4"/></svg>',
    search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
    collapse: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/></svg>',
    tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M7 11l2 2 4-4M7 17h10"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 8L12 13l8.7-5M12 22V13"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    chartLine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><polyline points="20 4 20 11 13 11"/></svg>'
  };

  var ROLE_LABELS = {
    admin: 'Administrador',
    administrador: 'Administrador',
    supervisor: 'Supervisor',
    encargado: 'Encargado de cultivo'
  };

  function currentKey() {
    return (location.pathname.split('/').pop() || '')
      .toLowerCase()
      .replace(/\.html$/, '');
  }

  function isAdminLocation() {
    return /\/admin\//i.test(location.pathname);
  }

  function isSimulatorLocation() {
    return /\/simulador\//i.test(location.pathname);
  }

  function links(role) {
    var inAdmin = isAdminLocation();
    var inSimulator = isSimulatorLocation();
    var pages = (inAdmin || inSimulator) ? '../pages/' : '';
    var admin = inAdmin ? '' : '../admin/';
    var dashboardByRole = {
      admin: 'dashboard-admin',
      administrador: 'dashboard-admin',
      supervisor: 'dashboard-supervisor',
      encargado: 'dashboard-encargado'
    };
    return {
      pages: pages,
      admin: admin,
      href: function (target) {
        if (target === 'simulador') return '../simulador/index.html';
        if (target === 'usuarios' || target === 'grupos' || target === 'instalaciones' || target === 'umbrales' || target === 'admin-dispositivos') {
          var map = { 'admin-dispositivos': 'dispositivos', 'umbrales': 'umbrales', 'instalaciones': 'instalaciones' };
          return admin + (map[target] || target) + '.html';
        }
        if (target === 'dashboard') {
          target = dashboardByRole[(role || '').toLowerCase()] || 'dashboard';
        }
        return pages + target + '.html';
      }
    };
  }

  function sectionsFor(role) {
    var all = [
      {
        title: 'Principal',
        items: [
          { key: 'dashboard', label: 'Inicio', icon: 'grid' },
          { key: 'mapa', label: 'Mapa de instalaciones', icon: 'map' }
        ]
      },
      {
        title: 'Monitoreo',
        items: [
          { key: 'cultivos', label: 'Cultivos', icon: 'plant' },
          { key: 'alertas', label: 'Alertas', icon: 'bell', badge: 'nav-alert-badge' },
          { key: 'historicos', label: 'Históricos', icon: 'clock' },
          { key: 'dispositivos', label: 'Dispositivos', icon: 'cpu' }
        ]
      },
      {
        title: 'Operación',
        items: [
          { key: 'tareas', label: 'Tareas', icon: 'tasks', badge: 'nav-task-badge' },
          { key: 'incidencias', label: 'Incidencias', icon: 'warning', badge: 'nav-incident-badge' },
          { key: 'calendario', label: 'Calendario agrícola', icon: 'calendar' },
          { key: 'equipo', label: 'Equipo', icon: 'team' },
          { key: 'inventario', label: 'Inventario', icon: 'box', badge: 'nav-stock-badge' }
        ]
      },
      {
        title: 'Análisis',
        items: [
          { key: 'riego', label: 'Riego', icon: 'drop' },
          { key: 'comparador', label: 'Comparador', icon: 'chart' },
          { key: 'reportes', label: 'Reportes', icon: 'file' },
          { key: 'rendimiento', label: 'Rendimiento', icon: 'chartLine' }
        ]
      },
      {
        title: 'Administración',
        roles: ['admin', 'administrador'],
        items: [
          { key: 'dashboard-admin', label: 'Panel Admin', icon: 'shield' },
          { key: 'usuarios', label: 'Usuarios', icon: 'users' },
          { key: 'grupos', label: 'Grupos de trabajo', icon: 'team' },
          { key: 'instalaciones', label: 'Instalaciones', icon: 'grid' },
          { key: 'admin-dispositivos', label: 'Dispositivos', icon: 'cpu' },
          { key: 'umbrales', label: 'Umbrales', icon: 'shield' },
          { key: 'simulador', label: 'Simulador IoT', icon: 'cpu' }
        ]
      },
      {
        title: 'Cuenta',
        items: [
          { key: 'notificaciones', label: 'Notificaciones', icon: 'bell' },
          { key: 'perfil', label: 'Mi perfil', icon: 'user' }
        ]
      }
    ];

    var normalized = (role || '').toLowerCase();
    return all.filter(function (section) {
      return !section.roles || section.roles.indexOf(normalized) !== -1;
    });
  }

  function activeKey(key) {
    if (isSimulatorLocation()) return 'simulador';
    if (key === 'dashboard-supervisor' || key === 'dashboard-encargado') return 'dashboard';
    return key;
  }

  var SIDEBAR_SCROLL_KEY = 'aqua_sidebar_scroll';
  var sidebarScrollFrame = null;

  function readSidebarScroll() {
    try {
      var value = parseInt(sessionStorage.getItem(SIDEBAR_SCROLL_KEY) || '0', 10);
      return isNaN(value) ? 0 : value;
    } catch (e) {
      return 0;
    }
  }

  function persistSidebarScroll(nav) {
    if (!nav) return;
    try {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop || 0));
    } catch (e) {}
  }

  function restoreSidebarScroll(nav) {
    if (!nav) return;
    var target = readSidebarScroll();
    if (!target) return;
    var apply = function () {
      var max = Math.max(0, nav.scrollHeight - nav.clientHeight);
      nav.scrollTop = Math.min(target, max);
    };
    apply();
    requestAnimationFrame(apply);
  }

  function watchSidebarScroll(nav) {
    if (!nav) return;
    nav.addEventListener('scroll', function () {
      if (sidebarScrollFrame) return;
      sidebarScrollFrame = requestAnimationFrame(function () {
        sidebarScrollFrame = null;
        persistSidebarScroll(nav);
      });
    }, { passive: true });
  }

  function readUser() {
    try {
      if (typeof checkAuth === 'function') return checkAuth();
    } catch (e) {
      console.error('No se pudo validar la sesión:', e);
    }
    return null;
  }

  function extractHeader() {
    var titleEl = document.querySelector(
      '.top-navbar .page-title h1, .navbar .navbar-title, main > .header h2, main > .header h1, body > header h1, .page-title h1'
    );
    var subEl = document.querySelector(
      '.top-navbar .page-title p, main > .header p, body > header p'
    );
    var title = titleEl ? titleEl.textContent.trim() : (document.title.split('|')[0] || '').trim();
    var subtitle = subEl ? subEl.textContent.trim() : '';
    return { title: title || 'AquaPlants', subtitle: subtitle };
  }

  function removeLegacyShell() {
    Array.prototype.forEach.call(document.querySelectorAll('aside.sidebar'), function (el) {
      el.parentNode.removeChild(el);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.top-navbar, header.navbar'), function (el) {
      el.parentNode.removeChild(el);
    });
    Array.prototype.forEach.call(document.querySelectorAll('main > .header, body > .header'), function (el) {
      if (el.querySelector('h1,h2')) el.parentNode.removeChild(el);
    });
    var bodyHeader = document.querySelector('body > header');
    if (bodyHeader && bodyHeader.querySelector('h1')) {
      bodyHeader.parentNode.removeChild(bodyHeader);
    }
  }

  function buildSidebar(role) {
    var l = links(role);
    var key = activeKey(currentKey());
    var sections = sectionsFor(role);
    var aside = document.createElement('aside');
    aside.className = 'sidebar';
    aside.id = 'sidebar';

    var navHtml = sections.map(function (section) {
      var items = section.items.map(function (item) {
        var href = l.href(item.key);
        var active = item.key === key ? ' active' : '';
        var badge = '';
        if (item.badge) {
          badge = '<span class="badge" id="' + item.badge + '" style="display:none">0</span>';
        }
        if (item.key === 'dashboard-admin') {
          badge += '<span class="badge" id="nav-admin" style="display:none">0</span>';
        }
        return '<a href="' + href + '" class="nav-item' + active + '" data-nav="' + item.key + '" title="' + item.label + '">' +
          ICONS[item.icon] + '<span>' + item.label + '</span>' + badge + '</a>';
      }).join('');

      return '<div class="nav-section">' +
        '<div class="nav-section-title">' + section.title + '</div>' + items +
        '</div>';
    }).join('');

    aside.innerHTML =
      '<div class="sidebar-header">' +
        '<div class="sidebar-logo">' + ICONS.drop.replace('fill="none"', 'fill="none"').replace('<svg ', '<svg width="22" height="22" ') + '</div>' +
        '<div><div class="sidebar-brand">Aqua<span>Plants</span></div><div class="sidebar-sub">Smart Hydroponics</div></div>' +
        '<button class="sidebar-collapse" id="sidebarCollapse" type="button" aria-label="Contraer barra lateral" title="Contraer barra lateral">' + ICONS.collapse + '</button>' +
      '</div>' +
      '<nav class="sidebar-nav">' + navHtml + '</nav>' +
      '<div class="sidebar-footer">' +
        '<div class="user-card">' +
          '<div class="user-avatar" id="userAvatar">U</div>' +
          '<div class="user-info">' +
            '<div class="user-name" id="userName">Usuario</div>' +
            '<div class="user-role" id="userRole">Rol</div>' +
          '</div>' +
          '<button class="logout-btn" id="logoutBtn" title="Cerrar sesión">' + ICONS.logout + '</button>' +
        '</div>' +
      '</div>';

    watchSidebarScroll(aside.querySelector('.sidebar-nav'));
    return aside;
  }

  function buildTopbar(header, role) {
    var roleLabel = ROLE_LABELS[(role || '').toLowerCase()] || role || 'Rol';
    var l = links(role);
    var headerEl = document.createElement('header');
    headerEl.className = 'topbar';
    headerEl.innerHTML =
      '<button class="menu-toggle" id="menuToggle" type="button" aria-label="Abrir menú">' + ICONS.menu + '</button>' +
      '<div class="page-title">' +
        '<div class="breadcrumb">AquaPlants <span>/</span> <b id="breadcrumbCurrent">' + header.title + '</b></div>' +
        '<h1 id="pageTitle">' + header.title + '</h1>' +
        '<p id="role-indicator">' + (header.subtitle || 'AquaPlants · Smart Hydroponics') + '</p>' +
      '</div>' +
      '<div class="topbar-search" role="search">' +
        ICONS.search +
        '<input type="search" id="globalSearch" placeholder="Buscar módulo... (Ctrl K)" autocomplete="off" aria-label="Buscar módulo" />' +
        '<div class="search-results" id="searchResults"></div>' +
      '</div>' +
      '<div class="navbar-actions">' +
        '<button class="icon-btn" type="button" id="commandToggle" aria-label="Abrir búsqueda global (Ctrl K)" title="Buscar (Ctrl K)">' + ICONS.search + '</button>' +
        '<button class="live-status connecting" type="button" id="liveStatus" aria-live="polite">' +
          '<span class="live-dot"></span><span class="live-text" id="liveText">Conectando…</span>' +
        '</button>' +
        '<button class="icon-btn" type="button" id="themeToggle" aria-label="Cambiar tema" title="Cambiar tema">' + ICONS.theme + '</button>' +
        '<div class="notif-wrap">' +
          '<button class="icon-btn" type="button" id="notifToggle" title="Centro de notificaciones" aria-label="Centro de notificaciones" aria-expanded="false">' + ICONS.bellSmall +
            '<span class="notif-dot" id="notifDot" style="display:none"></span>' +
          '</button>' +
          '<div class="notif-panel" id="notifPanel" role="dialog" aria-label="Centro de notificaciones">' +
            '<div class="notif-panel-head">' +
              '<strong>Notificaciones</strong>' +
              '<button type="button" class="notif-mark-all" id="notifMarkAll">Marcar todas</button>' +
            '</div>' +
            '<div class="notif-filters" id="notifFilters">' +
              '<button type="button" class="active" data-cat="">Todas</button>' +
              '<button type="button" data-cat="tarea">Tareas</button>' +
              '<button type="button" data-cat="incidencia">Incidencias</button>' +
              '<button type="button" data-cat="mantenimiento">Mant.</button>' +
              '<button type="button" data-cat="inventario">Stock</button>' +
            '</div>' +
            '<div class="notif-list" id="notifList"><div class="notif-empty">Cargando…</div></div>' +
            '<div class="notif-panel-foot">' +
              '<a href="' + l.href('notificaciones') + '">Ver todas</a>' +
              '<a href="' + l.href('alertas') + '">Alertas IoT</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="user-profile">' +
          '<div class="user-info">' +
            '<span class="user-name" id="user-name">Usuario</span>' +
            '<span class="user-role" id="user-role">' + roleLabel + '</span>' +
          '</div>' +
          '<div class="avatar" id="userAvatarTop">' + ICONS.user + '</div>' +
        '</div>' +
      '</div>';
    return headerEl;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function initials(name) {
    return (name || 'U').trim().charAt(0).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var FILTER_KEY = 'aqua_global_filters';
  var FILTER_PAGES = { dashboard: true, historicos: true, alertas: true, reportes: true };
  var filterOptions = { cultivos: [], instalaciones: [] };
  var filterReadyResolve = null;
  var filterReady = new Promise(function (resolve) { filterReadyResolve = resolve; });
  var refreshHandlers = [];
  var lastSync = null;
  var liveMode = 'connecting';
  var syncTimer = null;
  var ageTimer = null;
  var syncInFlight = false;
  var paletteLoadedAt = 0;
  var paletteVisible = [];
  var paletteIndex = -1;

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function emptyGlobalFilters() {
    return { cultivo: '', sector: '', desde: '', hasta: '' };
  }

  function globalFiltersFromStorage() {
    var filters = emptyGlobalFilters();
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}'); } catch (e) {}
    ['cultivo', 'sector', 'desde', 'hasta'].forEach(function (key) {
      if (stored && stored[key]) filters[key] = String(stored[key]);
    });

    var params = new URLSearchParams(location.search);
    var fromUrl = false;
    ['cultivo', 'sector', 'desde', 'hasta'].forEach(function (key) {
      var value = params.get('f_' + key);
      if (value) {
        filters[key] = value;
        fromUrl = true;
      }
    });
    if (fromUrl) {
      try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch (e) {}
    }
    return filters;
  }

  function persistGlobalFilters(filters) {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch (e) {}
    try {
      var url = new URL(location.href);
      ['cultivo', 'sector', 'desde', 'hasta'].forEach(function (key) {
        if (filters[key]) url.searchParams.set('f_' + key, filters[key]);
        else url.searchParams.delete('f_' + key);
      });
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function updateGlobalFilterUI(filters) {
    var bar = document.getElementById('globalFiltersBar');
    if (!bar) return;
    var crop = document.getElementById('gfCultivo');
    var sector = document.getElementById('gfSector');
    var from = document.getElementById('gfDesde');
    var to = document.getElementById('gfHasta');
    if (crop) crop.value = filters.cultivo || '';
    if (sector) sector.value = filters.sector || '';
    if (from) from.value = filters.desde || '';
    if (to) to.value = filters.hasta || '';
    var count = ['cultivo', 'sector', 'desde', 'hasta'].filter(function (key) {
      return Boolean(filters[key]);
    }).length;
    var badge = document.getElementById('gfActive');
    if (badge) {
      badge.textContent = count ? count + ' activo' + (count === 1 ? '' : 's') : 'Sin filtros';
      badge.classList.toggle('active', count > 0);
    }
  }

  function applyGlobalFilters(patch, silent) {
    var filters = Object.assign(globalFiltersFromStorage(), patch || {});
    persistGlobalFilters(filters);
    updateGlobalFilterUI(filters);
    if (!silent) {
      document.dispatchEvent(new CustomEvent('aqua:filters', { detail: filters }));
    }
    return filters;
  }

  function clearGlobalFilters() {
    var filters = emptyGlobalFilters();
    persistGlobalFilters(filters);
    updateGlobalFilterUI(filters);
    populateGlobalFilterSelects();
    document.dispatchEvent(new CustomEvent('aqua:filters', { detail: filters }));
  }

  function filterPageEnabled() {
    return Boolean(FILTER_PAGES[activeKey(currentKey())]);
  }

  function toggleTheme() {
    var nextTheme = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    try { localStorage.setItem('aqua_theme', nextTheme); } catch (e) {}
  }

  function setLiveStatus(mode, text) {
    liveMode = mode;
    var button = document.getElementById('liveStatus');
    if (!button) return;
    button.classList.remove('online', 'offline', 'connecting');
    button.classList.add(mode);
    var label = button.querySelector('.live-text');
    if (label) label.textContent = text;
    button.title = mode === 'offline'
      ? 'Sin conexión con la API. Clic para reintentar.'
      : 'Actualizar datos ahora';
  }

  function updateLiveAge() {
    if (!lastSync) {
      if (liveMode !== 'offline') setLiveStatus('connecting', 'Conectando…');
      return;
    }
    var seconds = Math.max(0, Math.floor((Date.now() - lastSync) / 1000));
    var text = seconds < 10
      ? 'Actualizado ahora'
      : (seconds < 60
        ? 'Actualizado hace ' + seconds + ' s'
        : 'Actualizado hace ' + Math.floor(seconds / 60) + ' min');
    setLiveStatus('online', text);
  }

  function runRefreshHandlers() {
    refreshHandlers.slice().forEach(function (handler) {
      try { handler(); } catch (error) { console.error('Error al refrescar la vista:', error); }
    });
    document.dispatchEvent(new CustomEvent('aqua:refresh'));
  }

  function refreshNow(manual) {
    if (syncInFlight) return Promise.resolve(null);
    if (navigator.onLine === false) {
      setLiveStatus('offline', 'Sin conexión');
      return Promise.resolve(null);
    }
    syncInFlight = true;
    if (manual) setLiveStatus('connecting', 'Actualizando…');
    return apiGet('/mediciones/?limit=1').then(function (data) {
      syncInFlight = false;
      if (Array.isArray(data)) {
        lastSync = Date.now();
        updateLiveAge();
        runRefreshHandlers();
      } else {
        setLiveStatus('offline', 'Sin conexión');
      }
      return data;
    }).catch(function () {
      syncInFlight = false;
      setLiveStatus('offline', 'Sin conexión');
      return null;
    });
  }

  function setupFreshness() {
    var button = document.getElementById('liveStatus');
    if (button) {
      button.addEventListener('click', function () { refreshNow(true); });
    }
    updateLiveAge();
    refreshNow(false);
    if (syncTimer) clearInterval(syncTimer);
    if (ageTimer) clearInterval(ageTimer);
    syncTimer = setInterval(function () {
      if (document.visibilityState === 'visible') refreshNow(false);
    }, 30000);
    ageTimer = setInterval(updateLiveAge, 10000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshNow(false);
    });
    window.addEventListener('online', function () { refreshNow(false); });
    window.addEventListener('offline', function () { setLiveStatus('offline', 'Sin conexión'); });
  }

  function populateGlobalFilterSelects() {
    var filters = globalFiltersFromStorage();
    var sectorSelect = document.getElementById('gfSector');
    var cropSelect = document.getElementById('gfCultivo');
    if (sectorSelect) {
      sectorSelect.innerHTML = '<option value="">Todos los sectores</option>' +
        filterOptions.instalaciones.map(function (item) {
          return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.nombre) + '</option>';
        }).join('');
      sectorSelect.value = filters.sector || '';
    }
    if (cropSelect) {
      var crops = filterOptions.cultivos.filter(function (item) {
        return !filters.sector || String(item.instalacion_id) === String(filters.sector);
      });
      cropSelect.innerHTML = '<option value="">Todos los cultivos</option>' +
        crops.map(function (item) {
          return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.nombre) + '</option>';
        }).join('');
      cropSelect.value = filters.cultivo || '';
    }
  }

  function loadFilterOptions() {
    if (!filterPageEnabled()) {
      if (filterReadyResolve) filterReadyResolve(filterOptions);
      return Promise.resolve(filterOptions);
    }
    return Promise.all([
      apiGet('/cultivos/'),
      apiGet('/instalaciones/')
    ]).then(function (results) {
      filterOptions.cultivos = Array.isArray(results[0]) ? results[0] : [];
      filterOptions.instalaciones = Array.isArray(results[1]) ? results[1] : [];
      populateGlobalFilterSelects();
      updateGlobalFilterUI(globalFiltersFromStorage());
      if (filterReadyResolve) filterReadyResolve(filterOptions);
      return filterOptions;
    });
  }

  function setupGlobalFilters() {
    if (!filterPageEnabled()) {
      if (filterReadyResolve) filterReadyResolve(filterOptions);
      return;
    }
    var content = document.querySelector('.content-wrapper') || document.querySelector('.page-content');
    if (!content) {
      if (filterReadyResolve) filterReadyResolve(filterOptions);
      return;
    }
    var bar = document.createElement('section');
    bar.className = 'global-filters-bar';
    bar.id = 'globalFiltersBar';
    bar.innerHTML =
      '<div class="gf-head">' +
        '<span class="gf-title">' + ICONS.filter + '<strong>Filtros globales</strong></span>' +
        '<span class="gf-active" id="gfActive">Sin filtros</span>' +
      '</div>' +
      '<div class="gf-controls">' +
        '<label><span>Cultivo</span><select id="gfCultivo"><option value="">Todos los cultivos</option></select></label>' +
        '<label><span>Sector</span><select id="gfSector"><option value="">Todos los sectores</option></select></label>' +
        '<label><span>Desde</span><input type="date" id="gfDesde"></label>' +
        '<label><span>Hasta</span><input type="date" id="gfHasta"></label>' +
        '<button type="button" class="btn-primary btn-small" id="gfApply">' + ICONS.refresh + ' Aplicar</button>' +
        '<button type="button" class="btn-secondary btn-small" id="gfClear">Limpiar</button>' +
      '</div>';
    content.insertBefore(bar, content.firstChild);

    var sectorSelect = document.getElementById('gfSector');
    if (sectorSelect) {
      sectorSelect.addEventListener('change', function () {
        var filters = globalFiltersFromStorage();
        filters.sector = sectorSelect.value;
        if (filters.cultivo) {
          var crop = filterOptions.cultivos.find(function (item) {
            return String(item.id) === String(filters.cultivo);
          });
          if (crop && String(crop.instalacion_id) !== String(filters.sector)) filters.cultivo = '';
        }
        populateGlobalFilterSelects();
        var cropSelect = document.getElementById('gfCultivo');
        if (cropSelect) cropSelect.value = filters.cultivo || '';
        updateGlobalFilterUI(filters);
      });
    }

    var apply = document.getElementById('gfApply');
    if (apply) {
      apply.addEventListener('click', function () {
        var from = (document.getElementById('gfDesde') || {}).value || '';
        var to = (document.getElementById('gfHasta') || {}).value || '';
        if (from && to && from > to) {
          if (typeof window.showToast === 'function') window.showToast('La fecha inicial no puede ser posterior a la final.', 'error');
          return;
        }
        applyGlobalFilters({
          cultivo: (document.getElementById('gfCultivo') || {}).value || '',
          sector: (document.getElementById('gfSector') || {}).value || '',
          desde: from,
          hasta: to
        });
      });
    }

    var clear = document.getElementById('gfClear');
    if (clear) clear.addEventListener('click', clearGlobalFilters);

    populateGlobalFilterSelects();
    updateGlobalFilterUI(globalFiltersFromStorage());
    loadFilterOptions();
  }

  function basePaletteItems(role) {
    var l = links(role);
    var items = [];
    sectionsFor(role).forEach(function (section) {
      section.items.forEach(function (item) {
        items.push({
          type: 'module',
          group: 'Módulos',
          label: item.label,
          meta: section.title,
          href: l.href(item.key)
        });
      });
    });
    items.push(
      {
        type: 'action',
        group: 'Acciones',
        label: 'Actualizar datos ahora',
        meta: 'Sincronizar la vista con la API',
        action: function () { refreshNow(true); }
      },
      {
        type: 'action',
        group: 'Acciones',
        label: 'Cambiar tema claro / oscuro',
        meta: 'Apariencia de la interfaz',
        action: toggleTheme
      },
      {
        type: 'action',
        group: 'Acciones',
        label: 'Limpiar filtros globales',
        meta: 'Cultivo, sector y fechas',
        action: clearGlobalFilters
      },
      {
        type: 'module',
        group: 'Acciones',
        label: 'Ver alertas pendientes',
        meta: 'Centro de alertas',
        href: l.href('alertas')
      }
    );
    return items;
  }

  function loadPaletteData() {
    var user = readUser();
    if (!user) return Promise.resolve();
    var role = (user.role || user.rol || '').toLowerCase();
    var l = links(role);
    var items = basePaletteItems(role);
    paletteLoadedAt = Date.now();
    paletteVisible = items.slice();
    renderCommandResults(document.getElementById('commandInput') ? document.getElementById('commandInput').value : '');
    return Promise.all([
      apiGet('/cultivos/'),
      apiGet('/dispositivos/'),
      apiGet('/alertas/'),
      apiGet('/tareas/?limit=50')
    ]).then(function (results) {
      (Array.isArray(results[0]) ? results[0] : []).forEach(function (item) {
        items.push({
          type: 'data',
          group: 'Cultivos',
          label: item.nombre || ('Cultivo #' + item.id),
          meta: item.ubicacion || 'Cultivo',
          href: l.href('historicos') + '?f_cultivo=' + encodeURIComponent(item.id)
        });
      });
      (Array.isArray(results[1]) ? results[1] : []).forEach(function (item) {
        items.push({
          type: 'data',
          group: 'Dispositivos',
          label: item.nombre || ('Dispositivo #' + item.id),
          meta: item.instalacion_nombre || item.direccion_mac || 'Dispositivo',
          href: l.href('dispositivos') + '?device=' + encodeURIComponent(item.id)
        });
      });
      (Array.isArray(results[2]) ? results[2] : []).forEach(function (item) {
        items.push({
          type: 'data',
          group: 'Alertas',
          label: item.cultivo_nombre || ('Alerta #' + item.id),
          meta: (item.severidad || 'info') + ' · ' + (item.tipo || 'sensor'),
          href: l.href('alertas') + '?alerta=' + encodeURIComponent(item.id)
        });
      });
      (Array.isArray(results[3]) ? results[3] : []).forEach(function (item) {
        items.push({
          type: 'data',
          group: 'Tareas',
          label: item.titulo || ('Tarea #' + item.id),
          meta: (item.estado || 'pendiente') + ' · ' + (item.prioridad || 'media'),
          href: l.href('tareas') + '?tarea=' + encodeURIComponent(item.id)
        });
      });
      paletteVisible = items.slice();
      renderCommandResults(document.getElementById('commandInput') ? document.getElementById('commandInput').value : '');
    });
  }

  function ensureCommandPalette() {
    if (document.getElementById('commandPalette')) return;
    var overlay = document.createElement('div');
    overlay.className = 'command-overlay';
    overlay.id = 'commandPalette';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="command-dialog" role="dialog" aria-modal="true" aria-label="Búsqueda global">' +
        '<div class="command-input-wrap">' +
          ICONS.search +
          '<input type="search" id="commandInput" autocomplete="off" spellcheck="false" placeholder="Buscar cultivos, dispositivos, alertas, tareas o módulos…" aria-label="Buscar en AquaPlants">' +
          '<kbd>Esc</kbd>' +
        '</div>' +
        '<div class="command-results" id="commandResults"></div>' +
        '<div class="command-foot">' +
          '<span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>' +
          '<span><kbd>Enter</kbd> abrir</span>' +
          '<span class="command-shortcut">Ctrl K</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeCommandPalette();
    });

    var input = document.getElementById('commandInput');
    if (input) {
      input.addEventListener('input', function () { renderCommandResults(input.value); });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          movePaletteSelection(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          movePaletteSelection(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          openPaletteSelection();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeCommandPalette();
        }
      });
    }

    var results = document.getElementById('commandResults');
    if (results) {
      results.addEventListener('click', function (event) {
        var item = event.target.closest('.command-item');
        if (!item) return;
        openPaletteSelection(Number(item.getAttribute('data-index')));
      });
    }
  }

  function openCommandPalette() {
    if (!readUser()) return;
    ensureCommandPalette();
    var overlay = document.getElementById('commandPalette');
    var input = document.getElementById('commandInput');
    if (!overlay || !input) return;
    overlay.hidden = false;
    overlay.classList.add('open');
    document.body.classList.add('command-open');
    input.value = '';
    paletteVisible = [];
    renderCommandResults('');
    window.setTimeout(function () { input.focus(); }, 20);
    if (!paletteLoadedAt || Date.now() - paletteLoadedAt > 60000) loadPaletteData();
  }

  function closeCommandPalette() {
    var overlay = document.getElementById('commandPalette');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove('open');
    document.body.classList.remove('command-open');
    paletteVisible = [];
  }

  function filteredPaletteItems(query) {
    var q = normalizeText(query).trim();
    if (!q) return paletteVisible.slice(0, 16);
    return paletteVisible.filter(function (item) {
      return normalizeText(item.label + ' ' + item.meta + ' ' + item.group).indexOf(q) !== -1;
    }).slice(0, 20);
  }

  function renderCommandResults(query) {
    var box = document.getElementById('commandResults');
    if (!box) return;
    var items = filteredPaletteItems(query);
    paletteVisible = items;
    paletteIndex = -1;
    if (!items.length) {
      box.innerHTML = '<div class="command-empty">Sin resultados para “' + escapeHtml(query) + '”.</div>';
      return;
    }
    var html = '';
    var lastGroup = '';
    items.forEach(function (item, index) {
      if (item.group !== lastGroup) {
        html += '<div class="command-group">' + escapeHtml(item.group) + '</div>';
        lastGroup = item.group;
      }
      html += '<button type="button" class="command-item" data-index="' + index + '">' +
        '<span class="command-icon">' + (item.action ? ICONS.refresh : ICONS.search) + '</span>' +
        '<span class="command-copy"><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.meta) + '</small></span>' +
        '<span class="command-enter">↵</span>' +
      '</button>';
    });
    box.innerHTML = html;
  }

  function movePaletteSelection(direction) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('#commandResults .command-item'));
    if (!buttons.length) return;
    paletteIndex = (paletteIndex + direction + buttons.length) % buttons.length;
    buttons.forEach(function (button, index) {
      button.classList.toggle('selected', index === paletteIndex);
    });
    buttons[paletteIndex].scrollIntoView({ block: 'nearest' });
  }

  function openPaletteSelection(index) {
    var selected = typeof index === 'number' ? paletteVisible[index] : paletteVisible[paletteIndex];
    if (!selected) return;
    closeCommandPalette();
    if (typeof selected.action === 'function') {
      selected.action();
      return;
    }
    if (selected.href) location.href = selected.href;
  }

  window.AquaFilters = {
    KEY: FILTER_KEY,
    get: function () { return Object.assign(emptyGlobalFilters(), globalFiltersFromStorage()); },
    set: applyGlobalFilters,
    clear: clearGlobalFilters,
    ready: filterReady,
    options: filterOptions
  };

  window.AquaUI = {
    registerRefresh: function (handler) {
      if (typeof handler !== 'function') return function () {};
      refreshHandlers.push(handler);
      return function () {
        var index = refreshHandlers.indexOf(handler);
        if (index !== -1) refreshHandlers.splice(index, 1);
      };
    },
    refresh: function () { return refreshNow(true); },
    openCommandPalette: openCommandPalette,
    toggleTheme: toggleTheme,
    getLastSync: function () { return lastSync; }
  };

  function apiBaseUrl() {
    return window.AQUAPLANTS_API_URL || '/api';
  }

  function apiGet(path) {
    var token = null;
    try { token = localStorage.getItem('aquaplants_token') || sessionStorage.getItem('aquaplants_token'); } catch (e) {}
    if (!token) return Promise.resolve(null);
    return fetch(apiBaseUrl() + path, { headers: { Authorization: 'Bearer ' + token } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .catch(function () { return null; });
  }

  function setBadge(id, count) {
    var badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  function loadSidebarBadges() {
    apiGet('/alertas/').then(function (alerts) {
      if (!Array.isArray(alerts)) return;
      setBadge('nav-alert-badge', alerts.filter(function (alert) {
        return alert.leida === false;
      }).length);
    });
    apiGet('/tareas/resumen').then(function (resumen) {
      if (!resumen) return;
      setBadge('nav-task-badge', (resumen.pendientes || 0) + (resumen.en_progreso || 0));
    });
    apiGet('/incidencias/estadisticas').then(function (resumen) {
      if (!resumen) return;
      setBadge('nav-incident-badge', resumen.abiertas || 0);
    });
    apiGet('/inventario/alertas').then(function (resumen) {
      if (!resumen) return;
      setBadge('nav-stock-badge', resumen.total || 0);
    });
  }

  function renderNotifItems(items) {
    var list = document.getElementById('notifList');
    if (!list) return;
    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = '<div class="notif-empty">Sin notificaciones en esta categoría.</div>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var fecha = item.fecha_creacion ? new Date(item.fecha_creacion).toLocaleString('es-CL') : '';
      return '<button type="button" class="notif-item' + (item.leida ? '' : ' unread') +
        '" data-id="' + escapeHtml(item.id) + '" data-url="' + escapeHtml(item.url || '') + '">' +
        '<span class="notif-priority ' + escapeHtml(item.prioridad || 'info') + '"></span>' +
        '<span class="notif-body">' +
          '<strong>' + escapeHtml(item.titulo) + '</strong>' +
          (item.mensaje ? '<small>' + escapeHtml(item.mensaje) + '</small>' : '') +
          '<em>' + escapeHtml(fecha) + ' · ' + escapeHtml(item.categoria) + '</em>' +
        '</span>' +
      '</button>';
    }).join('');
  }

  function loadNotifList(categoria) {
    var query = '/notificaciones/?limit=12' + (categoria ? '&categoria=' + encodeURIComponent(categoria) : '');
    apiGet(query).then(renderNotifItems);
  }

  function loadNotificationCenter() {
    apiGet('/notificaciones/resumen').then(function (resumen) {
      var dot = document.getElementById('notifDot');
      if (dot) dot.style.display = resumen && resumen.no_leidas > 0 ? 'block' : 'none';
    });
    loadNotifList('');
  }

  function setupNotificationCenter() {
    var toggle = document.getElementById('notifToggle');
    var panel = document.getElementById('notifPanel');
    if (!toggle || !panel) return;

    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = panel.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        loadNotifList('');
        setTimeout(function () { loadNotificationCenter(); }, 800);
      }
    });

    var filters = document.getElementById('notifFilters');
    if (filters) {
      filters.addEventListener('click', function (event) {
        var button = event.target.closest('button[data-cat]');
        if (!button) return;
        Array.prototype.forEach.call(filters.querySelectorAll('button'), function (item) {
          item.classList.remove('active');
        });
        button.classList.add('active');
        loadNotifList(button.getAttribute('data-cat'));
      });
    }

    var markAll = document.getElementById('notifMarkAll');
    if (markAll) {
      markAll.addEventListener('click', function () {
        var token = null;
        try { token = localStorage.getItem('aquaplants_token') || sessionStorage.getItem('aquaplants_token'); } catch (e) {}
        var base = apiBaseUrl();
        fetch(base + '/notificaciones/marcar-todas', {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + token }
        }).then(function () {
          loadNotifList(document.querySelector('#notifFilters .active').getAttribute('data-cat'));
          loadNotificationCenter();
        }).catch(function () {});
      });
    }

    var list = document.getElementById('notifList');
    if (list) {
      list.addEventListener('click', function (event) {
        var item = event.target.closest('.notif-item');
        if (!item) return;
        var id = item.getAttribute('data-id');
        var url = item.getAttribute('data-url');
        var token = null;
        try { token = localStorage.getItem('aquaplants_token') || sessionStorage.getItem('aquaplants_token'); } catch (e) {}
        var base = apiBaseUrl();
        fetch(base + '/notificaciones/' + id + '/leer', {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + token }
        }).finally(function () {
          if (url) window.location.href = url;
          else {
            item.classList.remove('unread');
            loadNotificationCenter();
          }
        });
      });
    }

    document.addEventListener('click', function (event) {
      if (!event.target.closest('.notif-wrap')) {
        panel.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        panel.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var notifStream = null;

  function startNotificationStream() {
    if (typeof window.EventSource === 'undefined') return;
    if (navigator.webdriver) return;
    var token = null;
    try {
      token = localStorage.getItem('aquaplants_token') || sessionStorage.getItem('aquaplants_token');
    } catch (e) {}
    if (!token) return;

    var base = apiBaseUrl();
    try {
      notifStream = new EventSource(
        base + '/notificaciones/stream?token=' + encodeURIComponent(token)
      );
    } catch (e) {
      return;
    }

    notifStream.onmessage = function (event) {
      var data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      var dot = document.getElementById('notifDot');
      if (dot) dot.style.display = data.no_leidas > 0 ? 'block' : 'none';
      var panel = document.getElementById('notifPanel');
      if (panel && panel.classList.contains('open')) loadNotifList('');
    };

    notifStream.onerror = function () {
      if (notifStream && notifStream.readyState === 2) {
        try { notifStream.close(); } catch (e) {}
        notifStream = null;
      }
    };

    window.addEventListener('beforeunload', function () {
      if (notifStream) {
        try { notifStream.close(); } catch (e) {}
        notifStream = null;
      }
    });
  }

  function setupSearch(role, sections, l) {
    var input = document.getElementById('globalSearch');
    var box = document.getElementById('searchResults');
    if (!input || !box) return;

    var items = [];
    sections.forEach(function (section) {
      section.items.forEach(function (item) {
        items.push({ label: item.label, href: l.href(item.key), section: section.title });
      });
    });

    function render(query) {
      var q = (query || '').trim().toLowerCase();
      var matches = items.filter(function (item) {
        return !q || item.label.toLowerCase().indexOf(q) !== -1 || item.section.toLowerCase().indexOf(q) !== -1;
      });
      if (matches.length === 0) {
        box.innerHTML = '<div class="search-empty">Sin resultados</div>';
      } else {
        box.innerHTML = matches.slice(0, 7).map(function (item) {
          return '<a class="search-result" href="' + item.href + '">' +
            '<span>' + item.label + '</span>' +
            '<small style="margin-left:auto;color:var(--g-muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px">' + item.section + '</small>' +
            '</a>';
        }).join('');
      }
      box.classList.add('open');
    }

    input.addEventListener('focus', function () { render(input.value); });
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { box.classList.remove('open'); input.blur(); }
      if (e.key === 'Enter') {
        var first = box.querySelector('.search-result');
        if (first) { e.preventDefault(); location.href = first.getAttribute('href'); }
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.topbar-search')) box.classList.remove('open');
    });
  }

  function mount() {
    var key = activeKey(currentKey());
    var user = readUser();
    if (!user) return;

    var role = (user.role || user.rol || '').toLowerCase();
    var name = user.name || user.sub || user.username || 'Usuario';

    var adminOnly = {
      'dashboard-admin': true,
      usuarios: true,
      grupos: true,
      instalaciones: true,
      umbrales: true,
      'admin-dispositivos': true,
      simulador: true
    };
    if (adminOnly[key] && role !== 'admin' && role !== 'administrador') {
      location.replace(isAdminLocation() ? '../pages/dashboard.html' : 'dashboard.html');
      return;
    }

    document.body.classList.add('aqua-app');
    try {
      if (localStorage.getItem('aqua_sidebar_collapsed') === '1') {
        document.body.classList.add('sidebar-collapsed');
      }
    } catch (e) {}

    var favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23173F35'/%3E%3Cpath d='M32 12c8 10 14 17 14 25a14 14 0 0 1-28 0c0-8 6-15 14-25z' fill='%2383B99A'/%3E%3C/svg%3E";

    var header = extractHeader();
    removeLegacyShell();

    var main = document.querySelector('main.main-content');
    var shell;

    if (!main) {
      main = document.createElement('main');
      main.className = 'main-content';
      shell = document.createElement('div');
      shell.className = 'app-layout';
      document.body.appendChild(shell);
      shell.appendChild(main);

      var content = document.createElement('div');
      content.className = 'content-wrapper';
      main.appendChild(content);

      var children = Array.prototype.slice.call(document.body.children);
      children.forEach(function (child) {
        if (child === shell || child.tagName === 'SCRIPT') return;
        content.appendChild(child);
      });
    } else {
      shell = main.parentElement;
      if (!shell || shell === document.body) {
        shell = document.createElement('div');
        shell.className = 'app-layout';
        main.parentNode.insertBefore(shell, main);
        shell.appendChild(main);
      } else if (!shell.classList.contains('app-layout')) {
        shell.classList.add('app-layout');
      }

      var existingContent = main.querySelector(':scope > .content-wrapper, :scope > .page-content');
      if (!existingContent) {
        var wrapper = document.createElement('div');
        wrapper.className = 'content-wrapper';
        var mainChildren = Array.prototype.slice.call(main.children);
        mainChildren.forEach(function (child) {
          if (child.classList.contains('topbar')) return;
          wrapper.appendChild(child);
        });
        main.appendChild(wrapper);
      }
    }

    var existingSidebar = shell.querySelector('aside.sidebar');
    if (existingSidebar) existingSidebar.parentNode.removeChild(existingSidebar);

    var sidebar = buildSidebar(role);
    shell.insertBefore(sidebar, shell.firstChild);

    var sidebarNav = sidebar.querySelector('.sidebar-nav');
    restoreSidebarScroll(sidebarNav);
    if (sidebarNav) {
      sidebar.addEventListener('click', function (event) {
        if (event.target.closest('a.nav-item')) persistSidebarScroll(sidebarNav);
      });
      window.addEventListener('pagehide', function () { persistSidebarScroll(sidebarNav); });
      window.addEventListener('beforeunload', function () { persistSidebarScroll(sidebarNav); });
    }

    var backdrop = shell.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      shell.appendChild(backdrop);
    }

    var oldTopbar = main.querySelector('header.topbar');
    if (oldTopbar) oldTopbar.parentNode.removeChild(oldTopbar);
    main.insertBefore(buildTopbar(header, role), main.firstChild);

    setText('userName', name);
    setText('userRole', ROLE_LABELS[role] || role || 'Usuario');
    setText('user-name', name);
    setText('user-role', ROLE_LABELS[role] || role || 'Usuario');
    setText('userAvatar', initials(name));
    var topAvatar = document.getElementById('userAvatarTop');
    if (topAvatar) topAvatar.textContent = initials(name);

    var themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        var nextTheme = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        try { localStorage.setItem('aqua_theme', nextTheme); } catch (e) {}
      });
    }
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem('aqua_theme') || 'light'; } catch (e) {}
    document.documentElement.setAttribute('data-theme', savedTheme);

    var collapseBtn = document.getElementById('sidebarCollapse');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function () {
        var collapsed = document.body.classList.toggle('sidebar-collapsed');
        try { localStorage.setItem('aqua_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) {}
        collapseBtn.setAttribute('title', collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral');
      });
    }

    setupSearch(role, sectionsFor(role), links(role));
    loadSidebarBadges();
    loadNotificationCenter();
    setupNotificationCenter();
    startNotificationStream();

    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (typeof logout === 'function') logout();
        else if (window.AquaAuth) window.AquaAuth.logout();
      });
    }

    var menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', function () {
        if (typeof window.toggleSidebar === 'function') {
          window.toggleSidebar();
          backdrop.classList.toggle('open');
        } else {
          sidebar.classList.toggle('open');
          backdrop.classList.toggle('open');
        }
      });
    }

    backdrop.addEventListener('click', function () {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
    });

    var current = shell.querySelector('.nav-item.active');
    if (current) {
      current.setAttribute('aria-current', 'page');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
