document.addEventListener('DOMContentLoaded', () => {
    const session = checkAuth();
    if (!session) return;

    const roleLabels = {
        admin: 'Administrador',
        administrador: 'Administrador',
        supervisor: 'Supervisor',
        encargado: 'Encargado de cultivo'
    };

    const el = (id) => document.getElementById(id);
    const fields = {
        username: el('profile-username'),
        role: el('profile-role'),
        lastLogin: el('profile-last-login'),
        status: el('profile-status')
    };
    const hero = {
        avatar: el('profile-avatar'),
        name: el('profile-hero-name'),
        username: el('profile-hero-username'),
        email: el('profile-hero-email'),
        role: el('profile-hero-role'),
        status: el('profile-hero-status'),
        memberSince: el('profile-member-since'),
        session: el('profile-session')
    };
    const personalForm = el('profile-form');
    const passwordForm = el('password-form');

    const profileError = document.createElement('p');
    profileError.className = 'form-error';
    personalForm.appendChild(profileError);

    const passwordError = document.createElement('p');
    passwordError.className = 'form-error';
    passwordForm.appendChild(passwordError);

    let profileCache = null;

    function formatDate(value, options) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('es-CL', options || {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    }

    function formatDay(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('es-CL', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function initials(name, username) {
        const base = (name || username || 'U').trim();
        const parts = base.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return base.slice(0, 2).toUpperCase();
    }

    function setStatusBadge(node, active) {
        if (!node) return;
        node.className = `status-badge ${active ? 'status-activo' : 'status-inactivo'}`;
        node.replaceChildren();
        const icon = document.createElement('i');
        icon.className = `ph ${active ? 'ph-check-circle' : 'ph-pause-circle'}`;
        node.append(icon, document.createTextNode(active ? ' Activo' : ' Inactivo'));
    }

    function renderProfile(profile) {
        profileCache = profile;
        const roleLabel = roleLabels[profile.rol] || profile.rol || 'Rol';
        const fullName = profile.nombre_completo || profile.username;

        if (hero.avatar) hero.avatar.textContent = initials(profile.nombre_completo, profile.username);
        if (hero.name) hero.name.textContent = fullName;
        if (hero.username) hero.username.textContent = `@${profile.username}`;
        if (hero.email) hero.email.textContent = profile.email || 'Sin email';
        if (hero.role) hero.role.textContent = roleLabel;
        if (hero.memberSince) hero.memberSince.textContent = formatDay(profile.fecha_creacion);
        setStatusBadge(hero.status, Boolean(profile.activo));

        if (fields.username) fields.username.textContent = profile.username;
        if (fields.role) fields.role.textContent = roleLabel;
        if (fields.lastLogin) fields.lastLogin.textContent = formatDate(profile.ultimo_acceso);
        if (fields.status) fields.status.textContent = profile.activo ? 'Activo' : 'Inactivo';

        const securityLastLogin = el('security-last-login');
        if (securityLastLogin) securityLastLogin.textContent = formatDate(profile.ultimo_acceso);

        const fullnameInput = el('profile-fullname');
        const emailInput = el('profile-email');
        const backupEmailInput = el('profile-backup-email');
        const phoneInput = el('profile-phone');
        if (fullnameInput) fullnameInput.value = profile.nombre_completo || '';
        if (emailInput) emailInput.value = profile.email || '';
        if (backupEmailInput) backupEmailInput.value = profile.email_respaldo || '';
        if (phoneInput) phoneInput.value = profile.telefono_respaldo || '';

        renderSession(session);
        renderPreferences();
    }

    function renderSession(payload) {
        if (!payload || !payload.exp) {
            if (hero.session) hero.session.textContent = 'Sesión activa';
            return;
        }
        const expires = new Date(payload.exp * 1000);
        const minutes = Math.max(0, Math.round((expires.getTime() - Date.now()) / 60000));
        if (hero.session) {
            hero.session.innerHTML = '';
            const icon = document.createElement('i');
            icon.className = 'ph ph-plug';
            const label = minutes > 0
                ? `Sesión activa · ${minutes} min restantes`
                : 'Sesión por expirar';
            hero.session.append(icon, document.createTextNode(` ${label}`));
        }
        const sessionExpires = el('session-expires');
        if (sessionExpires) sessionExpires.textContent = formatDate(expires);
    }

    function renderPreferences() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        document.querySelectorAll('[data-theme-choice]').forEach((button) => {
            button.classList.toggle('active', button.dataset.themeChoice === currentTheme);
        });
        const timezone = el('pref-timezone');
        if (timezone) {
            try {
                timezone.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || '—';
            } catch (error) {
                timezone.textContent = '—';
            }
        }
    }

    async function loadProfile() {
        try {
            const profile = await apiClient.get('/auth/me');
            renderProfile(profile);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function loadStats() {
        const [crops, alerts, notifications] = await Promise.allSettled([
            apiClient.get('/cultivos/'),
            apiClient.get('/alertas/'),
            apiClient.get('/notificaciones/resumen')
        ]);

        const cropsValue = el('stat-cultivos');
        if (cropsValue) {
            cropsValue.textContent = crops.status === 'fulfilled' && Array.isArray(crops.value)
                ? crops.value.length
                : '—';
        }

        const alertsValue = el('stat-alertas');
        const criticalValue = el('stat-criticas');
        if (alerts.status === 'fulfilled' && Array.isArray(alerts.value)) {
            const pending = alerts.value.filter((alert) => !alert.resuelta);
            if (alertsValue) alertsValue.textContent = pending.length;
            if (criticalValue) {
                criticalValue.textContent = pending.filter(
                    (alert) => alert.severidad === 'critical' || alert.severidad === 'danger'
                ).length;
            }
        } else {
            if (alertsValue) alertsValue.textContent = '—';
            if (criticalValue) criticalValue.textContent = '—';
        }

        const notifValue = el('stat-notificaciones');
        if (notifValue) {
            notifValue.textContent = notifications.status === 'fulfilled'
                ? (notifications.value.no_leidas ?? 0)
                : '—';
        }
    }

    function contactAction(href, icon, label, external) {
        const link = document.createElement('a');
        link.className = 'btn-secondary btn-small';
        link.href = href;
        if (external) {
            link.target = '_blank';
            link.rel = 'noopener';
        }
        const iconNode = document.createElement('i');
        iconNode.className = `ph ${icon}`;
        link.append(iconNode, document.createTextNode(` ${label}`));
        return link;
    }

    function contactItem(contact) {
        const item = document.createElement('div');
        item.className = 'contact-item';

        const avatar = document.createElement('span');
        avatar.className = 'contact-avatar';
        avatar.textContent = initials(contact.nombre_completo, contact.username);

        const body = document.createElement('div');
        body.className = 'contact-body';

        const name = document.createElement('strong');
        name.textContent = contact.nombre_completo || contact.username;
        body.appendChild(name);

        const role = document.createElement('small');
        const roleLabel = roleLabels[contact.rol] || contact.rol || 'Contacto';
        role.textContent = contact.grupo ? `${roleLabel} · ${contact.grupo}` : roleLabel;
        body.appendChild(role);

        if (contact.email) {
            const email = document.createElement('small');
            email.textContent = contact.email;
            body.appendChild(email);
        }
        if (contact.telefono) {
            const phone = document.createElement('small');
            phone.textContent = contact.telefono;
            body.appendChild(phone);
        }

        const actions = document.createElement('div');
        actions.className = 'contact-actions';
        if (contact.email) {
            actions.appendChild(contactAction(`mailto:${contact.email}`, 'ph-envelope-simple', 'Email'));
        }
        if (contact.telefono) {
            const tel = contact.telefono.replace(/[^\d+]/g, '');
            const digits = contact.telefono.replace(/\D/g, '');
            actions.appendChild(contactAction(`tel:${tel}`, 'ph-phone', 'Llamar'));
            if (digits.length >= 8) {
                actions.appendChild(contactAction(`https://wa.me/${digits}`, 'ph-whatsapp-logo', 'WhatsApp', true));
            }
        }
        if (actions.childElementCount) body.appendChild(actions);

        item.append(avatar, body);
        return item;
    }

    function contactSection(title, contacts) {
        if (!contacts || !contacts.length) return null;
        const section = document.createElement('div');
        const heading = document.createElement('p');
        heading.className = 'profile-mini-title';
        heading.textContent = title;
        section.appendChild(heading);
        contacts.forEach((contact) => section.appendChild(contactItem(contact)));
        return section;
    }

    function renderContacts(data) {
        const container = el('contact-list');
        if (!container) return;
        container.replaceChildren();
        const groups = [
            ['Supervisión', data.supervisores],
            ['Administración', data.administradores]
        ];
        let total = 0;
        groups.forEach(([title, contacts]) => {
            const section = contactSection(title, contacts);
            if (section) {
                container.appendChild(section);
                total += contacts.length;
            }
        });
        if (!total) {
            const empty = document.createElement('p');
            empty.className = 'contact-empty';
            empty.textContent = 'No hay contactos de escalamiento configurados.';
            container.appendChild(empty);
        }
    }

    async function loadContacts() {
        try {
            renderContacts(await apiClient.get('/equipo/contactos'));
        } catch (error) {
            const container = el('contact-list');
            if (container) container.textContent = 'No se pudieron cargar los contactos.';
        }
    }

    personalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        profileError.textContent = '';
        const fullname = el('profile-fullname').value.trim();
        const email = el('profile-email').value.trim();
        const backupEmail = el('profile-backup-email').value.trim();
        const phone = el('profile-phone').value.trim();

        const submit = personalForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            const updated = await apiClient.put('/auth/me', {
                nombre_completo: fullname || null,
                email,
                email_respaldo: backupEmail || null,
                telefono_respaldo: phone || null
            });
            renderProfile(updated);
            showToast('Datos personales actualizados', 'success');
        } catch (error) {
            profileError.textContent = error.message;
        } finally {
            submit.disabled = false;
        }
    });

    passwordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        passwordError.textContent = '';
        const currentPassword = el('current-password').value;
        const newPassword = el('new-password').value;
        const confirmPassword = el('confirm-password').value;

        if (newPassword !== confirmPassword) {
            passwordError.textContent = 'La confirmación no coincide con la nueva contraseña.';
            return;
        }

        const submit = passwordForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            await apiClient.put('/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword
            });
            showToast('Contraseña actualizada correctamente', 'success');
            passwordForm.reset();
            updateStrength('');
        } catch (error) {
            passwordError.textContent = error.message;
        } finally {
            submit.disabled = false;
        }
    });

    document.querySelectorAll('.password-toggle').forEach((button) => {
        button.addEventListener('click', () => {
            const input = el(button.dataset.target);
            if (!input) return;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            const icon = button.querySelector('i');
            if (icon) icon.className = show ? 'ph ph-eye-slash' : 'ph ph-eye';
            button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
        });
    });

    function scorePassword(value) {
        if (!value) return 0;
        let score = 0;
        if (value.length >= 12) score += 1;
        if (value.length >= 16) score += 1;
        if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
        if (/\d/.test(value)) score += 1;
        if (/[^A-Za-z0-9]/.test(value)) score += 1;
        return Math.min(score, 5);
    }

    function updateStrength(value) {
        const wrapper = el('password-strength');
        const fill = el('strength-fill');
        const label = el('strength-label');
        if (!wrapper || !fill || !label) return;
        if (!value) {
            wrapper.hidden = true;
            fill.style.width = '0%';
            return;
        }
        const score = scorePassword(value);
        const levels = [
            { width: '12%', text: 'Muy débil', color: 'var(--g-danger)' },
            { width: '28%', text: 'Débil', color: 'var(--g-danger)' },
            { width: '48%', text: 'Aceptable', color: 'var(--g-warning)' },
            { width: '70%', text: 'Buena', color: 'var(--g-warning)' },
            { width: '88%', text: 'Fuerte', color: 'var(--g-success)' },
            { width: '100%', text: 'Excelente', color: 'var(--g-success)' }
        ];
        const level = levels[Math.min(score, levels.length - 1)];
        wrapper.hidden = false;
        fill.style.width = level.width;
        fill.style.background = level.color;
        label.textContent = `${level.text} · mínimo 12 caracteres`;
    }

    const newPasswordInput = el('new-password');
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', (event) => updateStrength(event.target.value));
    }

    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
        button.addEventListener('click', () => {
            const theme = button.dataset.themeChoice;
            document.documentElement.setAttribute('data-theme', theme);
            try {
                localStorage.setItem('aqua_theme', theme);
            } catch (error) {
                /* almacenamiento no disponible */
            }
            renderPreferences();
            showToast(`Tema ${theme === 'dark' ? 'oscuro' : 'claro'} activado`, 'info');
        });
    });

    loadProfile();
    loadStats();
    loadContacts();
});
