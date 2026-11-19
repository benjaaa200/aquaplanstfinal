/**
 * AquaPlants - Lógica de Control de Riego
 */

let zones = [];
let history = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;

    setupUserInterface(user);
    await loadZones();
    await loadHistory();
});

function setupUserInterface(user) {
    document.getElementById('user-name').textContent = user.name || user.sub || user.username || 'Usuario';
    document.getElementById('user-role').textContent = user.role || 'Rol';
    
    const roleIndicator = document.getElementById('role-indicator');
    if (user.role === 'encargado') {
        roleIndicator.textContent = 'Control manual de riego en tus cultivos';
    } else {
        roleIndicator.textContent = 'Gestión completa de ciclos de riego';
    }
}

async function loadZones() {
    const grid = document.getElementById('zones-grid');
    grid.innerHTML = '<div class="loading-state"><i class="ph ph-spinner ph-spin"></i><p>Cargando zonas...</p></div>';

    try {
        zones = await apiClient.get('/riego/zonas');
        renderZones(zones);
        updateSummaryCards();
        populateZoneSelect();
    } catch (error) {
        console.error('Error cargando zonas:', error);
        zones = [];
        grid.textContent = `No se pudieron cargar las zonas: ${error.message}`;
        updateSummaryCards();
        populateZoneSelect();
    }
}

function renderZones(zonesList) {
    const grid = document.getElementById('zones-grid');
    grid.innerHTML = '';

    if (!zonesList.length) {
        grid.textContent = 'No hay cultivos disponibles para configurar como zonas de riego.';
        return;
    }

    zonesList.forEach(zone => {
        const card = document.createElement('div');
        card.className = `zone-card ${zone.activa ? 'active' : ''}`;
        const lastWatering = zone.ultimo_riego
            ? new Date(zone.ultimo_riego).toLocaleString('es-CL')
            : 'Sin riegos registrados';
        const efficiency = Number.isFinite(zone.eficiencia)
            ? `${zone.eficiencia}%`
            : 'Sin datos';
        const scheduledDuration = Number.isFinite(zone.duracion_programada)
            ? `${zone.duracion_programada} min`
            : 'Sin programación';

        card.innerHTML = `
            <div class="zone-header">
                <div class="zone-name">${escapeHtml(zone.nombre)}</div>
                <label class="zone-toggle">
                    <input type="checkbox" ${zone.activa ? 'checked' : ''} onchange="toggleZone(${zone.id}, this.checked)">
                    <span class="zone-toggle-slider"></span>
                </label>
            </div>
            <div class="zone-info">
                <div class="zone-info-row">
                    <span>Cultivo:</span>
                    <span>${escapeHtml(zone.cultivo_nombre)}</span>
                </div>
                <div class="zone-info-row">
                    <span>Último riego:</span>
                    <span>${escapeHtml(lastWatering)}</span>
                </div>
                <div class="zone-info-row">
                    <span>Duración:</span>
                    <span>${scheduledDuration}</span>
                </div>
                <div class="zone-info-row">
                    <span>Eficiencia:</span>
                    <span>${escapeHtml(efficiency)}</span>
                </div>
            </div>
            <div class="zone-progress">
                <div class="zone-progress-label">
                    <span>Consumo registrado hoy</span>
                    <span>${Number(zone.consumo_hoy || 0)} L</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function updateSummaryCards() {
    const active = zones.filter(z => z.activa).length;
    const scheduled = zones.reduce((sum, zone) => sum + (zone.ciclos_programados || 0), 0);
    const totalConsumo = zones.reduce((sum, zone) => sum + Number(zone.consumo_hoy || 0), 0);
    const efficiencies = zones.map(zone => zone.eficiencia).filter(Number.isFinite);
    const avgEficiencia = efficiencies.length
        ? `${Math.round(efficiencies.reduce((sum, value) => sum + value, 0) / efficiencies.length)} %`
        : 'Sin datos';

    document.getElementById('active-zones').textContent = active;
    document.getElementById('scheduled-cycles').textContent = scheduled;
    document.getElementById('water-usage').textContent = `${totalConsumo.toFixed(2)} L`;
    document.getElementById('efficiency').textContent = avgEficiencia;
}

function populateZoneSelect() {
    const select = document.getElementById('zone-select');
    select.innerHTML = '<option value="">Seleccionar zona...</option>';
    zones.forEach(z => {
        select.innerHTML += `<option value="${z.id}">${z.nombre}</option>`;
    });
}

async function toggleZone(zoneId, isActive) {
    try {
        await apiClient.put(`/riego/zonas/${zoneId}`, { activa: isActive });
        const zone = zones.find(z => z.id === zoneId);
        if (zone) {
            zone.activa = isActive;
            updateSummaryCards();
        }
    } catch (error) {
        console.error('Error actualizando zona:', error);
        alert(`No se pudo cambiar el estado de la zona: ${error.message}`);
        await loadZones();
    }
}

async function loadHistory() {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Cargando historial...</td></tr>';

    try {
        history = await apiClient.get('/riego/historial');
        renderHistory(history);
    } catch (error) {
        console.error('Error cargando historial:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="loading-row">No se pudo cargar el historial: ${escapeHtml(error.message)}</td></tr>`;
    }
}

function renderHistory(historyList) {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';

    if (!historyList || historyList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No hay historial de riegos</td></tr>';
        return;
    }

    historyList.forEach(h => {
        const tr = document.createElement('tr');
        const fecha = h.fecha
            ? new Date(h.fecha).toLocaleString('es-CL', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            })
            : 'Sin fecha';
        const allowedStatuses = ['completado', 'en_progreso', 'programado', 'cancelado'];
        const normalizedStatus = allowedStatuses.includes(h.estado) ? h.estado : 'desconocido';
        const statusClass = `status-${normalizedStatus}`;
        const statusLabels = {
            completado: 'Completado',
            en_progreso: 'En progreso',
            programado: 'Programado',
            cancelado: 'Cancelado',
            desconocido: 'Desconocido'
        };
        const type = String(h.tipo || 'manual');

        tr.innerHTML = `
            <td>${fecha}</td>
            <td><strong>${escapeHtml(h.zona)}</strong></td>
            <td>${h.duracion ?? '—'} min</td>
            <td>${h.consumo ?? '—'} L</td>
            <td>${escapeHtml(type.charAt(0).toUpperCase() + type.slice(1))}</td>
            <td><span class="status-badge ${statusClass}">${statusLabels[normalizedStatus]}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function openScheduleModal() {
    document.getElementById('schedule-modal').classList.add('active');
}

function closeScheduleModal() {
    document.getElementById('schedule-modal').classList.remove('active');
    document.getElementById('schedule-form').reset();
}

async function handleScheduleCycle(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Programando...';
    submitBtn.disabled = true;

    const schedule = {
        zona_id: parseInt(form.zona_id.value),
        hora_inicio: form.hora_inicio.value,
        duracion: parseInt(form.duracion.value),
        frecuencia: form.frecuencia.value
    };

    try {
        const result = await apiClient.post('/riego/programar', schedule);
        closeScheduleModal();
        alert(result.message);
        await Promise.all([loadZones(), loadHistory()]);
    } catch (error) {
        alert('Error al programar: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

document.getElementById('schedule-modal').addEventListener('click', (e) => {
    if (e.target.id === 'schedule-modal') closeScheduleModal();
});