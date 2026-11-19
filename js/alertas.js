/**
 * AquaPlants - Alert center backed by persisted API state.
 */

let allAlerts = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;

    setupUserInterface(user);
    await loadAlerts();
});

function setupUserInterface(user) {
    document.getElementById('user-name').textContent =
        user.name || user.sub || user.username || 'Usuario';
    document.getElementById('user-role').textContent = user.role || 'Rol';
}

async function loadAlerts() {
    const alertsList = document.getElementById('alerts-list');
    alertsList.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'loading-state';
    loading.textContent = 'Cargando alertas del sistema…';
    alertsList.appendChild(loading);

    try {
        allAlerts = await apiClient.get('/alertas/');
        renderAlerts(
            allAlerts.filter(alert => !alert.resuelta),
            allAlerts.filter(alert => alert.resuelta),
            'all'
        );
        updateSummaryCards(allAlerts);
        updateNavBadge(allAlerts);
    } catch (error) {
        console.error('Error al cargar alertas:', error);
        alertsList.replaceChildren();
        const errorMessage = document.createElement('div');
        errorMessage.className = 'empty-state';
        errorMessage.setAttribute('role', 'alert');
        errorMessage.textContent = `No se pudieron cargar las alertas: ${error.message}`;
        alertsList.appendChild(errorMessage);
    }
}

function normalizedSeverity(alert) {
    return alert.severidad === 'danger' ? 'critical' : alert.severidad;
}

let archiveExpanded = true;

function renderAlerts(activeAlerts, resolvedAlerts, statusFilter) {
    const alertsList = document.getElementById('alerts-list');
    alertsList.replaceChildren();
    const active = activeAlerts || [];

    if (active.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        let emptyText;
        if (statusFilter === 'resolved') {
            emptyText = 'Las alertas resueltas se guardan en el historial de abajo.';
        } else if (allAlerts.length) {
            emptyText = 'No hay alertas que coincidan con los filtros seleccionados.';
        } else {
            emptyText = 'No hay alertas registradas.';
        }
        emptyState.textContent = emptyText;
        alertsList.appendChild(emptyState);
    } else {
        active.forEach(alert => alertsList.appendChild(createAlertElement(alert)));
    }

    renderResolvedArchive(resolvedAlerts || [], statusFilter);
}

function renderResolvedArchive(resolvedAlerts, statusFilter) {
    const archive = document.getElementById('resolved-archive');
    const list = document.getElementById('resolved-alerts-list');
    const count = document.getElementById('resolved-archive-count');
    list.replaceChildren();
    count.textContent = String(resolvedAlerts.length);

    if (!resolvedAlerts.length) {
        archive.hidden = true;
        return;
    }

    archive.hidden = false;
    resolvedAlerts.forEach(alert => list.appendChild(createAlertElement(alert)));
    setArchiveExpanded(statusFilter === 'resolved' ? true : archiveExpanded);
}

function setArchiveExpanded(expanded) {
    archiveExpanded = expanded;
    const body = document.getElementById('archive-body');
    const toggle = document.getElementById('archive-toggle');
    const caret = document.getElementById('archive-caret');
    if (!body) return;
    body.hidden = !expanded;
    if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
    if (caret) {
        caret.className = `ph ${expanded ? 'ph-caret-up' : 'ph-caret-down'}`;
    }
}

function toggleArchive() {
    setArchiveExpanded(!archiveExpanded);
}

function focusResolvedArchive() {
    const archive = document.getElementById('resolved-archive');
    if (!archive || archive.hidden) {
        showToast('Aún no hay alertas resueltas.', 'info');
        return;
    }
    setArchiveExpanded(true);
    archive.scrollIntoView({ behavior: 'smooth', block: 'start' });
    archive.classList.add('flash');
    setTimeout(() => archive.classList.remove('flash'), 900);
}

function createAlertElement(alert) {
    const severity = normalizedSeverity(alert);
    const typeLabels = {
        temperatura: 'Temperatura',
        humedad: 'Humedad',
        nivel_agua: 'Nivel de agua'
    };
    const severityIcons = {
        critical: 'ph-warning-octagon',
        warning: 'ph-warning',
        info: 'ph-info'
    };
    const typeIcons = {
        temperatura: 'ph-thermometer',
        humedad: 'ph-drop',
        nivel_agua: 'ph-wave-sine'
    };
    const item = document.createElement('article');
    item.className = `alert-item${!alert.leida && !alert.resuelta ? ' unread' : ''}${alert.resuelta ? ' is-resolved' : ''}`;
    item.dataset.id = String(alert.id);

    const severityIcon = document.createElement('div');
    severityIcon.className = `alert-severity ${severityIcons[severity] ? severity : 'info'}`;
    const icon = document.createElement('i');
    icon.className = `ph ${severityIcons[severity] || severityIcons.info}`;
    severityIcon.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'alert-content';
    const header = document.createElement('div');
    header.className = 'alert-header';
    const title = document.createElement('span');
    title.className = 'alert-title';
    title.textContent = alert.cultivo_nombre ||
        `Alerta de ${(typeLabels[alert.tipo] || alert.tipo || 'sensor').toLowerCase()}`;
    const relativeTime = document.createElement('span');
    relativeTime.className = 'alert-time';
    relativeTime.textContent = getTimeAgo(new Date(alert.fecha_hora));
    header.append(title, relativeTime);

    const message = document.createElement('p');
    message.className = 'alert-message';
    message.textContent = alert.mensaje;
    const meta = document.createElement('div');
    meta.className = 'alert-meta';
    const typeMeta = document.createElement('span');
    const typeIcon = document.createElement('i');
    typeIcon.className = `ph ${typeIcons[alert.tipo] || 'ph-cpu'}`;
    typeMeta.append(typeIcon, document.createTextNode(
        typeLabels[alert.tipo] || alert.tipo || 'Sensor'
    ));
    const dateMeta = document.createElement('span');
    const clockIcon = document.createElement('i');
    clockIcon.className = 'ph ph-clock';
    const date = new Date(alert.fecha_hora);
    dateMeta.append(
        clockIcon,
        document.createTextNode(
            Number.isNaN(date.getTime()) ? 'Fecha desconocida' : date.toLocaleString('es-CL')
        )
    );
    meta.append(typeMeta, dateMeta);
    if (alert.resuelta) {
        const resolvedMeta = document.createElement('span');
        resolvedMeta.className = 'alert-resolved-meta';
        const checkIcon = document.createElement('i');
        checkIcon.className = 'ph ph-check-circle';
        const resolvedDate = alert.fecha_resolucion ? new Date(alert.fecha_resolucion) : null;
        const resolvedText = resolvedDate && !Number.isNaN(resolvedDate.getTime())
            ? `Resuelta el ${resolvedDate.toLocaleString('es-CL')}`
            : 'Resuelta';
        resolvedMeta.append(checkIcon, document.createTextNode(resolvedText));
        meta.appendChild(resolvedMeta);
    }
    content.append(header, message, meta);

    const actions = document.createElement('div');
    actions.className = 'alert-actions';
    if (alert.resuelta) {
        const resolvedLabel = document.createElement('span');
        resolvedLabel.className = 'archive-badge';
        const badgeIcon = document.createElement('i');
        badgeIcon.className = 'ph ph-check-circle';
        resolvedLabel.append(badgeIcon, document.createTextNode('Resuelta'));
        actions.appendChild(resolvedLabel);
    } else {
        if (!alert.leida) {
            actions.appendChild(createActionButton(
                'Marcar leída',
                'mark-read',
                () => markAsRead(alert.id)
            ));
        }
        actions.appendChild(createActionButton(
            'Resolver',
            'resolve',
            () => resolveAlert(alert.id)
        ));
    }

    item.append(severityIcon, content, actions);
    return item;
}

function createActionButton(label, className, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn-action ${className}`;
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
}

function getTimeAgo(date) {
    if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return 'Hace unos segundos';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours}h`;
    return `Hace ${Math.floor(hours / 24)}d`;
}

function updateSummaryCards(alerts) {
    const unresolved = alerts.filter(alert => !alert.resuelta);
    document.getElementById('critical-count').textContent =
        unresolved.filter(alert => normalizedSeverity(alert) === 'critical').length;
    document.getElementById('warning-count').textContent =
        unresolved.filter(alert => normalizedSeverity(alert) === 'warning').length;
    document.getElementById('info-count').textContent =
        unresolved.filter(alert => normalizedSeverity(alert) === 'info').length;
    document.getElementById('resolved-count').textContent =
        alerts.filter(alert => alert.resuelta).length;
}

function updateNavBadge(alerts) {
    const unreadCount = alerts.filter(alert => !alert.leida && !alert.resuelta).length;
    const badge = document.getElementById('nav-alert-badge');
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
}

function applyFilters() {
    const severity = document.getElementById('filter-severity').value;
    const type = document.getElementById('filter-type').value;
    const status = document.getElementById('filter-status').value;

    let filtered = [...allAlerts];
    if (severity !== 'all') {
        filtered = filtered.filter(alert => normalizedSeverity(alert) === severity);
    }
    if (type !== 'all') {
        filtered = filtered.filter(alert => alert.tipo === type);
    }

    let active = filtered.filter(alert => !alert.resuelta);
    const resolved = filtered.filter(alert => alert.resuelta);
    if (status === 'unread') {
        active = active.filter(alert => !alert.leida);
    } else if (status === 'read') {
        active = active.filter(alert => alert.leida);
    } else if (status === 'resolved') {
        active = [];
    }
    renderAlerts(active, resolved, status);
}

async function updateAlert(alertId, endpoint, successMessage) {
    try {
        await apiClient.put(endpoint, {});
        showToast(successMessage, 'success');
        await loadAlerts();
        applyFilters();
    } catch (error) {
        console.error(`Error al actualizar la alerta ${alertId}:`, error);
        showToast(`No se pudo actualizar la alerta: ${error.message}`, 'error');
    }
}

function markAsRead(alertId) {
    return updateAlert(alertId, `/alertas/${alertId}/leer`, 'Alerta marcada como leída.');
}

async function resolveAlert(alertId) {
    const item = document.querySelector(`.alert-item[data-id="${alertId}"]`);
    if (item) {
        item.classList.add('leaving');
        await new Promise(resolve => setTimeout(resolve, 220));
    }
    return updateAlert(
        alertId,
        `/alertas/${alertId}/resolver`,
        'Alerta movida al historial de resueltas.'
    );
}

async function markAllAsRead() {
    const unreadCount = allAlerts.filter(alert => !alert.leida && !alert.resuelta).length;
    if (unreadCount === 0) {
        showToast('No hay alertas sin leer.', 'info');
        return;
    }
    if (!confirm('¿Marcar todas las alertas visibles para tu usuario como leídas?')) return;

    try {
        const result = await apiClient.put('/alertas/marcar-todas', {});
        showToast(result.message, 'success');
        await loadAlerts();
        applyFilters();
    } catch (error) {
        console.error('Error al marcar todas las alertas:', error);
        showToast(`No se pudieron marcar las alertas: ${error.message}`, 'error');
    }
}

window.applyFilters = applyFilters;
window.markAsRead = markAsRead;
window.resolveAlert = resolveAlert;
window.markAllAsRead = markAllAsRead;
window.toggleArchive = toggleArchive;
window.focusResolvedArchive = focusResolvedArchive;
