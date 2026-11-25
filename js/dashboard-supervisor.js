/* =========================================================
   AquaPlants · Dashboard Supervisor
   HU-09: Panel general de todas las instalaciones
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const user = AquaAuth.requireAuth(['supervisor']);
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
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin registro';
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

async function cargarDashboard(user) {
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userRole').textContent = 'Supervisor';
  document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('welcomeName').textContent = user.name.split(' ')[0];

  try {
    const [kpis, alertas, instalaciones, cultivos, dispositivos] = await Promise.all([
      apiClient.get('/dashboard/kpis'),
      apiClient.get('/alertas/'),
      apiClient.get('/instalaciones/'),
      apiClient.get('/cultivos/'),
      apiClient.get('/dispositivos/')
    ]);

    const pendientes = alertas.filter((alerta) => !alerta.resuelta);
    cargarKPIs(kpis, instalaciones, cultivos, dispositivos, pendientes);
    cargarAlertas(pendientes);
    cargarInstalaciones(instalaciones);
    cargarDispositivosSinConexion(dispositivos);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function cargarKPIs(kpis, instalaciones, cultivos, dispositivos, alertas) {
  const instalacionesActivas = instalaciones.filter((instalacion) => instalacion.activa).length;
  const cultivosActivos = cultivos.filter((cultivo) => cultivo.estado === 'activo').length;
  const desconectados = dispositivos.filter((dispositivo) => dispositivo.estado !== 'activo').length;
  const kpiGrid = document.getElementById('kpiGrid');

  kpiGrid.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon cyan">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </div>
      <div>
        <div class="kpi-label">Instalaciones activas</div>
        <div class="kpi-value">${instalacionesActivas}</div>
        <div class="kpi-trend up">de ${instalaciones.length} totales</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon green">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      </div>
      <div>
        <div class="kpi-label">Cultivos activos</div>
        <div class="kpi-value">${cultivosActivos}</div>
        <div class="kpi-trend up">Temperatura media ${kpis.avg_temp}°C</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon ${alertas.length > 0 ? 'red' : 'green'}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </div>
      <div>
        <div class="kpi-label">Alertas activas</div>
        <div class="kpi-value">${alertas.length}</div>
        <div class="kpi-trend ${alertas.length > 0 ? 'down' : 'up'}">${alertas.length > 0 ? 'Requieren atención' : 'Todo en orden'}</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon ${desconectados > 0 ? 'amber' : 'green'}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      </div>
      <div>
        <div class="kpi-label">Dispositivos sin conexión</div>
        <div class="kpi-value">${desconectados}</div>
        <div class="kpi-trend ${desconectados > 0 ? 'down' : 'up'}">de ${dispositivos.length} totales</div>
      </div>
    </div>
  `;
}

function cargarAlertas(alertas) {
  const alertasCard = document.getElementById('alertasCard');
  const alertasList = document.getElementById('alertasList');
  const alertBadge = document.getElementById('nav-alert-badge');

  if (alertas.length === 0) {
    alertasCard.style.display = 'none';
    if (alertBadge) alertBadge.style.display = 'none';
    return;
  }

  alertasCard.style.display = 'block';
  if (alertBadge) {
    alertBadge.textContent = alertas.length;
    alertBadge.style.display = 'inline';
  }
  alertasList.innerHTML = alertas.slice(0, 5).map((alerta) => {
    const nivelClass = alerta.severidad === 'critical' ? 'danger' : 'warning';
    const nivelText = alerta.severidad === 'critical' ? 'Crítica' : 'Advertencia';
    return `
      <div class="alert-item ${nivelClass}">
        <div class="alert-content">
          <div class="alert-title">${escapeHtml(alerta.mensaje)}</div>
          <div class="alert-meta">Cultivo: ${escapeHtml(alerta.cultivo_nombre || '-')}</div>
          <div class="alert-time">${formatDate(alerta.fecha_hora)}</div>
        </div>
        <span class="badge ${nivelClass}"><span class="dot"></span>${nivelText}</span>
      </div>
    `;
  }).join('');
}

function cargarInstalaciones(instalaciones) {
  const instalacionesList = document.getElementById('instalacionesList');
  if (!instalaciones.length) {
    instalacionesList.innerHTML = '<p style="color:var(--ink-500);text-align:center;padding:20px;">No hay instalaciones registradas.</p>';
    return;
  }

  instalacionesList.innerHTML = instalaciones.map((instalacion) => {
    const activa = Boolean(instalacion.activa);
    return `
      <div class="instalacion-card">
        <div class="instalacion-header">
          <div>
            <h3>${escapeHtml(instalacion.nombre)}</h3>
            <div class="meta">${escapeHtml(instalacion.ubicacion || 'Sin ubicación')} · ${instalacion.cultivos_count} cultivos · ${instalacion.dispositivos_count} dispositivos</div>
          </div>
          <span class="badge ${activa ? 'success' : 'danger'}"><span class="dot"></span>${activa ? 'Activa' : 'Inactiva'}</span>
        </div>
        <div class="instalacion-stats">
          <div class="stat">
            <div class="stat-label">Cultivos</div>
            <div class="stat-value">${instalacion.cultivos_count}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Dispositivos</div>
            <div class="stat-value">${instalacion.dispositivos_count}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Alertas</div>
            <div class="stat-value ${instalacion.alertas_count > 0 ? 'warning' : ''}">${instalacion.alertas_count}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function cargarDispositivosSinConexion(dispositivos) {
  const desconectados = dispositivos.filter((dispositivo) => dispositivo.estado !== 'activo');
  const dispositivosCard = document.getElementById('dispositivosCard');
  const tbody = document.getElementById('dispositivosBody');

  if (desconectados.length === 0) {
    dispositivosCard.style.display = 'none';
    return;
  }

  dispositivosCard.style.display = 'block';
  tbody.innerHTML = desconectados.map((dispositivo) => {
    const ultima = dispositivo.ultimaconexion ? new Date(dispositivo.ultimaconexion) : null;
    const ahora = new Date();
    const diffHoras = ultima ? Math.floor((ahora - ultima) / (1000 * 60 * 60)) : null;
    const tiempo = diffHoras === null ? 'Sin registro' : `${diffHoras} h`;
    return `
      <tr>
        <td><strong>${escapeHtml(dispositivo.nombre)}</strong></td>
        <td>${escapeHtml(dispositivo.instalacion_nombre || '-')}</td>
        <td>${formatDate(dispositivo.ultimaconexion)}</td>
        <td><span class="badge danger">${tiempo}</span></td>
      </tr>
    `;
  }).join('');
}
