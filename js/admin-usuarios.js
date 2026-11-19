const API_BASE_URL = window.AQUAPLANTS_API_BASE || '';

const userTableBody = document.getElementById('usersTableBody');
const createUserForm = document.getElementById('createUserForm');
const userModal = document.getElementById('userModal');
const assignModal = document.getElementById('assignModal');
const assignCropForm = document.getElementById('assignCropForm');
let assignedUserId = null;
let editingUserId = null;
const usersById = new Map();

document.addEventListener('DOMContentLoaded', () => {
    const user = checkAuth();
    if (!user || !['admin', 'administrador'].includes(String(user.role || '').toLowerCase())) {
        showToast('Acceso denegado. Solo administradores.', 'error');
        window.location.href = '../index.html';
        return;
    }

    loadUsers();
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

async function loadUsers() {
    userTableBody.replaceChildren();
    usersById.clear();
    try {
        const users = await apiRequest('/api/usuarios/');
        if (users.length === 0) {
            appendTableMessage('No hay usuarios registrados.');
            return;
        }

        users.forEach((user) => {
            usersById.set(user.id, user);
            const row = document.createElement('tr');
            appendCell(row, user.nombre_completo || '-');
            appendCell(row, user.username || '-');
            appendCell(row, user.email || '-');

            const roleCell = document.createElement('td');
            const roleBadge = document.createElement('span');
            const role = String(user.rol || '').toLowerCase();
            const roleClass = ['admin', 'administrador'].includes(role)
                ? 'admin'
                : ['supervisor', 'encargado'].includes(role) ? role : 'unknown';
            roleBadge.className = `badge badge-${roleClass}`;
            roleBadge.textContent = role.toUpperCase() || 'SIN ROL';
            roleCell.appendChild(roleBadge);
            row.appendChild(roleCell);

            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `status-badge ${user.activo ? 'status-activo' : 'status-inactivo'}`;
            statusBadge.textContent = user.activo ? 'Activo' : 'Inactivo';
            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            const actionsCell = document.createElement('td');
            actionsCell.className = 'table-actions';
            if (role === 'encargado') {
                const assignButton = document.createElement('button');
                assignButton.type = 'button';
                assignButton.className = 'btn-secondary btn-small';
                assignButton.dataset.assignUser = String(user.id);
                assignButton.dataset.username = user.username || '';
                assignButton.textContent = 'Asignar cultivos';
                actionsCell.appendChild(assignButton);
            }
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn-icon';
            editButton.title = 'Editar usuario';
            editButton.setAttribute('aria-label', 'Editar usuario');
            editButton.dataset.editUser = String(user.id);
            editButton.innerHTML = '<i class="ph ph-pencil-simple"></i>';
            actionsCell.appendChild(editButton);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn-icon danger';
            deleteButton.title = 'Eliminar usuario';
            deleteButton.setAttribute('aria-label', 'Eliminar usuario');
            deleteButton.dataset.deleteUser = String(user.id);
            deleteButton.innerHTML = '<i class="ph ph-trash"></i>';
            actionsCell.appendChild(deleteButton);
            row.appendChild(actionsCell);
            userTableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        appendTableMessage(`No se pudieron cargar los usuarios: ${error.message}`);
    }
}

function appendCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.appendChild(cell);
}

function appendTableMessage(message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'loading-row';
    cell.textContent = message;
    row.appendChild(cell);
    userTableBody.appendChild(row);
}

createUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = createUserForm.querySelector('[type="submit"]');
    submitButton.disabled = true;

    const password = document.getElementById('password').value;
    if (!editingUserId && !password) {
        submitButton.disabled = false;
        showToast('La contraseña es obligatoria para crear un usuario.', 'error');
        return;
    }
    const userData = {
        nombre_completo: document.getElementById('nombre').value.trim(),
        username: document.getElementById('username').value.trim(),
        email: document.getElementById('email').value.trim(),
        email_respaldo: document.getElementById('email_respaldo').value.trim() || null,
        telefono_respaldo: document.getElementById('telefono_respaldo').value.trim() || null,
        rol: document.getElementById('rol').value,
        activo: document.getElementById('activo').checked
    };
    if (password) userData.password = password;

    try {
        if (editingUserId) {
            await apiRequest(`/api/usuarios/${editingUserId}`, {
                method: 'PUT',
                body: JSON.stringify(userData)
            });
            showToast('Usuario actualizado correctamente.', 'success');
        } else {
            await apiRequest('/api/usuarios/', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
            showToast('Usuario creado exitosamente.', 'success');
        }
        closeModal();
        await loadUsers();
    } catch (error) {
        console.error('Error al guardar usuario:', error);
        showToast(`No se pudo guardar el usuario: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
});

userTableBody.addEventListener('click', (event) => {
    const assignButton = event.target.closest('[data-assign-user]');
    if (assignButton) {
        openAssignment(Number(assignButton.dataset.assignUser), assignButton.dataset.username);
        return;
    }
    const editButton = event.target.closest('[data-edit-user]');
    if (editButton) {
        openModal(Number(editButton.dataset.editUser));
        return;
    }
    const deleteButton = event.target.closest('[data-delete-user]');
    if (deleteButton) {
        deleteUser(Number(deleteButton.dataset.deleteUser));
    }
});

async function openAssignment(userId, username) {
    assignedUserId = userId;
    const submitButton = assignCropForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    document.getElementById('assignUserName').textContent = `Encargado: ${username}`;
    const cropsList = document.getElementById('assignCropsList');
    cropsList.textContent = 'Cargando cultivos…';
    assignModal.classList.add('active');

    try {
        const [crops, assignment] = await Promise.all([
            apiRequest('/api/cultivos/'),
            apiRequest(`/api/usuarios/${userId}/cultivos`)
        ]);
        cropsList.replaceChildren();

        if (crops.length === 0) {
            cropsList.textContent = 'No hay cultivos disponibles para asignar.';
            submitButton.disabled = false;
            return;
        }

        const selected = new Set(assignment.cultivo_ids);
        crops.forEach((crop) => {
            const label = document.createElement('label');
            label.className = 'check';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'cultivo_ids';
            checkbox.value = String(crop.id);
            checkbox.checked = selected.has(crop.id);
            const name = document.createElement('span');
            name.textContent = crop.nombre;
            label.append(checkbox, name);
            cropsList.appendChild(label);
        });
        submitButton.disabled = false;
    } catch (error) {
        console.error('Error al cargar asignaciones:', error);
        cropsList.textContent = `No se pudieron cargar las asignaciones: ${error.message}`;
    }
}

assignCropForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (assignedUserId === null) return;

    const submitButton = assignCropForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    const cultivoIds = Array.from(
        assignCropForm.querySelectorAll('input[name="cultivo_ids"]:checked'),
        (checkbox) => Number(checkbox.value)
    );

    try {
        await apiRequest(`/api/usuarios/${assignedUserId}/cultivos`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cultivo_ids: cultivoIds })
        });
        closeAssignment();
        showToast('Asignaciones actualizadas.', 'success');
    } catch (error) {
        console.error('Error al actualizar asignaciones:', error);
        showToast(`No se pudieron guardar las asignaciones: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
    }
});

function openModal(userId = null) {
    createUserForm.reset();
    editingUserId = userId || null;
    document.getElementById('activo').checked = true;
    document.getElementById('password').value = '';
    document.getElementById('userModalTitle').textContent = 'Crear nuevo usuario';

    if (editingUserId) {
        const user = usersById.get(editingUserId);
        if (!user) return;
        document.getElementById('nombre').value = user.nombre_completo || '';
        document.getElementById('username').value = user.username || '';
        document.getElementById('email').value = user.email || '';
        document.getElementById('email_respaldo').value = user.email_respaldo || '';
        document.getElementById('telefono_respaldo').value = user.telefono_respaldo || '';
        document.getElementById('rol').value = user.rol === 'administrador' ? 'admin' : user.rol;
        document.getElementById('activo').checked = Boolean(user.activo);
        document.getElementById('userModalTitle').textContent = 'Editar usuario';
    }

    userModal.classList.add('active');
}

function closeModal() {
    editingUserId = null;
    userModal.classList.remove('active');
}

async function deleteUser(userId) {
    const user = usersById.get(userId);
    if (!user) return;
    if (!confirm(`¿Eliminar permanentemente al usuario ${user.username}?`)) return;
    try {
        await apiRequest(`/api/usuarios/${userId}`, { method: 'DELETE' });
        await loadUsers();
        showToast('Usuario eliminado correctamente.', 'success');
    } catch (error) {
        showToast(`No se pudo eliminar el usuario: ${error.message}`, 'error');
    }
}

function closeAssignment() {
    assignModal.classList.remove('active');
    assignedUserId = null;
}

document.querySelectorAll('[data-close-assign]').forEach((button) => {
    button.addEventListener('click', closeAssignment);
});

userModal.addEventListener('click', (event) => {
    if (event.target === userModal) closeModal();
});

assignModal.addEventListener('click', (event) => {
    if (event.target === assignModal) closeAssignment();
});

window.openModal = openModal;
window.closeModal = closeModal;
