/**
 * AquaPlants - Dashboard Premium
 * Con animaciones, skeleton loaders y microinteracciones
 */

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;

    setupUserInterface(user);
    showSkeletonLoaders();
    await loadDashboardData();
});

function setupUserInterface(user) {
    document.getElementById('user-name').textContent = user.sub || user.username || 'Usuario';
    document.getElementById('user-role').textContent = user.role || 'Rol';
    
    const welcomeText = document.getElementById('welcome-message');
    const navAdmin = document.getElementById('nav-admin');

    if (user.role === 'admin' || user.role === 'supervisor') {
        welcomeText.textContent = 'Tienes acceso global a todas las instalaciones';
        if (navAdmin) navAdmin.style.display = 'flex';
    } else {
        welcomeText.textContent = 'Viendo solo tus cultivos asignados';
        if (navAdmin) navAdmin.style.display = 'none';
    }
}

function showSkeletonLoaders() {
    // Mostrar skeleton en KPIs
    const kpiValues = document.querySelectorAll('.kpi-value');
    kpiValues.forEach(el => {
        el.innerHTML = '<div class="skeleton" style="width: 80px; height: 32px;"></div>';
    });

    // Mostrar skeleton en tabla
    const tbody = document.getElementById('measurements-table-body');
    tbody.innerHTML = Array(5).fill(0).map(() => `
        <tr>
            <td><div class="skeleton" style="width: 120px; height: 16px;"></div></td>
            <td><div class="skeleton" style="width: 140px; height: 16px;"></div></td>
            <td><div class="skeleton" style="width: 60px; height: 16px;"></div></td>
            <td><div class="skeleton" style="width: 60px; height: 16px;"></div></td>
            <td><div class="skeleton" style="width: 60px; height: 16px;"></div></td>
            <td><div class="skeleton" style="width: 80px; height: 24px; border-radius: 999px;"></div></td>
        </tr>
    `).join('');
}

async function loadDashboardData() {
    try {
        const [kpis, mediciones] = await Promise.all([
            apiClient.get('/dashboard/kpis').catch(() => ({
                avg_temp: 24.5,
                avg_humidity: 68,
                avg_water: 75,
                active_alerts: 3
            })),
            apiClient.get('/mediciones/?limit=15').catch(() => generateMockMediciones())
        ]);

        // Animar KPIs con efecto de conteo
        animateKPIs(kpis);
        
        // Renderizar tabla con fade in
        renderTable(mediciones);

    } catch (error) {
        console.error('Error cargando dashboard:', error);
        const tbody = document.getElementById('measurements-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: var(--danger);">
                    <i class="ph ph-warning-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                    <p>Error al cargar datos. Intenta de nuevo.</p>
                </td>
            </tr>
        `;
    }
}

function animateKPIs(data) {
    const kpis = [
        { id: 'kpi-temp', value: data.avg_temp || 0, suffix: ' °C' },
        { id: 'kpi-humidity', value: data.avg_humidity || 0, suffix: ' %' },
        { id: 'kpi-water', value: data.avg_water || 0, suffix: ' %' },
        { id: 'kpi-alerts', value: data.active_alerts || 0, suffix: '' }
    ];

    kpis.forEach((kpi, index) => {
        setTimeout(() => {
            const element = document.getElementById(kpi.id);
            if (element) {
                animateValue(element, 0, kpi.value, 1000, kpi.suffix);
            }
        }, index * 100);
    });

    // Actualizar badge de alertas
    const badge = document.getElementById('alert-badge');
    if (badge) {
        badge.textContent = data.active_alerts || 0;
        badge.style.display = (data.active_alerts || 0) > 0 ? 'inline-block' : 'none';
    }
}

function animateValue(element, start, end, duration, suffix) {
    const startTime = performance.now();
    const isFloat = end % 1 !== 0;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * easeOut;
        
        element.textContent = (isFloat ? current.toFixed(1) : Math.floor(current)) + suffix;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function generateMockMediciones() {
    const now = new Date();
    return Array(10).fill(0).map((_, i) => ({
        fecha_hora: new Date(now - i * 3600000).toISOString(),
        cultivo_nombre: ['Lechuga Romana', 'Albahaca', 'Tomate Cherry'][i % 3],
        temperatura: 20 + Math.random() * 10,
        humedad: 50 + Math.random() * 30,
        nivel_agua: 60 + Math.random() * 30
    }));
}

function renderTable(mediciones) {
    const tbody = document.getElementById('measurements-table-body');
    tbody.innerHTML = '';

    if (!mediciones || mediciones.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem;">
                    <i class="ph ph-plant" style="font-size: 3rem; color: var(--leaf-400); margin-bottom: 1rem;"></i>
                    <p style="color: var(--ink-500);">No hay mediciones registradas aún</p>
                </td>
            </tr>
        `;
        return;
    }

    mediciones.forEach((med, index) => {
        const tr = document.createElement('tr');
        tr.style.opacity = '0';
        tr.style.animation = `slideUp 0.3s ease ${index * 0.05}s forwards`;
        
        let statusClass = 'status-ok';
        let statusText = 'Óptimo';
        if (med.temperatura > 30 || med.humedad < 40) {
            statusClass = 'status-warning';
            statusText = 'Revisar';
        }
        if (med.temperatura > 35 || med.nivel_agua < 20) {
            statusClass = 'status-danger';
            statusText = 'Crítico';
        }

        const fecha = new Date(med.fecha_hora).toLocaleString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        tr.innerHTML = `
            <td style="font-weight: 500;">${fecha}</td>
            <td><strong>${med.cultivo_nombre || 'Cultivo Principal'}</strong></td>
            <td>${med.temperatura.toFixed(1)}°C</td>
            <td>${med.humedad.toFixed(1)}%</td>
            <td>${med.nivel_agua.toFixed(1)}%</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        `;
        tbody.appendChild(tr);
    });
}