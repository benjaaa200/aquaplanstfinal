// admin-dispositivos.js
/**
 * AquaPlants - Administración de Dispositivos IoT
 * Gestión completa de sensores y actuadores del sistema
 */

const API_BASE_URL = window.AQUAPLANTS_API_BASE || '';

// Estado global
let dispositivos = [];

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticación y rol de administrador
    const user = checkAuth();
    if (!user || !['admin', 'administrador'].includes((user.role || '').toLowerCase())) {
        showAlert('Acceso denegado. Solo administradores.', 'error');
        setTimeout(() => window.location.href = '../index.html', 2000);
        return;
    }

    // Cargar instalaciones disponibles
    await loadInstalaciones();
    
    // Cargar dispositivos
    await loadDispositivos();
    
    // Configurar event listeners
    setupEventListeners();
    
    // Actualizar cada 30 segundos
    setInterval(loadDispositivos, 30000);
});

// Cargar instalaciones desde la API
async function loadInstalaciones() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/instalaciones/`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Error al cargar instalaciones');
        
        const data = await response.json();
        [
            ['filtroInstalacion', 'Todas las instalaciones'],
            ['instalacion', 'Sin asignar'],
            ['editInstalacion', 'Sin asignar']
        ].forEach(([id, placeholder]) => {
            const select = document.getElementById(id);
            if (!select) return;
            select.innerHTML = `<option value="">${placeholder}</option>`;
            data.forEach(inst => {
                select.insertAdjacentHTML('beforeend', `<option value="${inst.id}">${escapeHtml(inst.nombre)}</option>`);
            });
        });
    } catch (error) {
        console.error('Error cargando instalaciones:', error);
    }
}

// Cargar dispositivos desde la API
async function loadDispositivos() {
    const tbody = document.getElementById('dispositivosTableBody');
    if (!tbody) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/dispositivos/`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Error al cargar dispositivos');
        
        dispositivos = await response.json();
        applyDeviceFilters();
        
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: var(--danger);">
                    <i class="ph ph-warning-circle" style="font-size: 32px; display: block; margin-bottom: 8px;"></i>
                    Error al cargar dispositivos. Verifica que el backend esté corriendo.
                </td>
            </tr>
        `;
    }
}

// Renderizar tabla de dispositivos
function renderDispositivos(lista) {
    const tbody = document.getElementById('dispositivosTableBody');
    
    if (lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    No hay dispositivos registrados
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = lista.map(dis => `
        <tr data-id="${dis.id}">
            <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; background: ${dis.tipo === 'sensor' ? 'var(--cyan-light)' : 'var(--green-light)'}; 
                                border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <i class="ph ${dis.tipo === 'sensor' ? 'ph-wave-sine' : 'ph-motorcycle'}" 
                           style="color: ${dis.tipo === 'sensor' ? 'var(--cyan-dark)' : 'var(--green-dark)'}; font-size: 20px;"></i>
                    </div>
                    <div>
                        <div style="font-weight: 600;">${escapeHtml(dis.nombre)}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(dis.modelo || 'Sin modelo')}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge badge-${escapeHtml(dis.tipo)}">${escapeHtml(dis.tipo.toUpperCase())}</span>
            </td>
            <td>${escapeHtml(dis.instalacion_nombre || 'Sin asignar')}</td>
            <td>
                <span class="status-badge status-${dis.estado === 'activo' ? 'online' : 'offline'}">
                    ${dis.estado === 'activo' ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>${dis.ultimaconexion ? formatDate(dis.ultimaconexion) : 'Nunca'}</td>
            <td style="text-align: center;">
                <span style="font-family: monospace; font-size: 0.85rem; background: var(--bg); padding: 4px 8px; border-radius: 4px;">
                    ${dis.direccion_ip ? escapeHtml(dis.direccion_ip + ':' + (dis.puerto || 80)) : 'Sin IP'}
                </span>
            </td>
            <td style="text-align: center;">
                <span style="font-family: monospace; font-size: 0.85rem; background: var(--bg); padding: 4px 8px; border-radius: 4px;">
                    ${escapeHtml(dis.direccion_mac || 'N/A')}
                </span>
            </td>
            <td>
                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-sm btn-secondary" onclick="probarConexion(${dis.id})" title="Probar conexión" ${dis.direccion_ip ? '' : 'disabled'}>
                        <i class="ph ph-plugs-connected"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="editarDispositivo(${dis.id})" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="btn btn-sm ${dis.estado === 'activo' ? 'btn-danger' : 'btn-success'}" 
                            onclick="toggleEstado(${dis.id}, '${dis.estado}')" 
                            title="${dis.estado === 'activo' ? 'Desactivar' : 'Activar'}">
                        <i class="ph ph-${dis.estado === 'activo' ? 'power' : 'power'}"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="eliminarDispositivo(${dis.id})" title="Eliminar">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Configurar event listeners
function setupEventListeners() {
    // Formulario de nuevo dispositivo
    const form = document.getElementById('newDispositivoForm');
    if (form) {
        form.addEventListener('submit', handleCreateDispositivo);
    }
    
    document.getElementById('filtroInstalacion').addEventListener('change', applyDeviceFilters);
    document.getElementById('searchDispositivos').addEventListener('input', applyDeviceFilters);
    
    // Botón refrescar
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            btnRefresh.classList.add('spinning');
            loadDispositivos().then(() => {
                setTimeout(() => btnRefresh.classList.remove('spinning'), 1000);
            });
        });
    }

}

function applyDeviceFilters() {
    const instalacionId = document.getElementById('filtroInstalacion').value;
    const term = document.getElementById('searchDispositivos').value.toLowerCase();
    const filtered = dispositivos.filter(dis => {
        const matchesInstallation = !instalacionId ||
            String(dis.instalacion_id) === instalacionId;
        const matchesText = [dis.nombre, dis.modelo, dis.direccion_mac]
            .some(value => String(value || '').toLowerCase().includes(term));
        return matchesInstallation && matchesText;
    });
    renderDispositivos(filtered);
}

// Crear nuevo dispositivo
async function handleCreateDispositivo(e) {
    e.preventDefault();
    
    const formData = {
        nombre: document.getElementById('nombre').value,
        tipo: document.getElementById('tipo').value,
        modelo: document.getElementById('modelo').value,
        direccion_mac: document.getElementById('macAddress').value,
        direccion_ip: document.getElementById('ipAddress').value.trim() || null,
        puerto: parseInt(document.getElementById('puerto').value, 10) || 80,
        instalacion_id: document.getElementById('instalacion').value || null,
        descripcion: document.getElementById('descripcion').value
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/dispositivos/`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const creado = await response.json();
            if (creado.conexion) {
                showAlert(
                    creado.conexion.alcanzable
                        ? `Dispositivo registrado y conectado (${creado.conexion.latencia_ms} ms)`
                        : 'Dispositivo registrado, pero no se pudo conectar a la IP indicada',
                    creado.conexion.alcanzable ? 'success' : 'info'
                );
            } else {
                showAlert('Dispositivo registrado exitosamente', 'success');
            }
            closeModal('modalDispositivo');
            e.target.reset();
            await loadDispositivos();
        } else {
            const error = await response.json();
            showAlert(error.detail || 'Error al crear dispositivo', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error de conexión al crear dispositivo', 'error');
    }
}

// Editar dispositivo
async function editarDispositivo(id) {
    const dispositivo = dispositivos.find(d => d.id === id);
    if (!dispositivo) return;
    
    // Llenar formulario con datos actuales
    document.getElementById('editNombre').value = dispositivo.nombre;
    document.getElementById('editTipo').value = dispositivo.tipo;
    document.getElementById('editModelo').value = dispositivo.modelo || '';
    document.getElementById('editMacAddress').value = dispositivo.direccion_mac || '';
    document.getElementById('editIpAddress').value = dispositivo.direccion_ip || '';
    document.getElementById('editPuerto').value = dispositivo.puerto || 80;
    document.getElementById('editInstalacion').value = dispositivo.instalacion_id || '';
    document.getElementById('editDescripcion').value = dispositivo.descripcion || '';
    
    // Guardar ID en el formulario
    const form = document.getElementById('editDispositivoForm');
    form.dataset.id = id;
    
    openModal('modalEditDispositivo');
}

// Guardar edición
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('editDispositivoForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = parseInt(form.dataset.id);
            
            const formData = {
                nombre: document.getElementById('editNombre').value,
                tipo: document.getElementById('editTipo').value,
                modelo: document.getElementById('editModelo').value,
                direccion_mac: document.getElementById('editMacAddress').value,
                direccion_ip: document.getElementById('editIpAddress').value.trim() || null,
                puerto: parseInt(document.getElementById('editPuerto').value, 10) || 80,
                instalacion_id: document.getElementById('editInstalacion').value || null,
                descripcion: document.getElementById('editDescripcion').value
            };
            
            try {
                const response = await fetch(`${API_BASE_URL}/api/dispositivos/${id}`, {
                    method: 'PUT',
                    headers: {
                        ...getAuthHeaders(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    const actualizado = await response.json();
                    if (actualizado.conexion) {
                        showAlert(
                            actualizado.conexion.alcanzable
                                ? `Dispositivo actualizado y conectado (${actualizado.conexion.latencia_ms} ms)`
                                : 'Dispositivo actualizado, pero no se pudo conectar a la IP indicada',
                            actualizado.conexion.alcanzable ? 'success' : 'info'
                        );
                    } else {
                        showAlert('Dispositivo actualizado exitosamente', 'success');
                    }
                    closeModal('modalEditDispositivo');
                    await loadDispositivos();
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

// Probar conexión TCP contra la IP del dispositivo
async function probarConexion(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/dispositivos/${id}/probar-conexion`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            showAlert(data.detail || 'No se pudo probar la conexión', 'error');
            return;
        }

        const resultado = data.conexion || {};
        if (resultado.alcanzable) {
            showAlert(`Conexión exitosa (${resultado.latencia_ms} ms)`, 'success');
        } else {
            showAlert(`Sin conexión: ${resultado.error || 'host inalcanzable'}`, 'error');
        }
        await loadDispositivos();
    } catch (error) {
        showAlert('Error de red al probar la conexión', 'error');
    }
}

// Toggle estado (activar/desactivar)
async function toggleEstado(id, estadoActual) {
    const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
    const accion = nuevoEstado === 'activo' ? 'activar' : 'desactivar';
    
    if (!confirm(`¿Estás seguro de ${accion} este dispositivo?`)) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/dispositivos/${id}/estado`, {
            method: 'PATCH',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        
        if (response.ok) {
            showAlert(`Dispositivo ${nuevoEstado === 'activo' ? 'activado' : 'desactivado'} correctamente`, 'success');
            await loadDispositivos();
        } else {
            showAlert('Error al cambiar estado', 'error');
        }
    } catch (error) {
        showAlert('Error de conexión', 'error');
    }
}

// Eliminar dispositivo
async function eliminarDispositivo(id) {
    if (!confirm('¿Estás seguro de eliminar este dispositivo? Esta acción no se puede deshacer.')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/dispositivos/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showAlert('Dispositivo eliminado correctamente', 'success');
            await loadDispositivos();
        } else {
            showAlert('Error al eliminar dispositivo', 'error');
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
    const date = new Date(dateString);
    return date.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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