/* =========================================================
   AquaPlants · Dashboard de Administración
   Consume los endpoints reales del backend FastAPI.
   ========================================================= */
(function () {
    'use strict';

    var COLORS = {
        forest: '#173F35',
        green: '#2E7D5B',
        accent: '#83B99A',
        soft: '#E8F2EC',
        warning: '#B7791F',
        danger: '#BE5B54',
        border: '#E2EAE3',
        muted: '#78857C'
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function updateAlertBadge(count) {
        var badge = document.getElementById('nav-alert-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    function safe(promise) {
        return promise.then(function (data) {
            return { ok: true, data: data };
        }).catch(function (error) {
            console.warn('[Dashboard Admin]', error.message);
            return { ok: false, data: null };
        });
    }

    function init() {
        var user = checkAuth();
        if (!user) return;
        var role = String(user.role || '').toLowerCase();
        if (role !== 'admin' && role !== 'administrador') {
            location.replace('dashboard.html');
            return;
        }
        loadAll();
    }

    function loadAll() {
        Promise.all([
            safe(apiClient.get('/usuarios/')),
            safe(apiClient.get('/cultivos/')),
            safe(apiClient.get('/alertas/')),
            safe(apiClient.get('/mediciones/?limit=50'))
        ]).then(function (results) {
            var users = results[0].ok ? (results[0].data || []) : [];
            var crops = results[1].ok ? (results[1].data || []) : [];
            var alerts = results[2].ok ? (results[2].data || []) : [];
            var measurements = results[3].ok ? (results[3].data || []) : [];

            renderKPIs(users, crops, alerts, measurements, results);
            renderUsers(users, results[0].ok);
            renderAlerts(alerts, results[2].ok);
            renderRoleChart(users);
            renderCropsChart(crops);
        });
    }

    function renderKPIs(users, crops, alerts, measurements, results) {
        var activeUsers = users.filter(function (u) { return u.activo; }).length;
        var activeCrops = crops.filter(function (c) {
            return String(c.estado || '').toLowerCase() === 'activo';
        }).length;
        var unread = alerts.filter(function (a) { return a.leida === false || a.leido === false; }).length;

        setText('totalUsers', results[0].ok ? users.length : '—');
        setText('totalUsersHint', results[0].ok ? activeUsers + ' activos' : 'No disponible');

        setText('totalCrops', results[1].ok ? crops.length : '—');
        setText('totalCropsHint', results[1].ok ? activeCrops + ' en producción' : 'No disponible');

        setText('totalAlerts', results[2].ok ? unread : '—');
        setText('totalAlertsHint', results[2].ok ? (alerts.length ? alerts.length + ' registradas' : 'Sin alertas') : 'No disponible');

        setText('totalMeasurements', results[3].ok ? measurements.length : '—');
        setText('totalMeasurementsHint', results[3].ok ? 'últimas recibidas' : 'No disponible');

        updateAlertBadge(results[2].ok ? unread : 0);
    }

    function renderUsers(users, ok) {
        var tbody = document.getElementById('adminUsersList');
        if (!tbody) return;

        if (!ok) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading-row">No se pudieron cargar los usuarios.</td></tr>';
            return;
        }
        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Aún no hay usuarios registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = users.slice(0, 6).map(function (u) {
            var role = String(u.rol || '').toLowerCase();
            var badge = role === 'admin' || role === 'administrador' ? 'badge-admin' :
                (role === 'supervisor' ? 'badge-supervisor' : 'badge-encargado');
            return '<tr>' +
                '<td><strong>' + escapeHtml(u.nombre_completo || u.username || 'Usuario') + '</strong></td>' +
                '<td>' + escapeHtml(u.username || '-') + '</td>' +
                '<td><span class="badge ' + badge + '">' + escapeHtml(role || 'sin rol') + '</span></td>' +
                '<td><span class="status-badge ' + (u.activo ? 'status-activo' : 'status-inactivo') + '">' +
                    (u.activo ? 'Activo' : 'Inactivo') + '</span></td>' +
                '</tr>';
        }).join('');
    }

    function renderAlerts(alerts, ok) {
        var container = document.getElementById('adminAlertsList');
        if (!container) return;

        if (!ok) {
            container.innerHTML = '<div class="empty-state"><i class="ph ph-warning-circle"></i><p>No se pudieron cargar las alertas.</p></div>';
            return;
        }

        var pending = alerts.filter(function (a) { return a.leida === false || a.leido === false; });
        if (!pending.length) {
            container.innerHTML = '<div class="empty-state"><i class="ph ph-check-circle"></i><p>Todo en orden. No hay alertas pendientes.</p></div>';
            return;
        }

        container.innerHTML = pending.slice(0, 5).map(function (a) {
            var severity = String(a.severidad || 'info').toLowerCase();
            var css = severity === 'danger' || severity === 'critica' || severity === 'crítica' ? 'danger' :
                (severity === 'warning' || severity === 'advertencia' ? 'warning' : 'info');
            var icon = css === 'danger' ? 'ph-warning-octagon' : (css === 'warning' ? 'ph-warning' : 'ph-info');
            var date = a.fecha_hora ? new Date(a.fecha_hora).toLocaleString('es-CL') : '';
            return '<div class="alert ' + css + '">' +
                '<i class="ph ' + icon + '" style="font-size:20px;flex-shrink:0;"></i>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:13px;font-weight:600;">' + escapeHtml(a.mensaje || 'Alerta del sistema') + '</div>' +
                    '<div style="font-size:11.5px;color:var(--g-muted);margin-top:3px;">' + escapeHtml(date) + '</div>' +
                '</div></div>';
        }).join('');
    }

    function chartConfig() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: COLORS.muted,
                        font: { family: 'Inter', size: 11 },
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 16
                    }
                }
            }
        };
    }

    function renderRoleChart(users) {
        var canvas = document.getElementById('roleChart');
        if (!canvas || typeof Chart === 'undefined') return;

        var counts = { admin: 0, supervisor: 0, encargado: 0 };
        users.forEach(function (u) {
            var role = String(u.rol || '').toLowerCase();
            if (role === 'admin' || role === 'administrador') counts.admin += 1;
            else if (role === 'supervisor') counts.supervisor += 1;
            else counts.encargado += 1;
        });

        var cfg = chartConfig();
        new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Administradores', 'Supervisores', 'Encargados'],
                datasets: [{
                    data: [counts.admin, counts.supervisor, counts.encargado],
                    backgroundColor: [COLORS.forest, COLORS.green, COLORS.accent],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: Object.assign({}, cfg, { cutout: '68%' })
        });
    }

    function renderCropsChart(crops) {
        var canvas = document.getElementById('cropsChart');
        if (!canvas || typeof Chart === 'undefined') return;

        var labels = [];
        var values = [];
        var counts = {};
        crops.forEach(function (c) {
            var state = String(c.estado || 'sin estado').toLowerCase();
            counts[state] = (counts[state] || 0) + 1;
        });
        Object.keys(counts).forEach(function (key) {
            labels.push(key.charAt(0).toUpperCase() + key.slice(1));
            values.push(counts[key]);
        });

        var cfg = chartConfig();
        cfg.plugins.legend.display = false;
        cfg.scales = {
            x: {
                grid: { display: false },
                ticks: { color: COLORS.muted, font: { family: 'Inter', size: 11 } }
            },
            y: {
                beginAtZero: true,
                grid: { color: COLORS.border },
                ticks: { color: COLORS.muted, precision: 0, font: { family: 'Inter', size: 11 } }
            }
        };

        new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cultivos',
                    data: values,
                    backgroundColor: COLORS.green,
                    hoverBackgroundColor: COLORS.forest,
                    borderRadius: 7,
                    maxBarThickness: 42
                }]
            },
            options: cfg
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
