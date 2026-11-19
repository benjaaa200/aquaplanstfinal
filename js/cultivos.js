/**
 * AquaPlants - Lógica de Gestión de Cultivos
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;

    setupUserInterface(user);
    if (['admin', 'administrador'].includes((user.role || '').toLowerCase())) {
        await loadInstallations();
    }
    await loadCrops();
    
    // Listener para búsqueda en tiempo real
    document.getElementById('search-input').addEventListener('input', handleSearch);
});

function setupUserInterface(user) {
    document.getElementById('user-name').textContent = user.name || user.sub || user.username || 'Usuario';
    document.getElementById('user-role').textContent = user.role || 'Rol';
    
    const roleIndicator = document.getElementById('role-indicator');
    const btnNewCrop = document.getElementById('btn-new-crop');

    if (user.role === 'encargado') {
        roleIndicator.textContent = 'Viendo solo tus cultivos asignados.';
        // Opcional: ocultar botón de creación a encargados si la regla de negocio lo exige
        // btnNewCrop.style.display = 'none'; 
    } else {
        roleIndicator.textContent = 'Acceso total a la gestión de instalaciones.';
    }

}

async function loadInstallations() {
    const group = document.getElementById('crop-installation-group');
    const select = document.getElementById('crop-installation');
    try {
        const installations = await apiClient.get('/instalaciones/');
        installations.forEach(installation => {
            const option = document.createElement('option');
            option.value = installation.id;
            option.textContent = installation.nombre;
            select.appendChild(option);
        });
        group.hidden = false;
        const installationId = new URLSearchParams(window.location.search).get('instalacion');
        if (installationId) select.value = installationId;
    } catch (error) {
        console.error('Error cargando instalaciones:', error);
    }
}

async function loadCrops() {
    const tbody = document.getElementById('crops-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row"><i class="ph ph-spinner ph-spin"></i> Cargando cultivos...</td></tr>';

    try {
        // Asume que existe un endpoint GET /api/cultivos/ en tu backend
        const crops = await apiClient.get('/cultivos/');
        const installationId = new URLSearchParams(window.location.search).get('instalacion');
        renderTable(installationId
            ? crops.filter(crop => String(crop.instalacion_id) === installationId)
            : crops);
    } catch (error) {
        renderTable([]);
        if (typeof showToast === 'function') showToast(error.message, 'error');
    }
}

function renderTable(crops) {
    const tbody = document.getElementById('crops-table-body');
    tbody.innerHTML = '';

    if (!crops || crops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No se encontraron cultivos.</td></tr>';
        return;
    }

    crops.forEach(crop => {
        const tr = document.createElement('tr');
        const estado = String(crop.estado || '').toLowerCase();
        const statusClass = estado === 'activo' ? 'status-activo' : (estado === 'cosecha' ? 'status-cosecha' : 'status-inactivo');
        const statusIcon = estado === 'activo' ? 'ph-check-circle' : (estado === 'cosecha' ? 'ph-basket' : 'ph-pause-circle');
        const statusText = estado ? estado.charAt(0).toUpperCase() + estado.slice(1) : 'Sin estado';
        const fecha = crop.fecha_inicio ? new Date(crop.fecha_inicio + 'T00:00:00').toLocaleDateString('es-CL') : '—';

        tr.innerHTML = `
            <td>#${String(crop.id).padStart(3, '0')}</td>
            <td><strong>${crop.nombre}</strong></td>
            <td>${crop.ubicacion}</td>
            <td>${fecha}</td>
            <td><span class="status-badge ${statusClass}"><i class="ph ${statusIcon}"></i> ${statusText}</span></td>
            <td>
                <button class="action-btn" title="Ver detalles"><i class="ph ph-eye"></i></button>
                <button class="action-btn delete" title="Eliminar" onclick="deleteCrop(${crop.id})"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Lógica del Modal ---
function openModal() {
    document.getElementById('crop-modal').classList.add('active');
    document.getElementById('crop-start').valueAsDate = new Date(); // Fecha de hoy por defecto
}

function closeModal() {
    document.getElementById('crop-modal').classList.remove('active');
    document.getElementById('crop-form').reset();
}

// Cerrar modal al hacer clic fuera del contenido
document.getElementById('crop-modal').addEventListener('click', (e) => {
    if (e.target.id === 'crop-modal') closeModal();
});

async function handleCreateCrop(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Estado de carga
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';
    submitBtn.disabled = true;

    const newCropData = {
        nombre: form.nombre.value,
        ubicacion: form.ubicacion.value,
        fecha_inicio: `${form.fecha_inicio.value}T00:00:00`,
        estado: 'Activo'
    };
    const installationId = form.instalacion_id?.value;
    if (installationId) newCropData.instalacion_id = Number(installationId);

    try {
        await apiClient.post('/cultivos/', newCropData);
        closeModal();
        await loadCrops(); // Recargar tabla
        // Aquí podrías agregar una notificación toast de éxito
    } catch (error) {
        alert('Error al guardar el cultivo: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function deleteCrop(id) {
    if (!confirm('¿Estás seguro de eliminar este cultivo? Esta acción no se puede deshacer.')) return;
    
    try {
        await apiClient.delete(`/cultivos/${id}`);
        await loadCrops();
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}

// Búsqueda en tiempo real (filtro en cliente)
function handleSearch(event) {
    const term = event.target.value.toLowerCase();
    const rows = document.querySelectorAll('#crops-table-body tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}