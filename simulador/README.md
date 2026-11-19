# Simulador IoT

Banco de pruebas para generar mediciones de sensores sin hardware. Envía lecturas reales a
`POST /api/mediciones/`, por lo que alimenta los dashboards, los históricos y el motor de alertas.

## Requisitos

- Backend FastAPI en `http://127.0.0.1:8000` (`uvicorn main:app --reload`).
- Servidor estático en `http://127.0.0.1:5500` (`python -m http.server 5500`).
- Sesión iniciada con un usuario **admin**.

## Uso

1. Abre `http://127.0.0.1:5500/simulador/index.html` (o el enlace **Simulador IoT** del menú admin).
2. Elige el cultivo destino.
3. Ajusta los sliders o aplica un escenario: Óptimo, Calor extremo, Humedad baja, Agua crítica, Aleatorio.
4. Pulsa **Enviar ahora** para una lectura puntual o **Iniciar simulación** para enviar cada 3/5/10 s.
5. Revisa el registro: cada fila indica si la medición generó alertas.

## Umbrales usados por el backend

| Parámetro | Regla | Severidad |
| --- | --- | --- |
| Temperatura | `> 30 °C` | `critical` |
| Humedad | `< 40 %` | `warning` |
| Nivel de agua | `< 20 %` | `critical` |

El pH se registra pero no genera alertas. Cada envío aparece en los dashboards y en los
históricos, por lo que las ventanas de 24 h / 7 d / 30 d dejan de estar vacías tras simular.
