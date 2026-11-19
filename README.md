# AquaPlants

Sistema web para monitorear cultivos hidropónicos, mediciones, alertas y usuarios.

## Arquitectura oficial

- **Frontend:** HTML, CSS y JavaScript sin framework, servido como archivos estáticos.
- **API oficial:** FastAPI en `main.py`, con autenticación JWT.
- **Base de datos oficial:** PostgreSQL, conexión SQLAlchemy en `backend/database.py`.

La base incluye usuarios, cultivos, instalaciones, dispositivos, mediciones, alertas, riegos, umbrales, reportes generados y asignaciones de cultivos. `create_all` crea tablas nuevas, pero **no migra tablas existentes**. Al iniciar, la API crea las tablas nuevas, agrega de forma aditiva la relación opcional entre cultivos e instalaciones, las columnas de resolución de alertas y el índice único de asignaciones. Haz copia de seguridad antes de actualizar y no borres la base.

## Credenciales de acceso (desarrollo)

Las cuentas de demostración se crean solo al inicializar una base vacía con
`python scripts\setup_db.py`. Define sus contraseñas en `.env` mediante
`AQUAPLANTS_ADMIN_PASSWORD` y variables propias de cada entorno; no se publican
contraseñas en el repositorio.

| Rol | Usuario | Email |
| --- | --- | --- |
| Administrador | `admin` | admin@aquaplants.cl |
| Supervisor | `supervisor` | supervisor@aquaplants.cl |
| Encargado | `encargado` | encargado@aquaplants.cl |

> Usa contraseñas únicas por entorno y rótalas antes de desplegar.

## Requisitos

- Python 3.10 o superior.
- PostgreSQL accesible (local o RDS) y una cuenta con permisos sobre la base de AquaPlants.
- Navegador moderno.

## Configuración en Windows

Desde la carpeta del proyecto, abre PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edita `.env` y establece `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE` (`require` para RDS, `disable` para PostgreSQL local sin TLS) y una `SECRET_KEY` aleatoria de al menos 32 caracteres. En producción, define `SKIP_INIT_DB=1` para que la API no ejecute DDL automático. Puedes generar la clave con:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

No compartas ni subas `.env`. Si la base todavía está vacía, configura también `AQUAPLANTS_ADMIN_USERNAME`, `AQUAPLANTS_ADMIN_EMAIL` y `AQUAPLANTS_ADMIN_PASSWORD` (mínimo 12 caracteres), y ejecuta una vez:

```powershell
python scripts\setup_db.py
```

El script crea el esquema e inserta datos de demostración únicamente si no hay usuarios. En una base que ya contiene usuarios, no cambia contraseñas ni datos.

Para crear solamente las tablas, sin transferir ni insertar datos, ejecuta `python scripts\setup_db.py --schema-only`. Después, inicia la API:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Para atender a más usuarios simultáneos, usa el lanzador con varios procesos (ajusta `API_WORKERS` al número de núcleos disponibles):

```powershell
$env:API_WORKERS = "4"
python serve.py
```

El pool de base de datos se reparte entre workers: el total de conexiones es `API_WORKERS * (DB_POOL_SIZE + DB_MAX_OVERFLOW)` y debe quedar por debajo de `max_connections` de PostgreSQL. Los valores por defecto (1 worker, 10 + 20) consumen 30 conexiones.

En una segunda terminal, sirve el frontend:

```powershell
python -m http.server 5500 --bind 127.0.0.1
```

Abre <http://127.0.0.1:5500/>. La documentación interactiva de la API está en <http://127.0.0.1:8000/docs> y su verificación de salud en <http://127.0.0.1:8000/api/health>.

Para desplegar en otros orígenes, configura explícitamente `CORS_ORIGINS` como una lista separada por comas. No uses `*` con credenciales habilitadas.

## Despliegue

La vía reproducible incluye Docker, PostgreSQL, API y frontend con proxy `/api`:

```powershell
Copy-Item .env.example .env
# Define DB_PASSWORD, SECRET_KEY y AQUAPLANTS_ADMIN_* en .env
docker compose up -d --build
```

- Frontend: <http://localhost:5500>
- API: <http://localhost:8000/docs>
- Salud: <http://localhost:8000/api/health>

Para publicar en un servidor o PaaS, TLS, variables de producción, respaldos y
evidencia de despliegue, sigue [docs/despliegue.md](docs/despliegue.md).

## Roles y autorización

- `admin` y `administrador`: gestión administrativa.
- `supervisor`: consulta global de cultivos, mediciones y alertas.
- `encargado`: acceso limitado a los cultivos asignados en `usuario_cultivo`.
- Solo administradores pueden gestionar instalaciones, dispositivos y umbrales; eliminar una instalación con cultivos o dispositivos vinculados se rechaza para preservar los registros.
- Cada dispositivo puede guardar una dirección IP/host y un puerto TCP. Al registrarlo, editarlo o usar "Probar conexión", la API intenta una conexión TCP real (`DEVICE_CONNECT_TIMEOUT`, por defecto 2 s) y actualiza `ultimaconexion` si el host responde. La telemetría y el control de actuadores siguen pendientes de integrar un controlador IoT.
- Los umbrales se evalúan con prioridad global < instalación < cultivo y generan alertas al registrar mediciones.
- Solo administradores pueden crear, editar o eliminar usuarios; nadie puede desactivar o eliminar su propia cuenta y siempre debe quedar al menos un administrador activo.

La autorización se valida en la API; ocultar una página en el navegador no concede ni deniega permisos. Las cuentas nuevas se crean desde la administración y nunca se publican credenciales de demostración. Asigna cultivos a cada encargado desde la pantalla de usuarios antes de esperar que vea mediciones.

## Recuperación de contraseña

Cada usuario puede tener un **email de respaldo** y un **teléfono de respaldo**; un administrador los configura al crear o editar la cuenta en la pantalla de usuarios. Desde el login, "¿Olvidaste tu contraseña?" inicia este flujo:

1. Se ingresa el usuario o correo y la API envía un **código de 6 dígitos** o un **enlace mágico** al contacto de respaldo.
2. El código o enlace se valida y se obtiene un token temporal de 15 minutos.
3. Se define la nueva contraseña (mínimo 12 caracteres); las sesiones anteriores quedan invalidadas.

El código dura 10 minutos y admite 5 intentos; el enlace mágico dura 15 minutos y es de un solo uso. Hay límites por identificador e IP para evitar abuso. La respuesta de solicitud es siempre genérica para no revelar qué cuentas existen. El enlace se construye con `FRONTEND_URL` (por defecto el primer origen de `CORS_ORIGINS`) y `PASSWORD_RESET_LINK_MINUTES` define su vigencia.

Para enviar correos configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` y `SMTP_TLS`. Para SMS configura `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_FROM`. Si no hay proveedor configurado, el código o enlace se escribe en el log de la API para probar el flujo en desarrollo (no usar así en producción).

## Notificaciones

Las alertas generadas por mediciones crean notificaciones para los encargados del cultivo (o el responsable de la instalación y, en su defecto, los administradores), con un máximo de una notificación por cultivo y variable cada 30 minutos. El panel de la campana se actualiza en vivo mediante `GET /api/notificaciones/stream` (Server-Sent Events) y mantiene el respaldo por sondeo.

## Pruebas

Instala dependencias de desarrollo y ejecuta la suite:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
ruff check .
```

Los casos y sus resultados se registran en [docs/plan-pruebas.md](docs/plan-pruebas.md). Las pruebas usan una base SQLite temporal en memoria y no modifican la base de desarrollo.

Para una prueba de carga manual contra la API en ejecución:

```powershell
$env:AQUAPLANTS_PASSWORD = "<clave-admin>"
python scripts\load_test.py --username admin --requests 1000 --concurrency 50
```

## Documentación

- [Arquitectura](docs/arquitectura.md): componentes, módulos y flujos.
- [Base de datos](docs/base-datos.md): modelo, normalización, índices e integridad.
- [Seguridad](docs/seguridad.md): controles, amenazas y limitaciones.
- [Instalación del entorno](docs/instalacion-entorno.md): guía paso a paso.
- [Despliegue](docs/despliegue.md): Docker Compose, nube, TLS y operación.
- [Publicación en la nube](docs/despliegue-nube.md): RDS, GitHub, Render/App Runner y comandos CMD.
- [Arranque en AWS EC2](docs/despliegue-ec2.md): Ubuntu, systemd, Nginx, HTTPS y Windows CMD.
- [Trazabilidad interfaz ↔ negocio ↔ API](docs/trazabilidad-interfaz.md).
- [Registro de decisiones](docs/registro-decisiones.md) y [plan de pruebas](docs/plan-pruebas.md).
- [Cumplimiento de la rúbrica](docs/rubrica-cumplimiento.md).

## Alcance actual y pendientes conocidos

- Las cuentas de encargado sin cultivos asignados no ven mediciones ni alertas; asigna cultivos desde administración.
- Instalaciones y dispositivos cuentan con CRUD administrativo, validación de referencias y asignación opcional de cultivos a instalaciones. Los dispositivos guardan IP y puerto, y `POST /api/dispositivos/{id}/probar-conexion` verifica su alcance TCP.
- Riego ya guarda estados de zonas, horarios y consulta el historial real, pero no controla bombas ni ejecuta los horarios sin un controlador físico conectado.
- Las alertas distinguen lectura de resolución; ambas acciones se guardan y respetan las asignaciones de cultivos.
- El módulo de reportes resume indicadores, exporta CSV desde la API y genera PDF/Excel en el navegador; el historial de reportes generados se conserva por usuario.
- El perfil permite consultar y actualizar datos personales y contactos de respaldo con `PUT /api/auth/me`, cambiar la contraseña con `PUT /api/auth/change-password`, y muestra resumen de cultivos/alertas, fortaleza de contraseña, tema, zona horaria y accesos rápidos.
- El login limita los intentos fallidos por identificador (5 cada 5 minutos) y por IP (100 cada 5 minutos), respondiendo HTTP 429 con `Retry-After`; se configura con `LOGIN_MAX_ATTEMPTS`, `LOGIN_IP_MAX_ATTEMPTS` y `LOGIN_WINDOW_SECONDS`. Los limitadores viven en memoria y no se comparten entre workers.
- La API agrega cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`.
- Las restricciones y permisos mejorados no reemplazan la revisión de permisos de PostgreSQL, copias de seguridad, TLS y rotación de credenciales para producción.

Registra nuevas discrepancias y recomendaciones en el plan de pruebas antes de presentar la rúbrica como completa.
