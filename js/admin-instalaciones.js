/**
 * AquaPlants - Administración de Instalaciones
 * Gestión de cultivos, invernaderos y zonas de producción
 */

const API_BASE_URL = window.AQUAPLANTS_API_BASE || '';

let instalaciones = [];
let estadisticas = {};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user || !['admin', 'administrador'].includes((user.role || '').toLowerCase())) {
        showAlert('Acceso denegado. Solo administradores.', 'error');
        setTimeout(() => window.location.href = '../index.html', 2000);
        return;
    }

    await loadInstalaciones();
    await loadEstadisticas();
    await loadResponsables();
    setupEventListeners();
});

// Cargar instalaciones
async function loadInstalaciones() {
    const container = document.getElementById('instalacionesGrid');
    if (!container) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/instalaciones/`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Error al cargar instalaciones');
        
        instalaciones = await response.json();
        renderInstalaciones(instalaciones);
        
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">
                <i class="ph ph-warning-circle" style="font-size: 48px; display: block; margin-bottom: 16px;"></i>
                Error al cargar instalaciones. Verifica la conexión con el servidor.
            </div>
        `;
    }
}

// Cargar estadísticas del dashboard
async function loadEstadisticas() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/estadisticas`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            estadisticas = await response.json();
            updateStatsCards();
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// Actualizar tarjetas de estadísticas
function updateStatsCards() {
    const stats = {
        total: estadisticas.total_instalaciones || instalaciones.length,
        activas: estadisticas.instalaciones_activas || instalaciones.filter(i => i.activa).length,
        dispositivos: estadisticas.total_dispositivos || 0,
        alertas: estadisticas.alertas_activas || 0
    };
    
    const cards = {
        totalInstalaciones: stats.total,
        instalacionesActivas: stats.activas,
        totalDispositivos: stats.dispositivos,
        alertasActivas: stats.alertas
    };
    
    Object.keys(cards).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            // Animación de conteo
            animateValue(element, parseInt(element.textContent) || 0, cards[id], 1000);
        }
    });
}

// Animación de números
function animateValue(element, start, end, duration) {
    const range = end - start;
    if (range === 0) {
        element.textContent = end;
        return;
    }
    const increment = end > start ? 1 : -1;
    const stepTime = Math.max(1, Math.abs(Math.floor(duration / range)));
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        element.textContent = current;
        if (current === end) clearInterval(timer);
    }, stepTime);
}

// Renderizar grid de instalaciones
function renderInstalaciones(lista) {
    const container = document.getElementById('instalacionesGrid');
    
    if (lista.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px;">
                <i class="ph ph-plant" style="font-size: 48px; color: var(--text-muted); display: block; margin-bottom: 16px;"></i>
                <p style="color: var(--text-muted); font-size: 1.1rem;">No hay instalaciones registradas</p>
                <button class="btn btn-primary" onclick="openModal('modalInstalacion')" style="margin-top: 16px;">
                    <i class="ph ph-plus"></i> Crear primera instalación
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = lista.map(inst => `
        <div class="instalacion-card" data-id="${inst.id}">
            <div class="card-header">
                <div class="card-icon" style="background: ${inst.activa ? 'var(--green-light)' : 'var(--bg)'};">
                    <i class="ph ph-buildings" style="color: ${inst.activa ? 'var(--green-dark)' : 'var(--text-muted)'};"></i>
                </div>
                <div class="card-status">
                    <span class="badge ${inst.activa ? 'badge-success' : 'badge-secondary'}">
                        ${inst.activa ? 'Activa' : 'Inactiva'}
                    </span>
                </div>
            </div>
            
            <div class="card-body">
                <h3>${escapeHtml(inst.nombre)}</h3>
                <p class="descripcion">${escapeHtml(inst.descripcion || 'Sin descripción')}</p>
                
                <div class="info-grid">
                    <div class="info-item">
                        <i class="ph ph-map-pin"></i>
                        <span>${escapeHtml(inst.ubicacion || 'Sin ubicación')}</span>
                    </div>
                    <div class="info-item">
                        <i class="ph ph-ruler"></i>
                        <span>${inst.area_m2 ? inst.area_m2 + ' m²' : 'Área no definida'}</span>
                    </div>
                    <div class="info-item">
                        <i class="ph ph-calendar"></i>
                        <span>Creada: ${formatDate(inst.fecha_creacion)}</span>
                    </div>
                </div>
                
                <div class="metrics">
                    <div class="metric">
                        <span class="metric-value">${inst.dispositivos_count || 0}</span>
                        <span class="metric-label">Dispositivos</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value">${inst.cultivos_count || 0}</span>
                        <span class="metric-label">Cultivos</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value">${inst.alertas_count || 0}</span>
                        <span class="metric-label">Alertas</span>
                    </div>
                </div>
            </div>
            
            <div class="card-footer">
                <button class="btn btn-sm btn-secondary" onclick="verDetalle(${inst.id})">
                    <i class="ph ph-eye"></i> Ver
                </button>
                <button class="btn btn-sm btn-primary" onclick="editarInstalacion(${inst.id})">
                    <i class="ph ph-pencil-simple"></i> Editar
                </button>
                <button class="btn btn-sm ${inst.activa ? 'btn-danger' : 'btn-success'}" 
                        onclick="toggleEstadoInstalacion(${inst.id}, ${inst.activa})">
                    <i class="ph ph-${inst.activa ? 'power' : 'power'}"></i> ${inst.activa ? 'Desactivar' : 'Activar'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="eliminarInstalacion(${inst.id})" title="Eliminar instalación">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Configurar event listeners
function setupEventListeners() {
    // Formulario de nueva instalación
    const form = document.getElementById('newInstalacionForm');
    if (form) {
        form.addEventListener('submit', handleCreateInstalacion);
    }
    
    // Búsqueda
    const searchInput = document.getElementById('searchInstalaciones');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            renderInstalacionesFiltradas(term, document.getElementById('filtroEstado').value);
        });
    }
    
    // Filtro por estado
    const filtroEstado = document.getElementById('filtroEstado');
    if (filtroEstado) {
        filtroEstado.addEventListener('change', (e) => {
            const estado = e.target.value;
            renderInstalacionesFiltradas(document.getElementById('searchInstalaciones').value.toLowerCase(), estado);
        });
    }

    function renderInstalacionesFiltradas(term, estado) {
        const filtradas = instalaciones.filter(inst => {
            const coincideTexto = [inst.nombre, inst.ubicacion, inst.descripcion]
                .some(valor => String(valor || '').toLowerCase().includes(term));
            const coincideEstado = estado === 'todas' ||
                inst.activa === (estado === 'activas');
            return coincideTexto && coincideEstado;
        });
        renderInstalaciones(filtradas);
    }
}

// Crear nueva instalación
async function handleCreateInstalacion(e) {
    e.preventDefault();
    
    const formData = {
        nombre: document.getElementById('nombre').value,
        descripcion: document.getElementById('descripcion').value,
        ubicacion: document.getElementById('ubicacion').value,
        area_m2: parseFloat(document.getElementById('area').value) || null,
        responsable_id: document.getElementById('responsable').value || null
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/instalaciones/`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            showAlert('Instalación creada exitosamente', 'success');
            closeModal('modalInstalacion');
            e.target.reset();
            await loadInstalaciones();
            await loadEstadisticas();
        } else {
            const error = await response.json();
            showAlert(error.detail || 'Error al crear instalación', 'error');
        }
    } catch (error) {
        showAlert('Error de conexión', 'error');
    }
}

// Editar instalación
async function editarInstalacion(id) {
    const instalacion = instalaciones.find(i => i.id === id);
    if (!instalacion) return;
    
    // Cargar responsables si es necesario
    await loadResponsables();
    
    document.getElementById('editNombre').value = instalacion.nombre;
    document.getElementById('editDescripcion').value = instalacion.descripcion || '';
    document.getElementById('editUbicacion').value = instalacion.ubicacion || '';
    document.getElementById('editArea').value = instalacion.area_m2 || '';
    document.getElementById('editResponsable').value = instalacion.responsable_id || '';
    
    const form = document.getElementById('editInstalacionForm');
    form.dataset.id = id;
    
    openModal('modalEditInstalacion');
}

// Cargar responsables (usuarios encargados)
async function loadResponsables() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/usuarios/encargados`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const responsables = await response.json();
            ['responsable', 'editResponsable'].forEach(id => {
                const select = document.getElementById(id);
                if (!select) return;
                select.innerHTML = '<option value="">Sin responsable</option>';
                responsables.forEach(resp => {
                    select.insertAdjacentHTML('beforeend', `<option value="${resp.id}">${escapeHtml(resp.nombre_completo)}</option>`);
                });
            });
        }
    } catch (error) {
        console.error('Error cargando responsables:', error);
    }
}

// Guardar edición
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('editInstalacionForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = parseInt(form.dataset.id);
            
            const formData = {
                nombre: document.getElementById('editNombre').value,
                descripcion: document.getElementById('editDescripcion').value,
                ubicacion: document.getElementById('editUbicacion').value,
                area_m2: parseFloat(document.getElementById('editArea').value) || null,
                responsable_id: document.getElementById('editResponsable').value || null
            };
            
            try {
                const response = await fetch(`${API_BASE_URL}/api/instalaciones/${id}`, {
                    method: 'PUT',
                    headers: {
                        ...getAuthHeaders(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    showAlert('Instalación actualizada exitosamente', 'success');
                    closeModal('modalEditInstalacion');
                    await loadInstalaciones();
                } else {
                    const error = await response.json();
                    showAlert(error.detail || 'Error al actualizar', 'error');
                }
            } catch (error) {
                showAlert('Error de conexión', 'error');
            }
        });
    }
});

// Toggle estado de instalación
async function toggleEstadoInstalacion(id, estadoActual) {
    const accion = estadoActual ? 'desactivar' : 'activar';
    if (!confirm(`¿Estás seguro de ${accion} esta instalación?`)) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/instalaciones/${id}/estado`, {
            method: 'PATCH',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ activa: !estadoActual })
        });
        
        if (response.ok) {
            showAlert(`Instalación ${!estadoActual ? 'activada' : 'desactivada'} correctamente`, 'success');
            await loadInstalaciones();
            await loadEstadisticas();
        } else {
            showAlert('Error al cambiar estado', 'error');
        }
    } catch (error) {
        showAlert('Error de conexión', 'error');
    }
}

// Ver detalle de instalación
function verDetalle(id) {
    window.location.href = `../pages/cultivos.html?instalacion=${id}`;
}

// Eliminar instalación
async function eliminarInstalacion(id) {
    if (!confirm('¿Eliminar esta instalación? Debe estar sin cultivos ni dispositivos asignados.')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/instalaciones/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showAlert('Instalación eliminada correctamente', 'success');
            await loadInstalaciones();
            await loadEstadisticas();
        } else {
            const error = await response.json();
            showAlert(error.detail || 'No se pudo eliminar la instalación.', 'error');
        }
    } catch (error) {
        showAlert('Error de conexión', 'error');
    }
}

// Utilidades
function showAlert(message, type = 'info') {
    showToast(message, type);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-CL');
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

// Cerrar modales al hacer clic fuera
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});