(function () {
  'use strict';

  var state = {
    data: null,
    chart: null
  };

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function dateInputValue(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function cargarOpciones() {
    return Promise.all([
      Ops.get('/instalaciones/').catch(function () { return []; }),
      Ops.get('/cultivos/').catch(function () { return []; }),
      Ops.get('/equipo/').catch(function () { return []; })
    ]).then(function (results) {
      Ops.llenarSelect(document.getElementById('perfSector'), results[0] || [], { label: 'nombre', placeholder: 'Todos' });
      Ops.llenarSelect(document.getElementById('perfCultivo'), results[1] || [], { label: 'nombre', placeholder: 'Todos' });
      Ops.llenarSelect(document.getElementById('perfResponsable'), results[2] || [], { label: 'nombre_completo', placeholder: 'Todos' });
    });
  }

  function cargar() {
    var params = [];
    var inicio = document.getElementById('perfInicio').value;
    var fin = document.getElementById('perfFin').value;
    var sector = document.getElementById('perfSector').value;
    var cultivo = document.getElementById('perfCultivo').value;
    var responsable = document.getElementById('perfResponsable').value;
    if (inicio) params.push('fecha_inicio=' + encodeURIComponent(inicio + 'T00:00:00'));
    if (fin) params.push('fecha_fin=' + encodeURIComponent(fin + 'T23:59:59'));
    if (sector) params.push('sector_id=' + encodeURIComponent(sector));
    if (cultivo) params.push('cultivo_id=' + encodeURIComponent(cultivo));
    if (responsable) params.push('responsable_id=' + encodeURIComponent(responsable));
    Ops.get('/rendimiento/' + (params.length ? '?' + params.join('&') : '')).then(function (data) {
      state.data = data;
      render(data);
    }).catch(function (error) {
      showToast(error.message, 'error');
    });
  }

  function render(data) {
    var indicadores = data.indicadores || {};
    var inicio = document.getElementById('perfInicio').value;
    var fin = document.getElementById('perfFin').value;
    document.getElementById('perfPeriodo').textContent = inicio || fin
      ? 'Periodo analizado: ' + (inicio ? Ops.fecha(inicio) : 'inicio') + ' — ' + (fin ? Ops.fecha(fin) : 'hoy')
      : 'Calculado a partir de tareas, incidencias, mantenimientos, inspecciones y consumo de insumos registrados en AquaPlants.';

    document.getElementById('perfResumen').innerHTML = (data.resumen_ejecutivo || []).map(function (linea) {
      return '<li>' + Ops.escape(linea) + '</li>';
    }).join('');

    document.getElementById('perfKPIs').innerHTML = [
      ['Cultivos activos', indicadores.cultivos_activos, indicadores.cultivos_finalizados + ' finalizados'],
      ['Tareas completadas', indicadores.tareas_completadas, indicadores.tareas_pendientes + ' pendientes'],
      ['Tareas atrasadas', indicadores.tareas_atrasadas, 'requieren seguimiento'],
      ['Incidencias registradas', indicadores.incidencias_registradas, indicadores.incidencias_resueltas + ' resueltas'],
      ['Mantenimientos', indicadores.mantenimientos_realizados, 'completados'],
      ['Inspecciones', indicadores.inspecciones_realizadas, 'completadas'],
      ['Consumo de insumos', indicadores.consumo_insumos, 'unidades registradas'],
      ['Cultivos finalizados', indicadores.cultivos_finalizados, 'en el periodo']
    ].map(function (item) {
      return '<div class="ops-card"><div class="ops-muted">' + item[0] + '</div><div class="stat-value">' + (item[1] || 0) + '</div><div class="ops-small">' + Ops.escape(item[2]) + '</div></div>';
    }).join('');

    renderChart(data.serie || []);
    renderSectores(data.por_sector || []);
  }

  function renderChart(serie) {
    if (typeof Chart === 'undefined') return;
    if (state.chart) state.chart.destroy();
    var canvas = document.getElementById('perfChart');
    if (!canvas) return;
    state.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: serie.map(function (item) { return item.periodo; }),
        datasets: [
          { label: 'Tareas completadas', data: serie.map(function (i) { return i.tareas_completadas; }), borderColor: '#2F7D4F', backgroundColor: 'rgba(47,125,79,0.12)', tension: 0.35, fill: true },
          { label: 'Incidencias registradas', data: serie.map(function (i) { return i.incidencias_registradas; }), borderColor: '#C7861B', backgroundColor: 'rgba(199,134,27,0.12)', tension: 0.35 },
          { label: 'Incidencias resueltas', data: serie.map(function (i) { return i.incidencias_resueltas; }), borderColor: '#4C6FD1', backgroundColor: 'rgba(76,111,209,0.12)', tension: 0.35 },
          { label: 'Mantenimientos', data: serie.map(function (i) { return i.mantenimientos; }), borderColor: '#7A5AF8', backgroundColor: 'rgba(122,90,248,0.12)', tension: 0.35 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } }
        }
      }
    });
  }

  function renderSectores(sectores) {
    var bars = document.getElementById('perfSectorBars');
    if (!sectores.length) {
      bars.innerHTML = Ops.vacio('Sin datos por sector', 'Registra tareas y eventos para ver el desglose.');
      document.getElementById('perfTableBody').innerHTML = '<tr><td colspan="8">' + Ops.vacio('Sin datos', 'No hay actividad en el periodo.') + '</td></tr>';
      document.getElementById('perfTablaInfo').textContent = '';
      return;
    }
    var evaluados = sectores.filter(function (sector) {
      return sector.tareas_total || sector.incidencias_total || sector.eventos_completados;
    });
    var ranking = (evaluados.length ? evaluados : sectores).slice().sort(function (a, b) {
      var rateA = a.tareas_total ? a.tareas_completadas / a.tareas_total : 0;
      var rateB = b.tareas_total ? b.tareas_completadas / b.tareas_total : 0;
      return rateB - rateA;
    });
    bars.innerHTML = ranking.slice(0, 6).map(function (sector) {
      var tareasPct = sector.tareas_total ? Math.round((sector.tareas_completadas / sector.tareas_total) * 100) : 0;
      var incPct = sector.incidencias_total ? Math.round((sector.incidencias_resueltas / sector.incidencias_total) * 100) : 0;
      return '<div class="perf-bar-row"><span>' + Ops.escape(sector.sector_nombre) + '</span>' +
        '<div class="perf-bar-track"><i style="width:' + tareasPct + '%"></i></div>' +
        '<span>' + tareasPct + '% tareas</span></div>' +
        '<div class="perf-bar-row"><span></span>' +
        '<div class="perf-bar-track b"><i style="width:' + incPct + '%"></i></div>' +
        '<span>' + incPct + '% inc.</span></div>';
    }).join('');

    document.getElementById('perfTableBody').innerHTML = sectores.map(function (sector) {
      var tareasPct = sector.tareas_total ? Math.round((sector.tareas_completadas / sector.tareas_total) * 100) : 0;
      var incPct = sector.incidencias_total ? Math.round((sector.incidencias_resueltas / sector.incidencias_total) * 100) : 0;
      return '<tr>' +
        '<td><strong>' + Ops.escape(sector.sector_nombre) + '</strong></td>' +
        '<td>' + sector.cultivos + '</td>' +
        '<td>' + sector.tareas_total + '</td>' +
        '<td>' + sector.tareas_completadas + ' <span class="ops-small">(' + tareasPct + '%)</span></td>' +
        '<td>' + sector.incidencias_total + '</td>' +
        '<td>' + sector.incidencias_resueltas + ' <span class="ops-small">(' + incPct + '%)</span></td>' +
        '<td>' + sector.eventos_completados + '</td>' +
        '<td>' + sector.consumo_insumos + '</td>' +
      '</tr>';
    }).join('');
    document.getElementById('perfTablaInfo').textContent = sectores.length + ' sectores en el periodo';
  }

  function exportar() {
    if (!state.data || !state.data.por_sector) return;
    var rows = [['Sector', 'Cultivos', 'Tareas', 'Completadas', 'Incidencias', 'Resueltas', 'Eventos', 'Consumo']];
    state.data.por_sector.forEach(function (sector) {
      rows.push([sector.sector_nombre, sector.cultivos, sector.tareas_total, sector.tareas_completadas,
        sector.incidencias_total, sector.incidencias_resueltas, sector.eventos_completados, sector.consumo_insumos]);
    });
    var csv = rows.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'rendimiento_aquaplants.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  function init() {
    var user = Ops.usuario();
    if (!user) return;
    var fin = new Date();
    var inicio = new Date(fin.getFullYear(), fin.getMonth() - 5, 1);
    document.getElementById('perfInicio').value = dateInputValue(inicio);
    document.getElementById('perfFin').value = dateInputValue(fin);
    cargarOpciones().then(cargar);
    document.getElementById('perfRefresh').addEventListener('click', cargar);
    document.getElementById('perfExport').addEventListener('click', exportar);
    document.getElementById('perfPrint').addEventListener('click', function () { window.print(); });
    ['perfInicio', 'perfFin', 'perfSector', 'perfCultivo', 'perfResponsable'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', cargar);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
