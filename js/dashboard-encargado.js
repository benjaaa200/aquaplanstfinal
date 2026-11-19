/* =========================================================
   AquaPlants · Dashboard Encargado
   HU-02: Estado actual de cultivos asignados
   HU-03: Alertas activas
   HU-05: Estado de dispositivos
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const user = AquaAuth.requireAuth(['encargado']);
  if (!user) return;
  cargarDashboard(user);
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function formatDate(value) {
  if (!value) return 'Sin datos';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin datos';
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

async function cargarDashboard(user) {
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userRole').textContent = 'Encargado';
  document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('welcomeName').textContent = user.name.split(' ')[0];

  try {
    const [kpis, alertas, cultivos, mediciones, dispositivos] = await Promise.all([
      apiClient.get('/dashboard/kpis'),
      apiClient.get('/alertas/'),
      apiClient.get('/cultivos/'),
      apiClient.get('/mediciones/?limit=200'),
      apiClient.get('/dispositivos/')
    ]);

    cargarKPIs(kpis);
    cargarAlertas(alertas.filter((alerta) => !alerta.resuelta));
    cargarCultivos(cultivos, mediciones);
    cargarDispositivos(dispositivos);

    if (cultivos.length === 0) {
      document.getElementById('cultivosList').innerHTML =
        '<p style="color:var(--ink-500);text-align:center;padding:20px;">No tienes cultivos asignados. Contacta al administrador.</p>';
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function cargarKPIs(kpis) {
  const nivel = Number(kpis.avg_water || 0);
  const alertas = Number(kpis.active_alerts || 0);
  const kpiGrid = document.getElementById('kpiGrid');
  kpiGrid.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon cyan">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
      </div>
      <div>
        <div class="kpi-label">Temperatura promedio</div>
        <div class="kpi-value">${kpis.avg_temp}°C</div>
        <div class="kpi-trend up">Últimas mediciones</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon green">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6M12 18v4M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M18 12h4M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/></svg>
      </div>
      <div>
        <div class="kpi-label">Humedad promedio</div>
        <div class="kpi-value">${kpis.avg_humidity}%</div>
        <div class="kpi-trend up">Últimas mediciones</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon cyan">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
      </div>
      <div>
        <div class="kpi-label">Nivel de agua promedio</div>
        <div class="kpi-value">${kpis.avg_water}%</div>
        <div class="kpi-trend ${nivel < 20 ? 'down' : 'up'}">${nivel < 20 ? 'Nivel bajo' : 'Nivel normal'}</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon ${alertas > 0 ? 'red' : 'green'}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </div>
      <div>
        <div class="kpi-label">Alertas activas</div>
        <div class="kpi-value">${alertas}</div>
        <div class="kpi-trend ${alertas > 0 ? 'down' : 'up'}">${alertas > 0 ? 'Requieren atención' : 'Todo en orden'}</div>
      </div>
    </div>
  `;
}

function cargarAlertas(alertas) {
  const alertasCard = document.getElementById('alertasCard');
  const alertasList = document.getElementById('alertasList');
  const alertBadge = document.getElementById('nav-alert-badge');
  const notifDot = document.getElementById('notifDot');

  if (alertas.length === 0) {
    alertasCard.style.display = 'none';
    if (alertBadge) alertBadge.style.display = 'none';
    if (notifDot) notifDot.style.display = 'none';
    return;
  }

  alertasCard.style.display = 'block';
  if (alertBadge) {
    alertBadge.textContent = alertas.length;
    alertBadge.style.display = 'inline';
  }
  if (notifDot) notifDot.style.display = 'block';

  alertasList.innerHTML = alertas.map((alerta) => {
    const nivelClass = alerta.severidad === 'critical' ? 'danger' : 'warning';
    const nivelText = alerta.severidad === 'critical' ? 'Crítica' : 'Advertencia';
    return `
      <div class="alert ${nivelClass}">
        <div style="flex:1;">
          <strong>${escapeHtml(alerta.mensaje)}</strong>
          <div style="font-size:12px;margin-top:4px;">Cultivo: ${escapeHtml(alerta.cultivo_nombre || '-')}</div>
          <div style="font-size:11px;margin-top:6px;opacity:.7;">${formatDate(alerta.fecha_hora)}</div>
        </div>
        <span class="badge ${nivelClass}"><span class="dot"></span>${nivelText}</span>
      </div>
    `;
  }).join('');
}

function cargarCultivos(cultivos, mediciones) {
  const cultivosList = document.getElementById('cultivosList');
  if (!cultivos.length) {
    cultivosList.innerHTML = '<p style="color:var(--ink-500);text-align:center;padding:20px;">No hay cultivos registrados</p>';
    return;
  }

  const latestByCrop = new Map();
  mediciones.forEach((medicion) => {
    if (!latestByCrop.has(medicion.cultivo_id)) {
      latestByCrop.set(medicion.cultivo_id, medicion);
    }
  });

  cultivosList.innerHTML = cultivos.map((cultivo) => {
    const medicion = latestByCrop.get(cultivo.id) || {};
    const nivel = Number(medicion.nivel_agua ?? 0);
    return `
      <div style="padding:16px;border:1px solid var(--ink-100);border-radius:10px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--ink-900);">${escapeHtml(cultivo.nombre)}</div>
            <div style="font-size:12px;color:var(--ink-500);">${escapeHtml(cultivo.ubicacion || 'Sin ubicación')} · ${escapeHtml(cultivo.estado)}</div>
          </div>
          <span class="badge success"><span class="dot"></span>${escapeHtml(cultivo.estado)}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
          <div style="background:var(--ink-50);padding:12px;border-radius:8px;">
            <div style="font-size:11px;color:var(--ink-500);text-transform:uppercase;">Temperatura</div>
            <div style="font-size:20px;font-weight:700;color:var(--ink-900);">${medicion.temperatura !== undefined ? medicion.temperatura + '°C' : '--'}</div>
          </div>
          <div style="background:var(--ink-50);padding:12px;border-radius:8px;">
            <div style="font-size:11px;color:var(--ink-500);text-transform:uppercase;">Humedad</div>
            <div style="font-size:20px;font-weight:700;color:var(--ink-900);">${medicion.humedad !== undefined ? medicion.humedad + '%' : '--'}</div>
          </div>
          <div style="background:var(--ink-50);padding:12px;border-radius:8px;">
            <div style="font-size:11px;color:var(--ink-500);text-transform:uppercase;">Nivel agua</div>
            <div style="font-size:20px;font-weight:700;color:${nivel < 20 ? 'var(--danger)' : 'var(--ink-900)'};">${medicion.nivel_agua !== undefined ? medicion.nivel_agua + '%' : '--'}</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--ink-500);margin-top:10px;">Última lectura: ${formatDate(medicion.fecha_hora)}</div>
      </div>
    `;
  }).join('');
}

function cargarDispositivos(dispositivos) {
  const tbody = document.getElementById('dispositivosBody');
  if (!dispositivos.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ink-500);padding:20px;">No hay dispositivos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = dispositivos.map((dispositivo) => {
    const activo = dispositivo.estado === 'activo';
    return `
      <tr>
        <td><strong>${escapeHtml(dispositivo.nombre)}</strong></td>
        <td>${escapeHtml(dispositivo.instalacion_nombre || '-')}</td>
        <td><span class="badge ${activo ? 'success' : 'danger'}"><span class="dot"></span>${activo ? 'Activo' : 'Sin conexión'}</span></td>
        <td>${formatDate(dispositivo.ultimaconexion)}</td>
      </tr>
    `;
  }).join('');
}
