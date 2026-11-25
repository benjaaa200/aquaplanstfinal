/* =========================================================
   AquaPlants · Simulador de sensores IoT
   Envía mediciones reales al endpoint /api/mediciones/ para
   probar dashboards, históricos y alertas sin hardware.
   ========================================================= */
(function () {
    'use strict';

    var THRESHOLDS = {
        tempMax: 30,
        humMin: 40,
        waterMin: 20,
        phMin: 5.5,
        phMax: 7.5
    };

    var SCENARIOS = {
        optimal: { temp: [23, 26], hum: [60, 72], water: [65, 80], ph: [5.8, 6.6] },
        heat: { temp: [32, 36], hum: [42, 52], water: [50, 65], ph: [6.0, 6.8] },
        dry: { temp: [25, 28], hum: [28, 36], water: [55, 70], ph: [6.0, 6.6] },
        water: { temp: [25, 29], hum: [55, 70], water: [8, 16], ph: [5.8, 6.5] },
        random: { temp: [15, 38], hum: [20, 90], water: [5, 95], ph: [4.5, 8.5] }
    };

    var state = {
        timer: null,
        sending: false,
        sent: 0,
        alerts: 0,
        scenario: 'optimal',
        crops: []
    };

    var els = {};

    function $(id) { return document.getElementById(id); }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function number(value) {
        return Math.round(Number(value) * 10) / 10;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function randomBetween(min, max) {
        return number(min + Math.random() * (max - min));
    }

    function init() {
        var user = checkAuth();
        if (!user) return;
        var role = String(user.role || user.rol || '').toLowerCase();
        if (role !== 'admin' && role !== 'administrador') {
            location.replace('../pages/dashboard.html');
            return;
        }

        els = {
            status: $('simStatus'),
            statusText: $('simStatusText'),
            crop: $('simCultivo'),
            temp: $('simTemp'),
            hum: $('simHum'),
            water: $('simWater'),
            ph: $('simPh'),
            tempValue: $('simTempValue'),
            humValue: $('simHumValue'),
            waterValue: $('simWaterValue'),
            phValue: $('simPhValue'),
            readingTemp: $('readingTemp'),
            readingHum: $('readingHum'),
            readingWater: $('readingWater'),
            readingPh: $('readingPh'),
            readingTempValue: $('readingTempValue'),
            readingHumValue: $('readingHumValue'),
            readingWaterValue: $('readingWaterValue'),
            readingPhValue: $('readingPhValue'),
            alertPreview: $('simAlertPreview'),
            sent: $('simSent'),
            alerts: $('simAlerts'),
            intervalLabel: $('simIntervalLabel'),
            last: $('simLast'),
            logBody: $('simLogBody'),
            start: $('simStart'),
            stop: $('simStop'),
            send: $('simSend'),
            clear: $('simClear'),
            interval: $('simInterval')
        };

        bindEvents();
        applyScenario('optimal', false);
        loadCrops();
        refresh();
    }

    function bindEvents() {
        [els.temp, els.hum, els.water, els.ph].forEach(function (input) {
            input.addEventListener('input', function () {
                setScenario('custom', false);
                refresh();
            });
        });

        document.querySelectorAll('.sim-scenario').forEach(function (button) {
            button.addEventListener('click', function () {
                applyScenario(button.dataset.scenario, true);
            });
        });

        els.start.addEventListener('click', start);
        els.stop.addEventListener('click', stop);
        els.send.addEventListener('click', function () { sendMeasurement(true); });
        els.clear.addEventListener('click', clearLog);
        els.interval.addEventListener('change', function () {
            els.intervalLabel.textContent = (Number(els.interval.value) / 1000) + ' s';
            if (state.timer) {
                start();
            }
        });
    }

    function loadCrops() {
        apiClient.get('/cultivos/').then(function (crops) {
            state.crops = Array.isArray(crops) ? crops : [];
            if (!state.crops.length) {
                els.crop.innerHTML = '<option value="">No hay cultivos registrados</option>';
                return;
            }
            els.crop.innerHTML = state.crops.map(function (crop) {
                var label = crop.nombre || ('Cultivo #' + crop.id);
                if (crop.ubicacion) label += ' · ' + crop.ubicacion;
                return '<option value="' + crop.id + '">' + escapeHtml(label) + '</option>';
            }).join('');
        }).catch(function (error) {
            els.crop.innerHTML = '<option value="">No se pudieron cargar los cultivos</option>';
            logError('No se pudieron cargar los cultivos: ' + error.message);
        });
    }

    function applyScenario(name, announce) {
        var range = SCENARIOS[name];
        if (!range) return;
        state.scenario = announce ? name : state.scenario;
        setSlider(els.temp, randomBetween(range.temp[0], range.temp[1]));
        setSlider(els.hum, randomBetween(range.hum[0], range.hum[1]));
        setSlider(els.water, randomBetween(range.water[0], range.water[1]));
        setSlider(els.ph, randomBetween(range.ph[0], range.ph[1]));
        markScenario(name);
        refresh();
    }

    function setScenario(name, announce) {
        state.scenario = name;
        markScenario(name);
        if (announce) refresh();
    }

    function markScenario(name) {
        document.querySelectorAll('.sim-scenario').forEach(function (button) {
            button.classList.toggle('active', button.dataset.scenario === name);
        });
    }

    function setSlider(input, value) {
        input.value = String(clamp(number(value), Number(input.min), Number(input.max)));
    }

    function readValues() {
        return {
            temperatura: number(els.temp.value),
            humedad: number(els.hum.value),
            nivel_agua: number(els.water.value),
            ph: number(els.ph.value)
        };
    }

    function refresh() {
        var values = readValues();

        els.tempValue.textContent = values.temperatura.toFixed(1);
        els.humValue.textContent = values.humedad.toFixed(1);
        els.waterValue.textContent = values.nivel_agua.toFixed(1);
        els.phValue.textContent = values.ph.toFixed(1);

        els.readingTempValue.textContent = values.temperatura.toFixed(1);
        els.readingHumValue.textContent = values.humedad.toFixed(1);
        els.readingWaterValue.textContent = values.nivel_agua.toFixed(1);
        els.readingPhValue.textContent = values.ph.toFixed(1);

        paintSlider(els.temp);
        paintSlider(els.hum);
        paintSlider(els.water);
        paintSlider(els.ph);

        els.readingTemp.className = 'sim-reading' +
            (values.temperatura > 33 ? ' is-danger' : (values.temperatura > THRESHOLDS.tempMax ? ' is-warning' : ''));
        els.readingHum.className = 'sim-reading' + (values.humedad < THRESHOLDS.humMin ? ' is-warning' : '');
        els.readingWater.className = 'sim-reading' + (values.nivel_agua < THRESHOLDS.waterMin ? ' is-danger' : '');
        els.readingPh.className = 'sim-reading' +
            (values.ph < THRESHOLDS.phMin - 0.5 || values.ph > THRESHOLDS.phMax + 0.5 ? ' is-danger' :
                (values.ph < THRESHOLDS.phMin || values.ph > THRESHOLDS.phMax ? ' is-warning' : ''));

        renderAlertPreview(values);
    }

    function paintSlider(input) {
        var min = Number(input.min);
        var max = Number(input.max);
        var pct = ((Number(input.value) - min) / (max - min)) * 100;
        input.style.setProperty('--fill', pct + '%');
    }

    function predictedAlerts(values) {
        var alerts = [];
        if (values.temperatura > THRESHOLDS.tempMax) {
            alerts.push({ level: 'danger', text: 'Temperatura sobre el máximo de ' + THRESHOLDS.tempMax + ' °C' });
        }
        if (values.humedad < THRESHOLDS.humMin) {
            alerts.push({ level: 'warning', text: 'Humedad bajo el mínimo de ' + THRESHOLDS.humMin + ' %' });
        }
        if (values.nivel_agua < THRESHOLDS.waterMin) {
            alerts.push({ level: 'danger', text: 'Nivel de agua bajo el mínimo de ' + THRESHOLDS.waterMin + ' %' });
        }
        return alerts;
    }

    function renderAlertPreview(values) {
        var alerts = predictedAlerts(values);
        if (!alerts.length) {
            els.alertPreview.innerHTML = '<div class="alert-line"><i class="ph ph-check-circle"></i> Todos los parámetros dentro de rango</div>';
            return;
        }
        els.alertPreview.innerHTML = alerts.map(function (alert) {
            var icon = alert.level === 'danger' ? 'ph-warning-octagon' : 'ph-warning';
            return '<div class="alert-line ' + alert.level + '"><i class="ph ' + icon + '"></i> ' + alert.text + '</div>';
        }).join('');
    }

    function jitter(value, amount, min, max) {
        return clamp(number(value + (Math.random() * 2 - 1) * amount), min, max);
    }

    function evolveValues() {
        var current = readValues();
        var range = SCENARIOS[state.scenario];

        if (range) {
            setSlider(els.temp, randomBetween(range.temp[0], range.temp[1]));
            setSlider(els.hum, randomBetween(range.hum[0], range.hum[1]));
            setSlider(els.water, randomBetween(range.water[0], range.water[1]));
            setSlider(els.ph, randomBetween(range.ph[0], range.ph[1]));
        } else {
            setSlider(els.temp, jitter(current.temperatura, 0.35, 10, 40));
            setSlider(els.hum, jitter(current.humedad, 1.6, 0, 100));
            setSlider(els.water, jitter(current.nivel_agua, 1.2, 0, 100));
            setSlider(els.ph, jitter(current.ph, 0.06, 3, 9));
        }
        refresh();
        return readValues();
    }

    function start() {
        if (state.timer) clearInterval(state.timer);
        els.status.classList.add('is-running');
        els.statusText.textContent = 'Simulación activa';
        els.start.disabled = true;
        els.stop.disabled = false;
        state.timer = setInterval(function () {
            sendMeasurement(false);
        }, Number(els.interval.value));
        sendMeasurement(false);
    }

    function stop() {
        if (state.timer) clearInterval(state.timer);
        state.timer = null;
        els.status.classList.remove('is-running');
        els.statusText.textContent = 'Detenido';
        els.start.disabled = false;
        els.stop.disabled = true;
    }

    function sendMeasurement(manual) {
        if (state.sending) return;

        var cropId = Number(els.crop.value);
        if (!cropId) {
            logError('Selecciona un cultivo antes de enviar mediciones.');
            if (manual) stop();
            return;
        }

        var values = manual ? readValues() : evolveValues();
        var alerts = predictedAlerts(values);
        var payload = {
            cultivo_id: cropId,
            temperatura: values.temperatura,
            humedad: values.humedad,
            nivel_agua: values.nivel_agua,
            ph: values.ph
        };

        state.sending = true;
        els.send.disabled = true;

        apiClient.post('/mediciones/', payload).then(function (measurement) {
            state.sent += 1;
            state.alerts += alerts.length;
            els.sent.textContent = state.sent;
            els.alerts.textContent = state.alerts;
            els.last.textContent = new Date().toLocaleTimeString('es-CL', { hour12: false });
            addLogRow(payload, alerts, measurement, null);
            if (window.AquaUI && window.AquaUI.refresh) window.AquaUI.refresh();
        }).catch(function (error) {
            logError('Error al enviar la medición: ' + error.message);
            stop();
        }).finally(function () {
            state.sending = false;
            els.send.disabled = false;
        });
    }

    function cropName(id) {
        var crop = state.crops.find(function (item) { return Number(item.id) === Number(id); });
        return crop ? (crop.nombre || ('Cultivo #' + crop.id)) : ('Cultivo #' + id);
    }

    function addLogRow(values, alerts, measurement, error) {
        clearEmptyLog();
        var row = document.createElement('tr');
        var statusHtml;

        if (error) {
            statusHtml = '<span class="sim-state error" title="' + escapeHtml(error) + '">Error</span>';
        } else if (alerts.length) {
            statusHtml = '<span class="sim-state alert">Alerta generada (' + alerts.length + ')</span>';
        } else {
            statusHtml = '<span class="sim-state ok">Recibida</span>';
        }

        row.innerHTML =
            '<td>' + new Date().toLocaleTimeString('es-CL', { hour12: false }) + '</td>' +
            '<td>' + escapeHtml(cropName(values.cultivo_id)) + '</td>' +
            '<td>' + values.temperatura.toFixed(1) + ' °C</td>' +
            '<td>' + values.humedad.toFixed(1) + ' %</td>' +
            '<td>' + values.nivel_agua.toFixed(1) + ' %</td>' +
            '<td>' + values.ph.toFixed(1) + '</td>' +
            '<td>' + statusHtml +
                (measurement && measurement.id ? ' <span style="color:var(--g-muted);font-size:10.5px;">#' + measurement.id + '</span>' : '') +
            '</td>';

        els.logBody.insertBefore(row, els.logBody.firstChild);
        while (els.logBody.children.length > 50) {
            els.logBody.removeChild(els.logBody.lastChild);
        }
    }

    function logError(message) {
        clearEmptyLog();
        var row = document.createElement('tr');
        row.innerHTML =
            '<td>' + new Date().toLocaleTimeString('es-CL', { hour12: false }) + '</td>' +
            '<td colspan="5" style="color:var(--g-danger);">' + escapeHtml(message) + '</td>' +
            '<td><span class="sim-state error">Error</span></td>';
        els.logBody.insertBefore(row, els.logBody.firstChild);
    }

    function clearEmptyLog() {
        var empty = els.logBody.querySelector('.sim-log-empty');
        if (empty) els.logBody.innerHTML = '';
    }

    function clearLog() {
        els.logBody.innerHTML = '<tr><td colspan="7" class="sim-log-empty">Aún no se han enviado mediciones en esta sesión.</td></tr>';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
