const API_BASE_URL = window.AQUAPLANTS_API_BASE || '';

const VARIABLE_LABELS = {
    temperatura: 'Temperatura',
    humedad: 'Humedad',
    nivel_agua: 'Nivel de agua',
    ph: 'pH',
    conductividad: 'Conductividad'
};

let umbrales = [];
let instalaciones = [];
let cultivos = [];

const tableBody = document.getElementById('umbralesTableBody');
const form = document.getElementById('umbralForm');
const modal = document.getElementById('umbralModal');
const filterVariable = document.getElementById('filterVariable');

document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    const role = String((user && user.role) || '').toLowerCase();
    if (!user || !['admin', 'administrador'].includes(role)) {
        alert('Acceso denegado. Solo administradores.');
        window.location.href = '../index.html';
        return;
    }

    filterVariable.addEventListener('change', renderTable);
    form.addEventListener('submit', saveUmbral);
    loadData();
});

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: { ...getAuthHeaders(), ...options.headers }
    });

    if (!response.ok) {
        let detail = `Error HTTP ${response.status}`;
        try {
            const body = await response.json();
            detail = body.detail || detail;
        } catch (error) {
            console.error('No se pudo leer el error de la API:', error);
        }
        throw new Error(detail);
    }

    return response.status === 204 ? null : response.json();
}

async function loadData() {
    try {
        [umbrales, instalaciones, cultivos] = await Promise.all([
            apiRequest('/api/umbrales/'),
            apiRequest('/api/instalaciones/'),
            apiRequest('/api/cultivos/')
        ]);
        populateScopeSelects();
        renderTable();
    } catch (error) {
        tableBody.replaceChildren();
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'loading-row';
        cell.textContent = error.message;
        row.appendChild(cell);
        tableBody.appendChild(row);
        showToast(error.message, 'error');
    }
}

function populateScopeSelects() {
    const instalacionSelect = document.getElementById('instalacionId');
    const cultivoSelect = document.getElementById('cultivoId');
    instalacionSelect.replaceChildren(new Option('Global', ''));
    cultivoSelect.replaceChildren(new Option('Todos', ''));
    instalaciones.forEach((instalacion) => {
        instalacionSelect.appendChild(new Option(instalacion.nombre, instalacion.id));
    });
    cultivos.forEach((cultivo) => {
        cultivoSelect.appendChild(new Option(cultivo.nombre, cultivo.id));
    });
}

function formatRange(umbral) {
    const min = umbral.valor_minimo;
    const max = umbral.valor_maximo;
    const unit = umbral.unidad ? ` ${umbral.unidad}` : '';
    if (min !== null && min !== undefined && max !== null && max !== undefined) {
        return `${min} - ${max}${unit}`;
    }
    if (min !== null && min !== undefined) return `>= ${min}${unit}`;
    if (max !== null && max !== undefined) return `<= ${max}${unit}`;
    return 'Sin rango';
}

function scopeLabel(umbral) {
    if (umbral.cultivo_nombre) return `Cultivo: ${umbral.cultivo_nombre}`;
    if (umbral.instalacion_nombre) return `Instalación: ${umbral.instalacion_nombre}`;
    return 'Global';
}

function renderTable() {
    const filter = filterVariable.value;
    const visible = umbrales.filter((umbral) => !filter || umbral.variable === filter);
    tableBody.replaceChildren();

    if (visible.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'loading-row';
        cell.textContent = 'No hay umbrales configurados.';
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }

    visible.forEach((umbral) => {
        const row = document.createElement('tr');

        appendCell(row, VARIABLE_LABELS[umbral.variable] || umbral.variable);
        appendCell(row, umbral.nombre);
        appendCell(row, formatRange(umbral));
        appendCell(row, scopeLabel(umbral));

        const statusCell = document.createElement('td');
        const status = document.createElement('span');
        status.className = `status-badge ${umbral.activo ? 'status-activo' : 'status-inactivo'}`;
        status.textContent = umbral.activo ? 'Activo' : 'Inactivo';
        statusCell.appendChild(status);
        row.appendChild(statusCell);

        const actions = document.createElement('td');
        actions.className = 'table-actions';
        actions.appendChild(actionButton('Editar', 'ph-pencil-simple', () => openUmbralModal(umbral.id)));
        actions.appendChild(actionButton('Eliminar', 'ph-trash', () => deleteUmbral(umbral.id), 'danger'));
        actions.appendChild(
            actionButton(
                umbral.activo ? 'Desactivar' : 'Activar',
                umbral.activo ? 'ph-toggle-right' : 'ph-toggle-left',
                () => toggleUmbral(umbral)
            )
        );
        row.appendChild(actions);
        tableBody.appendChild(row);
    });
}

function appendCell(row, text) {
    const cell = document.createElement('td');
    cell.textContent = text ?? '—';
    row.appendChild(cell);
}

function actionButton(label, icon, handler, variant) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn-icon ${variant === 'danger' ? 'danger' : ''}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = `<i class="ph ${icon}"></i>`;
    button.addEventListener('click', handler);
    return button;
}

function openUmbralModal(umbralId) {
    form.reset();
    document.getElementById('umbralId').value = '';
    document.getElementById('umbralModalTitle').textContent = 'Nuevo umbral';
    document.getElementById('umbralSubmit').textContent = 'Guardar umbral';

    if (umbralId) {
        const umbral = umbrales.find((item) => item.id === umbralId);
        if (umbral) {
            document.getElementById('umbralId').value = umbral.id;
            document.getElementById('variable').value = umbral.variable;
            document.getElementById('nombre').value = umbral.nombre || '';
            document.getElementById('unidad').value = umbral.unidad || '';
            document.getElementById('valorMinimo').value = umbral.valor_minimo ?? '';
            document.getElementById('valorMaximo').value = umbral.valor_maximo ?? '';
            document.getElementById('valorAlerta').value = umbral.valor_alerta ?? '';
            document.getElementById('instalacionId').value = umbral.instalacion_id ?? '';
            document.getElementById('cultivoId').value = umbral.cultivo_id ?? '';
            document.getElementById('descripcion').value = umbral.descripcion || '';
            document.getElementById('activo').checked = Boolean(umbral.activo);
            document.getElementById('umbralModalTitle').textContent = 'Editar umbral';
            document.getElementById('umbralSubmit').textContent = 'Guardar cambios';
        }
    }

    modal.classList.add('active');
}

function closeUmbralModal() {
    modal.classList.remove('active');
}

function numberOrNull(value) {
    return value === '' || value === null || value === undefined ? null : Number(value);
}

async function saveUmbral(event) {
    event.preventDefault();
    const umbralId = document.getElementById('umbralId').value;
    const payload = {
        variable: document.getElementById('variable').value,
        nombre: document.getElementById('nombre').value.trim(),
        unidad: document.getElementById('unidad').value.trim() || null,
        valor_minimo: numberOrNull(document.getElementById('valorMinimo').value),
        valor_maximo: numberOrNull(document.getElementById('valorMaximo').value),
        valor_alerta: numberOrNull(document.getElementById('valorAlerta').value),
        instalacion_id: numberOrNull(document.getElementById('instalacionId').value),
        cultivo_id: numberOrNull(document.getElementById('cultivoId').value),
        descripcion: document.getElementById('descripcion').value.trim() || null,
        activo: document.getElementById('activo').checked
    };

    const submit = document.getElementById('umbralSubmit');
    submit.disabled = true;
    try {
        if (umbralId) {
            await apiRequest(`/api/umbrales/${umbralId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Umbral actualizado', 'success');
        } else {
            await apiRequest('/api/umbrales/', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Umbral creado', 'success');
        }
        closeUmbralModal();
        await loadData();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        submit.disabled = false;
    }
}

async function toggleUmbral(umbral) {
    try {
        await apiRequest(`/api/umbrales/${umbral.id}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ activo: !umbral.activo })
        });
        showToast(`Umbral ${umbral.activo ? 'desactivado' : 'activado'}`, 'success');
        await loadData();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteUmbral(umbralId) {
    if (!confirm('¿Eliminar este umbral de forma permanente?')) return;
    try {
        await apiRequest(`/api/umbrales/${umbralId}`, { method: 'DELETE' });
        showToast('Umbral eliminado', 'success');
        await loadData();
    } catch (error) {
        showToast(error.message, 'error');
    }
}
