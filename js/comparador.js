/**
 * AquaPlants - Lógica del Comparador de Cultivos (datos reales)
 */

let selectedCultivos = [];
let allCultivos = [];
let comparisonChart = null;
let radarChart = null;
let currentPeriod = '7d';

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;

    setupUserInterface(user);
    await loadCultivos();
});

function setupUserInterface(user) {
    document.getElementById('user-name').textContent = user.name || user.sub || user.username || 'Usuario';
    document.getElementById('user-role').textContent = user.role || 'Rol';
}

async function loadCultivos() {
    const selector = document.getElementById('cultivo-selector');
    selector.innerHTML = '<div class="loading-state"><i class="ph ph-spinner ph-spin"></i><p>Cargando...</p></div>';

    try {
        allCultivos = await apiClient.get('/cultivos/');
        if (!allCultivos.length) {
            selector.innerHTML = '<div class="empty-state"><p>No tienes cultivos disponibles para comparar.</p></div>';
            return;
        }
        renderCultivoSelector(allCultivos);
    } catch (error) {
        selector.innerHTML = `<div class="empty-state"><p>${error.message}</p></div>`;
    }
}

function renderCultivoSelector(cultivos) {
    const selector = document.getElementById('cultivo-selector');
    selector.innerHTML = '';

    cultivos.forEach(cultivo => {
        const option = document.createElement('div');
        option.className = 'cultivo-option';
        option.dataset.id = cultivo.id;
        option.onclick = () => toggleCultivo(cultivo.id);

        option.innerHTML = `
            <input type="checkbox" id="cultivo-${cultivo.id}" value="${cultivo.id}">
            <div class="cultivo-option-info">
                <div class="cultivo-option-name">${cultivo.nombre}</div>
                <div class="cultivo-option-location">${cultivo.ubicacion || 'Sin ubicación'}</div>
            </div>
        `;
        selector.appendChild(option);
    });
}

function toggleCultivo(id) {
    const index = selectedCultivos.indexOf(id);
    const option = document.querySelector(`.cultivo-option[data-id="${id}"]`);
    const checkbox = option.querySelector('input');

    if (index > -1) {
        selectedCultivos.splice(index, 1);
        option.classList.remove('selected');
        checkbox.checked = false;
    } else {
        if (selectedCultivos.length >= 4) {
            alert('Máximo 4 cultivos para comparar');
            return;
        }
        selectedCultivos.push(id);
        option.classList.add('selected');
        checkbox.checked = true;
    }

    document.getElementById('selected-count').textContent = `${selectedCultivos.length}/4`;
}

function setPeriod(period) {
    currentPeriod = period;
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === period);
    });
    document.getElementById('custom-period').style.display = period === 'custom' ? 'block' : 'none';
}

function toggleCustomPeriod() {
    setPeriod('custom');
}

function resetComparison() {
    selectedCultivos = [];
    document.querySelectorAll('.cultivo-option').forEach(option => {
        option.classList.remove('selected');
        option.querySelector('input').checked = false;
    });
    document.getElementById('selected-count').textContent = '0/4';
    document.getElementById('comparison-results').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';

    if (comparisonChart) comparisonChart.destroy();
    if (radarChart) radarChart.destroy();
}

function dateRange() {
    const end = new Date();
    let start = new Date();
    if (currentPeriod === '24h') start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    else if (currentPeriod === '7d') start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (currentPeriod === '30d') start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    else {
        const customStart = document.getElementById('date-start').value;
        const customEnd = document.getElementById('date-end').value;
        if (customStart && customEnd) {
            return { start: `${customStart}T00:00:00`, end: `${customEnd}T23:59:59` };
        }
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    return { start: start.toISOString(), end: end.toISOString() };
}

function average(rows, field) {
    const values = rows.map(row => row[field]).filter(value => value !== null && value !== undefined);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function scoreFor(data) {
    const ranges = {
        temperatura: [18, 28, 3],
        humedad: [50, 80, 1],
        nivel_agua: [30, 90, 1.5],
        ph: [5.5, 7.5, 10]
    };
    let penalty = 0;
    let measured = 0;
    Object.entries(ranges).forEach(([field, [min, max, weight]]) => {
        const value = data[field];
        if (value === null || value === undefined) return;
        measured += 1;
        if (value < min) penalty += (min - value) * weight;
        if (value > max) penalty += (value - max) * weight;
    });
    if (!measured) return 0;
    return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

async function buildComparisonData() {
    const range = dateRange();
    const results = [];
    for (const id of selectedCultivos) {
        const cultivo = allCultivos.find(item => item.id === id);
        const rows = await apiClient.get(
            `/historicos/?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}&cultivo_id=${id}&limit=5000`
        );
        const data = {
            id,
            nombre: cultivo ? cultivo.nombre : `Cultivo ${id}`,
            temperatura: average(rows, 'temperatura'),
            humedad: average(rows, 'humedad'),
            nivel_agua: average(rows, 'nivel_agua'),
            ph: average(rows, 'ph'),
            muestras: rows.length
        };
        data.score = scoreFor(data);
        results.push(data);
    }
    return results;
}

async function runComparison() {
    if (selectedCultivos.length < 2) {
        alert('Selecciona al menos 2 cultivos para comparar');
        return;
    }

    const metrics = Array.from(document.querySelectorAll('input[name="metric"]:checked')).map(cb => cb.value);
    if (metrics.length === 0) {
        alert('Selecciona al menos una métrica');
        return;
    }

    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('comparison-results').style.display = 'block';
    document.getElementById('comparison-table-body').innerHTML =
        '<tr><td colspan="7"><div class="loading-state"><i class="ph ph-spinner ph-spin"></i><p>Analizando datos...</p></div></td></tr>';

    try {
        const comparisonData = await buildComparisonData();
        renderSummaryCards(comparisonData);
        renderComparisonChart(comparisonData, metrics);
        renderRadarChart(comparisonData);
        renderComparisonTable(comparisonData, metrics);
        renderInsights(comparisonData);
    } catch (error) {
        document.getElementById('comparison-table-body').innerHTML =
            `<tr><td colspan="7">${error.message}</td></tr>`;
        showToast(error.message, 'error');
    }
}

function displayValue(value, suffix) {
    return value === null || value === undefined ? '--' : `${Number(value).toFixed(1)}${suffix || ''}`;
}

function renderSummaryCards(data) {
    const best = data.reduce((max, item) => item.score > max.score ? item : max, data[0]);
    const worst = data.reduce((min, item) => item.score < min.score ? item : min, data[0]);
    const avg = Math.round(data.reduce((sum, item) => sum + item.score, 0) / data.length);
    const scores = data.map(item => item.score);
    const variance = Math.round(Math.max(...scores) - Math.min(...scores));

    document.getElementById('best-crop').textContent = best.nombre;
    document.getElementById('best-crop-score').textContent = `Score: ${best.score}/100`;
    document.getElementById('worst-crop').textContent = worst.nombre;
    document.getElementById('worst-crop-issue').textContent = `Score: ${worst.score}/100`;
    document.getElementById('avg-score').textContent = avg;
    document.getElementById('variance-value').textContent = `${variance} pts`;
}

function renderComparisonChart(data, metrics) {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;

    if (comparisonChart) comparisonChart.destroy();

    const colors = ['#2E7D5B', '#83B99A', '#B7791F', '#3F7D76'];
    const metric = metrics[0] || 'temperatura';
    const labels = data.map(item => item.nombre);
    const values = data.map(item => Number(item[metric] || 0));

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: metric.charAt(0).toUpperCase() + metric.slice(1),
                data: values,
                backgroundColor: colors.map(color => color + '80'),
                borderColor: colors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' }
            },
            scales: {
                y: { beginAtZero: false, grid: { color: '#e2e8f0' } },
                x: { grid: { color: '#e2e8f0' } }
            }
        }
    });
}

function renderRadarChart(data) {
    const ctx = document.getElementById('radarChart');
    if (!ctx) return;

    if (radarChart) radarChart.destroy();

    const colors = ['#2E7D5B', '#83B99A', '#B7791F', '#3F7D76'];
    const metrics = ['temperatura', 'humedad', 'nivel_agua', 'ph'];
    const labels = ['Temperatura', 'Humedad', 'Nivel Agua', 'pH'];

    const datasets = data.map((item, index) => ({
        label: item.nombre,
        data: metrics.map(metric => Number(item[metric] || 0)),
        borderColor: colors[index],
        backgroundColor: colors[index] + '20',
        borderWidth: 2
    }));

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' }
            },
            scales: {
                r: { beginAtZero: true, grid: { color: '#e2e8f0' } }
            }
        }
    });
}

function renderComparisonTable(data, metrics) {
    const tbody = document.getElementById('comparison-table-body');
    tbody.innerHTML = '';

    for (let index = 1; index <= 4; index += 1) {
        const th = document.getElementById(`th-crop-${index}`);
        if (th) {
            th.textContent = data[index - 1] ? data[index - 1].nombre : '--';
            th.style.display = data[index - 1] ? '' : 'none';
        }
    }

    metrics.forEach(metric => {
        const tr = document.createElement('tr');
        const values = data.map(item => item[metric]).filter(value => value !== null && value !== undefined);
        const max = values.length ? Math.max(...values) : null;
        const min = values.length ? Math.min(...values) : null;
        const diff = max !== null && min !== null ? (max - min).toFixed(1) : '--';
        const bestCrop = max !== null
            ? data.find(item => item[metric] === max).nombre
            : '--';

        let cells = `<td><strong>${metric.charAt(0).toUpperCase() + metric.slice(1)}</strong></td>`;
        data.forEach(item => {
            const value = item[metric];
            let cellClass = '';
            if (value !== null && value !== undefined && value === max) cellClass = 'best-value';
            else if (value !== null && value !== undefined && value === min) cellClass = 'worst-value';
            cells += `<td class="${cellClass}">${displayValue(value)}</td>`;
        });
        for (let index = data.length; index < 4; index += 1) {
            cells += '<td>--</td>';
        }
        cells += `<td>${diff}</td><td><strong>${bestCrop}</strong></td>`;

        tr.innerHTML = cells;
        tbody.appendChild(tr);
    });
}

function renderInsights(data) {
    const grid = document.getElementById('insights-grid');
    grid.innerHTML = '';

    const best = data.reduce((max, item) => item.score > max.score ? item : max, data[0]);
    const worst = data.reduce((min, item) => item.score < min.score ? item : min, data[0]);
    const withTemp = data.filter(item => item.temperatura !== null);
    const withHumidity = data.filter(item => item.humedad !== null);
    const avgTemp = withTemp.length
        ? (withTemp.reduce((sum, item) => sum + item.temperatura, 0) / withTemp.length).toFixed(1)
        : '--';
    const avgHum = withHumidity.length
        ? (withHumidity.reduce((sum, item) => sum + item.humedad, 0) / withHumidity.length).toFixed(1)
        : '--';

    const insights = [
        { type: 'success', icon: 'ph-trophy', title: 'Mejor rendimiento', text: `${best.nombre} obtiene el mejor score (${best.score}/100) con ${best.muestras} muestras.` },
        { type: 'warning', icon: 'ph-warning-circle', title: 'Requiere atención', text: `${worst.nombre} obtiene el score más bajo (${worst.score}/100). Revisa sus parámetros.` },
        { type: 'info', icon: 'ph-thermometer', title: 'Temperatura promedio', text: `La temperatura promedio entre cultivos es ${avgTemp}°C.` },
        { type: 'info', icon: 'ph-drop', title: 'Humedad promedio', text: `La humedad promedio es ${avgHum}%.` }
    ];

    insights.forEach(insight => {
        const card = document.createElement('div');
        card.className = `insight-card ${insight.type}`;
        card.innerHTML = `
            <div class="insight-header">
                <i class="ph ${insight.icon}"></i>
                <span class="insight-title">${insight.title}</span>
            </div>
            <p class="insight-text">${insight.text}</p>
        `;
        grid.appendChild(card);
    });
}

function toggleChartType() {
    if (!comparisonChart) return;
    const currentType = comparisonChart.config.type;
    comparisonChart.config.type = currentType === 'bar' ? 'line' : 'bar';
    comparisonChart.update();
}

function exportChart(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `comparacion_${new Date().toISOString().split('T')[0]}.png`;
    link.href = url;
    link.click();
}

function exportTable() {
    const table = document.querySelector('.comparison-table');
    if (!table) return;

    const csv = [];
    table.querySelectorAll('tr').forEach(row => {
        const cols = row.querySelectorAll('th, td');
        const rowData = Array.from(cols).map(col => col.textContent.trim());
        csv.push(rowData.join(','));
    });

    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `comparacion_${new Date().toISOString().split('T')[0]}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('active');
}

document.getElementById('detail-modal').addEventListener('click', (event) => {
    if (event.target.id === 'detail-modal') closeDetailModal();
});
