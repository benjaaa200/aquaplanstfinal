/* =========================================================
   AquaPlants · Dashboard general
   Indicadores y gráficos a partir de mediciones reales.
   ========================================================= */
(function () {
    'use strict';

    var COLORS = {
        forest: '#173F35',
        green: '#2E7D5B',
        accent: '#83B99A',
        warning: '#B7791F',
        danger: '#BE5B54',
        border: '#E2EAE3',
        muted: '#78857C'
    };

    var state = {
        measurements: [],
        kpis: null,
        tempChart: null,
        humChart: null,
        period: 'all'
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

    function fmt(value, suffix) {
        return (value === null || value === undefined || isNaN(value)) ? '—' : (Math.round(value * 10) / 10) + suffix;
    }

    function init() {
        var user = checkAuth();
        if (!user) return;
        load();
        var select = document.getElementById('period-select');
        if (select) {
            select.addEventListener('change', function () {
                state.period = select.value;
                renderCharts();
            });
        }
    }

    function load() {
        Promise.all([
            apiClient.get('/dashboard/kpis').catch(function (error) {
                console.warn('[Dashboard] KPIs:', error.message);
                return null;
            }),
            apiClient.get('/mediciones/?limit=50').catch(function (error) {
                console.warn('[Dashboard] Mediciones:', error.message);
                return null;
            })
        ]).then(function (results) {
            state.kpis = results[0];
            state.measurements = results[1] || [];
            renderKPIs();
            renderHealth();
            renderCharts();
            renderTable();
        });
    }

    function renderKPIs() {
        var kpis = state.kpis;
        setText('kpi-temp', kpis && kpis.avg_temp ? fmt(kpis.avg_temp, ' °C') : '—');
        setText('kpi-humidity', kpis && kpis.avg_humidity ? fmt(kpis.avg_humidity, ' %') : '—');
        setText('kpi-water', kpis && kpis.avg_water ? fmt(kpis.avg_water, ' %') : '—');
        setText('kpi-alerts', kpis ? (kpis.active_alerts || 0) : '—');

        setText('kpi-temp-hint', kpis ? 'promedio reciente' : 'Sin conexión con la API');
        setText('kpi-humidity-hint', kpis ? 'promedio reciente' : 'Sin conexión con la API');
        setText('kpi-water-hint', kpis ? 'promedio reciente' : 'Sin conexión con la API');
        setText('kpi-alerts-hint', kpis ? ((kpis.active_alerts || 0) > 0 ? 'requieren atención' : 'todo en orden') : 'Sin conexión con la API');

        updateAlertBadge(kpis ? (kpis.active_alerts || 0) : 0);
    }

    function updateAlertBadge(count) {
        var badge = document.getElementById('nav-alert-badge');
        var dot = document.getElementById('notifDot');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
        if (dot) dot.style.display = count > 0 ? 'block' : 'none';
    }

    function renderHealth() {
        var kpis = state.kpis;
        var el = document.getElementById('healthScoreValue');
        var fill = document.getElementById('healthScoreFill');
        var label = document.getElementById('healthScoreLabel');
        if (!kpis) {
            if (el) el.textContent = '—';
            if (label) label.textContent = 'Sin datos';
            return;
        }

        var score = 100;
        if (kpis.avg_temp > 30) score -= 20;
        if (kpis.avg_temp < 15) score -= 15;
        if (kpis.avg_humidity < 40 || kpis.avg_humidity > 90) score -= 10;
        if (kpis.avg_water < 20) score -= 20;
        if (kpis.active_alerts > 5) score -= 15;
        score = Math.max(0, Math.min(100, Math.round(score)));

        if (el) el.textContent = score;
        if (fill) fill.style.width = score + '%';
        if (label) {
            label.textContent = score >= 80 ? 'Saludable' : (score >= 50 ? 'Requiere atención' : 'Crítico');
            label.className = 'status-badge ' + (score >= 80 ? 'status-activo' : (score >= 50 ? 'status-warning' : 'status-danger'));
        }
    }

    function periodStart() {
        if (state.period === 'all') return 0;
        var now = Date.now();
        var map = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };
        return now - (map[state.period] || 24 * 7) * 3600 * 1000;
    }

    function filtered() {
        var from = periodStart();
        return state.measurements.filter(function (m) {
            var t = m.fecha_hora ? new Date(m.fecha_hora).getTime() : 0;
            return t >= from;
        }).reverse();
    }

    function renderCharts() {
        if (typeof Chart === 'undefined') return;
        var data = filtered();
        var labels = data.map(function (m) {
            var d = new Date(m.fecha_hora);
            return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) + ' ' +
                d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        });

        setText('tempChartSub', data.length ? 'Evolución en el periodo seleccionado' : 'Sin mediciones en este periodo');
        setText('humChartSub', data.length ? 'Evolución en el periodo seleccionado' : 'Sin mediciones en este periodo');

        var tempData = data.map(function (m) { return m.temperatura; });
        var humData = data.map(function (m) { return m.humedad; });
        var waterData = data.map(function (m) { return m.nivel_agua; });

        var baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: COLORS.muted,
                        usePointStyle: true,
                        boxWidth: 8,
                        font: { family: 'Inter', size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: COLORS.muted, maxTicksLimit: 6, font: { family: 'Inter', size: 10 } }
                },
                y: {
                    beginAtZero: false,
                    grid: { color: COLORS.border },
                    ticks: { color: COLORS.muted, font: { family: 'Inter', size: 10 } }
                }
            }
        };

        if (state.tempChart) state.tempChart.destroy();
        var tempCtx = document.getElementById('tempChart');
        if (tempCtx) {
            state.tempChart = new Chart(tempCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Temperatura (°C)',
                        data: tempData,
                        borderColor: COLORS.green,
                        backgroundColor: 'rgba(46, 125, 91, 0.10)',
                        pointBackgroundColor: COLORS.green,
                        pointRadius: data.length > 20 ? 0 : 3,
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true
                    }]
                },
                options: baseOptions
            });
        }

        if (state.humChart) state.humChart.destroy();
        var humCtx = document.getElementById('humChart');
        if (humCtx) {
            state.humChart = new Chart(humCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Humedad (%)',
                        data: humData,
                        borderColor: COLORS.accent,
                        backgroundColor: 'rgba(131, 185, 154, 0.12)',
                        pointBackgroundColor: COLORS.accent,
                        pointRadius: data.length > 20 ? 0 : 3,
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true
                    }, {
                        label: 'Nivel de agua (%)',
                        data: waterData,
                        borderColor: '#B7791F',
                        backgroundColor: 'rgba(183, 121, 31, 0.06)',
                        pointRadius: 0,
                        borderWidth: 2,
                        borderDash: [5, 4],
                        tension: 0.35,
                        fill: false
                    }]
                },
                options: baseOptions
            });
        }
    }

    function renderTable() {
        var tbody = document.getElementById('measurements-table-body');
        if (!tbody) return;

        if (!state.measurements.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No hay mediciones registradas todavía.</td></tr>';
            return;
        }

        tbody.innerHTML = state.measurements.slice(0, 8).map(function (m) {
            var status = 'status-ok';
            var label = 'Óptimo';
            if (m.temperatura > 30 || m.humedad < 40 || m.nivel_agua < 20) {
                status = 'status-warning';
                label = 'Revisar';
            }
            if (m.temperatura > 35 || m.nivel_agua < 10) {
                status = 'status-danger';
                label = 'Crítico';
            }
            var date = m.fecha_hora ? new Date(m.fecha_hora).toLocaleString('es-CL') : '—';
            return '<tr>' +
                '<td>' + escapeHtml(date) + '</td>' +
                '<td>Cultivo #' + escapeHtml(m.cultivo_id) + '</td>' +
                '<td>' + fmt(m.temperatura, ' °C') + '</td>' +
                '<td>' + fmt(m.humedad, ' %') + '</td>' +
                '<td>' + fmt(m.nivel_agua, ' %') + '</td>' +
                '<td><span class="status-badge ' + status + '">' + label + '</span></td>' +
                '</tr>';
        }).join('');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
