/**
 * AquaPlants - Lógica de Reportes (datos reales)
 */

let reportHistory = [];

const REPORT_LABELS = {
    mediciones: 'Mediciones IoT',
    alertas: 'Alertas Generadas',
    riego: 'Consumo de Riego',
    cultivos: 'Estado de Cultivos',
    dispositivos: 'Estado de Dispositivos'
};

document.addEventListener('DOMContentLoaded', async () => {
    const user = checkAuth();
    if (!user) return;

    setupUserInterface(user);
    await loadCultivos();
    await loadReportsHistory();

    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    document.getElementById('report-start').value = toDateInput(weekAgo);
    document.getElementById('report-end').value = toDateInput(today);
});

function toDateInput(date) {
    return date.toISOString().split('T')[0];
}

function isoStart(dateValue) {
    return `${dateValue}T00:00:00`;
}

function isoEnd(dateValue) {
    return `${dateValue}T23:59:59`;
}

function setupUserInterface(user) {
    document.getElementById('user-name').textContent = user.name || user.sub || user.username || 'Usuario';
    document.getElementById('user-role').textContent = user.role || 'Rol';

    const roleIndicator = document.getElementById('role-indicator');
    if (String(user.role).toLowerCase() === 'encargado') {
        roleIndicator.textContent = 'Genera reportes de tus cultivos asignados';
    } else {
        roleIndicator.textContent = 'Generación y exportación de informes del sistema';
    }
}

async function loadCultivos() {
    const select = document.getElementById('report-cultivo');
    try {
        const cultivos = await apiClient.get('/cultivos/');
        select.innerHTML = '<option value="all">Todos los cultivos</option>';
        cultivos.forEach((cultivo) => {
            const option = document.createElement('option');
            option.value = cultivo.id;
            option.textContent = `${cultivo.nombre} - ${cultivo.ubicacion || 'Sin ubicación'}`;
            select.appendChild(option);
        });
    } catch (error) {
        select.innerHTML = '<option value="all">Todos los cultivos</option>';
        showToast(error.message, 'error');
    }
}

function currentFilters() {
    const tipo = document.getElementById('report-type').value;
    const cultivo = document.getElementById('report-cultivo').value;
    const start = document.getElementById('report-start').value;
    const end = document.getElementById('report-end').value;
    return {
        tipo,
        cultivo_id: cultivo === 'all' ? null : Number(cultivo),
        fecha_inicio: isoStart(start),
        fecha_fin: isoEnd(end),
        formato: document.getElementById('report-format').value
    };
}

function queryString(filters) {
    const params = new URLSearchParams({
        tipo: filters.tipo,
        fecha_inicio: filters.fecha_inicio,
        fecha_fin: filters.fecha_fin
    });
    if (filters.cultivo_id) params.set('cultivo_id', filters.cultivo_id);
    return params.toString();
}

async function fetchSummary(filters) {
    return apiClient.get(`/reportes/resumen?${queryString(filters)}`);
}

async function fetchCsv(filters) {
    const response = await fetch(
        `${API_BASE_URL}/reportes/export?${queryString(filters)}&formato=csv`,
        { headers: getAuthHeaders() }
    );
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Error HTTP ${response.status}`);
    }
    return response.text();
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                field += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n') {
            row.push(field.replace(/\r$/, ''));
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += character;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
    }
    return rows.filter((item) => item.some((cell) => cell !== ''));
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

function buildFilename(filters) {
    const base = `reporte_${filters.tipo}_${filters.fecha_inicio.slice(0, 10)}_${filters.fecha_fin.slice(0, 10)}`;
    const extension = filters.formato === 'excel' ? 'xlsx' : filters.formato;
    return `${base}.${extension}`;
}

async function buildReportFile(filters) {
    const csvText = await fetchCsv(filters);
    const rows = parseCsv(csvText);
    const header = rows[0] || [];
    const dataRows = rows.slice(1);
    const tipoLabel = REPORT_LABELS[filters.tipo] || filters.tipo;
    const filename = buildFilename(filters);

    let blob;
    if (filters.formato === 'pdf') {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('No se pudo cargar el generador de PDF');
        }
        const doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
        doc.setFontSize(16);
        doc.text(`AquaPlants - ${tipoLabel}`, 14, 18);
        doc.setFontSize(10);
        doc.text(`Periodo: ${filters.fecha_inicio} a ${filters.fecha_fin}`, 14, 26);
        let y = 34;
        const lines = [header.join(' | ')].concat(
            dataRows.slice(0, 40).map((row) => row.join(' | '))
        );
        lines.forEach((line) => {
            if (y > 200) {
                doc.addPage();
                y = 20;
            }
            doc.text(String(line).slice(0, 180), 14, y);
            y += 6;
        });
        if (dataRows.length > 40) {
            doc.text(`... ${dataRows.length - 40} registros adicionales`, 14, y);
        }
        blob = doc.output('blob');
    } else if (filters.formato === 'excel') {
        if (!window.XLSX) {
            throw new Error('No se pudo cargar el generador de Excel');
        }
        const workbook = window.XLSX.utils.book_new();
        const sheet = window.XLSX.utils.aoa_to_sheet(rows);
        window.XLSX.utils.book_append_sheet(workbook, sheet, 'Reporte');
        const buffer = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
    } else {
        blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
    }

    return { blob, filename, totalRegistros: dataRows.length };
}

async function handleGenerateReport(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Generando...';
    submitBtn.disabled = true;

    const filters = currentFilters();
    try {
        const { blob, filename, totalRegistros } = await buildReportFile(filters);

        saveBlob(blob, filename);
        await apiClient.post('/reportes/historial', {
            tipo: filters.tipo,
            cultivo_id: filters.cultivo_id,
            fecha_inicio: filters.fecha_inicio,
            fecha_fin: filters.fecha_fin,
            formato: filters.formato,
            total_registros: totalRegistros,
            tamano_bytes: blob.size
        });
        await loadReportsHistory();
        showToast(`Reporte ${filters.formato.toUpperCase()} generado con ${totalRegistros} registros`, 'success');
    } catch (error) {
        showToast(`Error al generar reporte: ${error.message}`, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function generateQuickReport(type) {
    const today = new Date();
    let days = 7;
    let tipoReporte = 'mediciones';

    if (type === 'daily') days = 1;
    if (type === 'weekly') days = 7;
    if (type === 'monthly') days = 30;
    if (type === 'alerts') {
        days = 30;
        tipoReporte = 'alertas';
    }

    const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
    document.getElementById('report-type').value = tipoReporte;
    document.getElementById('report-start').value = toDateInput(startDate);
    document.getElementById('report-end').value = toDateInput(today);
    document.getElementById('report-format').value = 'pdf';
    showToast('Reporte configurado. Pulsa "Generar y Descargar".', 'info');
}

async function previewReport() {
    const modal = document.getElementById('preview-modal');
    const content = document.getElementById('preview-content');
    modal.classList.add('active');
    content.innerHTML = '<div class="loading-state"><i class="ph ph-spinner ph-spin"></i><p>Generando vista previa...</p></div>';

    const filters = currentFilters();
    try {
        const summary = await fetchSummary(filters);
        const entries = Object.entries(summary.resumen)
            .map(([key, value]) => {
                const label = key.replace(/_/g, ' ');
                const formatted = typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : value;
                return `<p><strong>${label}:</strong> ${formatted}</p>`;
            })
            .join('');

        content.innerHTML = `
            <div style="padding: 1rem;">
                <h3 style="font-family: var(--font-heading); margin-bottom: 1rem;">Vista previa del reporte</h3>
                <div style="background: var(--color-bg); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                    <p><strong>Tipo:</strong> ${REPORT_LABELS[filters.tipo] || filters.tipo}</p>
                    <p><strong>Cultivo:</strong> ${filters.cultivo_id ? `#${filters.cultivo_id}` : 'Todos'}</p>
                    <p><strong>Periodo:</strong> ${filters.fecha_inicio} a ${filters.fecha_fin}</p>
                </div>
                <div style="background: var(--color-bg); padding: 1rem; border-radius: 8px;">
                    ${entries || '<p>Sin datos en el periodo seleccionado.</p>'}
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="empty-state"><p>${error.message}</p></div>`;
    }
}

function closePreviewModal() {
    document.getElementById('preview-modal').classList.remove('active');
}

function downloadFromPreview() {
    closePreviewModal();
    document.getElementById('report-form').requestSubmit();
}

function downloadReport(report) {
    const filters = {
        tipo: report.tipo,
        cultivo_id: report.cultivo_id || null,
        fecha_inicio: report.fecha_inicio,
        fecha_fin: report.fecha_fin,
        formato: report.formato
    };
    return buildReportFile(filters)
        .then(({ blob, filename }) => saveBlob(blob, filename))
        .catch((error) => showToast(error.message, 'error'));
}

async function loadReportsHistory() {
    try {
        reportHistory = await apiClient.get('/reportes/historial');
        renderReportsHistory();
    } catch (error) {
        reportHistory = [];
        renderReportsHistory();
        showToast(error.message, 'error');
    }
}

function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderReportsHistory() {
    const tbody = document.getElementById('reports-table-body');
    tbody.innerHTML = '';

    if (!reportHistory || reportHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No hay reportes generados</td></tr>';
        return;
    }

    reportHistory.forEach((report) => {
        const tr = document.createElement('tr');
        const fecha = new Date(report.fecha_generacion).toLocaleString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const formatClass = `format-${report.formato}`;
        const periodo = `${String(report.fecha_inicio).slice(0, 10)} a ${String(report.fecha_fin).slice(0, 10)}`;
        const tipo = REPORT_LABELS[report.tipo] || report.tipo;
        const cultivo = report.cultivo_nombre || 'Todos';

        tr.innerHTML = `
            <td>${fecha}</td>
            <td>${tipo}</td>
            <td>${cultivo}</td>
            <td>${periodo}</td>
            <td><span class="format-badge ${formatClass}">${report.formato}</span></td>
            <td>${formatBytes(report.tamano_bytes)}</td>
            <td>
                <button class="action-btn" onclick="downloadExistingReport(${report.id})" title="Descargar"><i class="ph ph-download-simple"></i></button>
                <button class="action-btn" onclick="deleteReport(${report.id})" title="Eliminar"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function downloadExistingReport(id) {
    const report = reportHistory.find((item) => item.id === id);
    if (report) {
        return downloadReport(report);
    }
    return null;
}

async function deleteReport(id) {
    if (!confirm('¿Eliminar este reporte del historial?')) return;
    try {
        await apiClient.delete(`/reportes/historial/${id}`);
        await loadReportsHistory();
        showToast('Reporte eliminado del historial', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

document.getElementById('preview-modal').addEventListener('click', (event) => {
    if (event.target.id === 'preview-modal') closePreviewModal();
});
