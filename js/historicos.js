/**
 * AquaPlants - Lógica de Históricos con Chart.js
 */

let tempChart, humidityChart, combinedChart;
let historicalData = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;

    setupUserInterface(user);
    await loadHistoricalData();

    // Mostrar/ocultar rango personalizado
    document.getElementById('range-select').addEventListener('change', (e) => {
        document.getElementById('custom-range').style.display =
            e.target.value === 'custom' ? 'flex' : 'none';
    });
});

function setupUserInterface(user) {
    document.getElementById('user-name').textContent = user.name || user.sub || user.username || 'Usuario';
    document.getElementById('user-role').textContent = user.role || 'Rol';
}

async function loadHistoricalData() {
    const cropId = document.getElementById('crop-select').value;
    const range = document.getElementById('range-select').value;

    let startDate, endDate;
    const now = new Date();

    if (range === '24h') {
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        endDate = now;
    } else if (range === '7d') {
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
    } else if (range === '30d') {
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
    } else if (range === 'custom') {
        startDate = new Date(document.getElementById('date-start').value);
        endDate = new Date(document.getElementById('date-end').value);
    }

    try {
        // Intentar obtener datos del backend
        const endpoint = cropId === 'all'
            ? `/historicos/?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
            : `/historicos/?cultivo_id=${cropId}&start=${startDate.toISOString()}&end=${endDate.toISOString()}`;

        historicalData = await apiClient.get(endpoint);
    } catch (error) {
        historicalData = [];
        if (typeof showToast === 'function') showToast(error.message, 'error');
    }

    updateStatistics();
    updateCharts();
}

function averageField(rows, field) {
    const values = rows.map((row) => Number(row[field])).filter((value) => Number.isFinite(value));
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function updateStatistics() {
    if (!historicalData || historicalData.length === 0) {
        ['avg-temp', 'avg-humidity', 'avg-water'].forEach((id) => {
            const element = document.getElementById(id);
            if (element) element.textContent = '--';
        });
        const total = document.getElementById('total-measurements');
        if (total) total.textContent = '0';
        ['trend-temp', 'trend-humidity', 'trend-water'].forEach((id) => {
            const element = document.getElementById(id);
            if (element) {
                element.className = 'stat-trend';
                element.textContent = 'Sin datos suficientes';
            }
        });
        return;
    }

    const avgTemp = averageField(historicalData, 'temperatura');
    const avgHumidity = averageField(historicalData, 'humedad');
    const avgWater = averageField(historicalData, 'nivel_agua');

    document.getElementById('avg-temp').textContent = `${avgTemp.toFixed(1)} °C`;
    document.getElementById('avg-humidity').textContent = `${avgHumidity.toFixed(1)} %`;
    document.getElementById('avg-water').textContent = `${avgWater.toFixed(1)} %`;
    document.getElementById('total-measurements').textContent = historicalData.length;

    const midpoint = Math.floor(historicalData.length / 2);
    const previous = historicalData.slice(0, midpoint);
    const current = historicalData.slice(midpoint);

    const trendTemp = averageField(current, 'temperatura') - averageField(previous, 'temperatura');
    const trendHumidity = averageField(current, 'humedad') - averageField(previous, 'humedad');
    const trendWater = averageField(current, 'nivel_agua') - averageField(previous, 'nivel_agua');

    updateTrend('trend-temp', trendTemp, '°C');
    updateTrend('trend-humidity', trendHumidity, '%');
    updateTrend('trend-water', trendWater, '%');
}

function updateTrend(elementId, value, unit) {
    const element = document.getElementById(elementId);
    const isUp = value > 0;
    const icon = isUp ? 'ph-trend-up' : 'ph-trend-down';
    const className = isUp ? 'up' : 'down';

    element.className = `stat-trend ${className}`;
    element.innerHTML = `<i class="ph ${icon}"></i> ${isUp ? '+' : ''}${value.toFixed(1)}${unit} vs anterior`;
}

function updateCharts() {
    if (!historicalData || historicalData.length === 0) {
        if (tempChart) { tempChart.destroy(); tempChart = null; }
        if (humidityChart) { humidityChart.destroy(); humidityChart = null; }
        if (combinedChart) { combinedChart.destroy(); combinedChart = null; }
        return;
    }

    const metric = document.getElementById('metric-select').value;

    const tempCanvas = document.getElementById('tempChart');
    const humCanvas = document.getElementById('humidityChart');
    const combinedCanvas = document.getElementById('combinedChart');
    const tempCard = tempCanvas ? tempCanvas.closest('.chart-card') : null;
    const humCard = humCanvas ? humCanvas.closest('.chart-card') : null;
    const combinedCard = combinedCanvas ? combinedCanvas.closest('.chart-card') : null;
    const showTemp = metric === 'temperatura' || metric === 'nivel_agua';
    const showHum = metric === 'humedad' || metric === 'todas';
    const showCombined = metric === 'todas';

    if (tempCard) tempCard.style.display = showTemp ? '' : 'none';
    if (humCard) humCard.style.display = showHum ? '' : 'none';
    if (combinedCard) combinedCard.style.display = showCombined ? '' : 'none';
    if (tempCard && tempCard.parentElement) {
        tempCard.parentElement.classList.toggle('single-chart', !showCombined);
    }

    // Agrupar datos por fecha (promedio diario)
    const groupedData = groupDataByDate(historicalData);
    const labels = Object.keys(groupedData).sort();

    if (metric === 'temperatura' || metric === 'todas') {
        renderLineChart('tempChart', labels, groupedData, 'temperatura', 'Temperatura (°C)', '#2E7D5B');
    }

    if (metric === 'humedad' || metric === 'todas') {
        renderLineChart('humidityChart', labels, groupedData, 'humedad', 'Humedad (%)', '#83B99A');
    }

    if (metric === 'nivel_agua') {
        renderLineChart('tempChart', labels, groupedData, 'nivel_agua', 'Nivel de Agua (%)', '#B7791F');
    }

    if (metric === 'todas') {
        renderCombinedChart(labels, groupedData);
    }
}

function formatDateLabel(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + '/' + match[2] : value;
}

function groupDataByDate(data) {
    const grouped = {};

    data.forEach(d => {
        const date = String(d.fecha_hora || '').slice(0, 10);

        if (!grouped[date]) {
            grouped[date] = { temperatura: [], humedad: [], nivel_agua: [] };
        }

        grouped[date].temperatura.push(d.temperatura);
        grouped[date].humedad.push(d.humedad);
        grouped[date].nivel_agua.push(d.nivel_agua);
    });

    // Calcular promedios
    Object.keys(grouped).forEach(date => {
        grouped[date].temperatura = grouped[date].temperatura.reduce((a, b) => a + b, 0) / grouped[date].temperatura.length;
        grouped[date].humedad = grouped[date].humedad.reduce((a, b) => a + b, 0) / grouped[date].humedad.length;
        grouped[date].nivel_agua = grouped[date].nivel_agua.reduce((a, b) => a + b, 0) / grouped[date].nivel_agua.length;
    });

    return grouped;
}

function renderLineChart(canvasId, labels, data, metric, label, color) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Destruir gráfico anterior si existe
    if (canvasId === 'tempChart' && tempChart) tempChart.destroy();
    if (canvasId === 'humidityChart' && humidityChart) humidityChart.destroy();

    const values = labels.map(l => data[l][metric]);

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(formatDateLabel),
            datasets: [{
                label: label,
                data: values,
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: '#e2e8f0'
                    }
                },
                x: {
                    grid: {
                        color: '#e2e8f0'
                    }
                }
            }
        }
    });

    if (canvasId === 'tempChart') tempChart = chart;
    if (canvasId === 'humidityChart') humidityChart = chart;
}

function renderCombinedChart(labels, data) {
    const ctx = document.getElementById('combinedChart');
    if (!ctx) return;

    if (combinedChart) combinedChart.destroy();

    combinedChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(formatDateLabel),
            datasets: [
                {
                    label: 'Temperatura (°C)',
                    data: labels.map(l => data[l].temperatura),
                borderColor: '#2E7D5B',
                backgroundColor: '#2E7D5B20',
                    borderWidth: 2,
                    tension: 0.4
                },
                {
                    label: 'Humedad (%)',
                    data: labels.map(l => data[l].humedad),
                borderColor: '#83B99A',
                backgroundColor: '#83B99A20',
                    borderWidth: 2,
                    tension: 0.4
                },
                {
                    label: 'Nivel de Agua (%)',
                    data: labels.map(l => data[l].nivel_agua),
                borderColor: '#B7791F',
                backgroundColor: '#B7791F20',
                    borderWidth: 2,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: '#e2e8f0'
                    }
                },
                x: {
                    grid: {
                        color: '#e2e8f0'
                    }
                }
            }
        }
    });
}

function exportChart(chartId) {
    let chart;
    if (chartId === 'tempChart') chart = tempChart;
    else if (chartId === 'humidityChart') chart = humidityChart;
    else if (chartId === 'combinedChart') chart = combinedChart;

    if (!chart) return;

    const url = chart.toBase64Image();
    const link = document.createElement('a');
    link.download = `${chartId}_${new Date().toISOString().split('T')[0]}.png`;
    link.href = url;
    link.click();
}