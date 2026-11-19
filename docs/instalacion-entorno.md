# Instalación y configuración del entorno

Guía reproducible para dejar AquaPlants operativo en Windows (PowerShell).
Los comandos también aplican a Linux/macOS con el equivalente de activación del
entorno virtual.

## 1. Requisitos

- Python 3.10 o superior (`python --version`).
- PostgreSQL accesible (local o RDS).
- Navegador moderno (Chrome, Edge o Firefox).
- Git (opcional, para clonar el repositorio).

## 2. Preparar el proyecto

Desde la carpeta raíz del proyecto:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Si PowerShell bloquea la activación:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## 3. Crear la base de datos y el usuario

En PostgreSQL local, crea una base y un usuario de aplicación (ajusta los
nombres y establece la contraseña de forma segura):

```sql
CREATE ROLE aquaplants LOGIN PASSWORD 'UNA_CLAVE_ROBUSTA';
CREATE DATABASE aquaplants OWNER aquaplants;
```

En Amazon RDS usa la base de datos y el usuario ya creados en el servicio; no
ejecutes estos comandos si no tienes permisos para crear bases o roles.
HeidiSQL puede usarse como cliente para administrar PostgreSQL. El script
`scripts/setup_db.py` crea el esquema y `scripts/migrate_to_postgres.py` copia
datos desde otra base (MySQL/MariaDB, SQLite u otro PostgreSQL).

## 4. Configurar variables de entorno

```powershell
Copy-Item .env.example .env
```

Edita `.env` y completa como mínimo:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=aquaplants
DB_PASSWORD=UNA_CLAVE_ROBUSTA
DB_NAME=aquaplants
SECRET_KEY=GENERA_UNA_CLAVE_ALEATORIA_DE_32_O_MAS_CARACTERES
CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
```

Genera la `SECRET_KEY` con:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`.env` está en `.gitignore`; no lo compartas ni lo subas al repositorio.

## 5. Inicializar el esquema y datos base

Para crear solamente las tablas, sin transferir ni insertar datos:

```powershell
python scripts\setup_db.py --schema-only
```

Para una base vacía con datos demo, define también el administrador inicial:

```dotenv
AQUAPLANTS_ADMIN_USERNAME=admin
AQUAPLANTS_ADMIN_EMAIL=admin@aquaplants.cl
AQUAPLANTS_ADMIN_PASSWORD=UnaClaveSegura2026!
```

Y ejecuta una sola vez:

```powershell
python scripts\setup_db.py
```

El script crea las tablas, los umbrales por defecto, instalaciones/cultivos de
demostración y el administrador **solo si la base no tiene usuarios**. En una
base con usuarios no cambia contraseñas ni datos existentes.

## 6. Iniciar la API

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Verifica:

- Documentación interactiva: <http://127.0.0.1:8000/docs>
- Salud: <http://127.0.0.1:8000/api/health>

Para varios workers:

```powershell
$env:API_WORKERS = "4"
python serve.py
```

El total de conexiones a PostgreSQL es
`API_WORKERS × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` y debe quedar por debajo de
`max_connections`.

## 7. Servir el frontend

En una segunda terminal, desde la raíz:

```powershell
python -m http.server 5500 --bind 127.0.0.1
```

Abre <http://127.0.0.1:5500/> e inicia sesión con las credenciales creadas en
`setup_db.py` (o las de `README.md` en desarrollo).

> El frontend apunta a `http://127.0.0.1:8000/api` (`js/api.js`). Si cambias el
> host/puerto de la API, ajusta esa constante y `CORS_ORIGINS`.

## 7.1 Despliegue en la nube (procedimiento reproducible)

La vía recomendada y reproducible con contenedores está en
[`docs/despliegue.md`](despliegue.md). Incluye `Dockerfile`,
`docker-compose.yml`, proxy Nginx, TLS, respaldos y evidencias. Resumen:

```powershell
Copy-Item .env.example .env
# Define DB_PASSWORD, SECRET_KEY y AQUAPLANTS_ADMIN_* en .env
docker compose up -d --build
```

El prototipo también puede desplegarse con servicios gestionados. El
procedimiento mínimo para dejar backend, base de datos y frontend accesibles es:

1. **Base de datos:** crear PostgreSQL gestionado (Amazon RDS, Neon, Supabase o
   similar), guardar host/puerto/usuario/contraseña y permitir TLS. Ejecutar
   `python scripts\setup_db.py` apuntando a esa base.
2. **Backend/API:** desplegar el repositorio en una VM o PaaS con Python 3.10+,
   instalar `requirements.txt` y ejecutar `python serve.py` (o
   `uvicorn main:app --host 0.0.0.0 --port 8000`) detrás de un proxy con HTTPS.
3. **Variables del backend:** configurar `DB_*`, `SECRET_KEY`, `CORS_ORIGINS`
   con el dominio real del frontend, `FRONTEND_URL` con la URL pública del
   login, `API_WORKERS` y, si se usa recuperación por correo, `SMTP_*`.
4. **Frontend:** publicar la carpeta raíz como sitio estático (Nginx, S3 +
   CloudFront, Netlify, Vercel o GitHub Pages) y ajustar `API_BASE_URL` en
   `js/api.js` a la URL pública de la API.
5. **Verificación:** comprobar `/api/health`, login, recuperación de contraseña
   y CORS desde el dominio publicado. Registrar la URL pública y la fecha en
   `docs/plan-pruebas.md`.

> La rúbrica exige que la aplicación y la base estén **desplegadas en un entorno
> accesible**. Este documento describe el procedimiento; la URL pública y las
> capturas de la instancia desplegada deben agregarse como evidencia antes de
> la evaluación.

## 8. Pruebas y calidad

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
ruff check .
```

Las pruebas usan SQLite en memoria y **no** modifican PostgreSQL. Para una prueba de
carga manual con la API en ejecución:

```powershell
$env:AQUAPLANTS_PASSWORD = "UnaClaveSegura2026!"
python scripts\load_test.py --username admin --requests 500 --concurrency 25
```

## 9. Referencia de variables de entorno

| Variable | Obligatoria | Por defecto | Descripción |
| --- | --- | --- | --- |
| `DB_HOST` | Sí | `127.0.0.1` | Host de PostgreSQL |
| `DB_PORT` | No | `5432` | Puerto de PostgreSQL |
| `DB_USER` | Sí | — | Usuario de la base |
| `DB_PASSWORD` | Sí | — | Contraseña de la base |
| `DB_NAME` | No | `postgres` | Nombre de la base |
| `SECRET_KEY` | Sí | — | Firma JWT, ≥ 32 caracteres |
| `CORS_ORIGINS` | No | `http://127.0.0.1:5500,...` | Orígenes permitidos, sin `*` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | Vigencia del JWT (5–1440) |
| `LOG_LEVEL` | No | `INFO` | Nivel de logging |
| `API_WORKERS` | No | `1` | Workers de Uvicorn (`serve.py`) |
| `API_HOST` / `API_PORT` | No | `127.0.0.1` / `8000` | Bind de `serve.py` |
| `DB_POOL_SIZE` | No | `10` | Pool por worker |
| `DB_MAX_OVERFLOW` | No | `20` | Conexiones extra |
| `API_THREADS` | No | `60` | Hilos para endpoints síncronos |
| `LOGIN_MAX_ATTEMPTS` | No | `5` | Intentos de login por identificador |
| `LOGIN_IP_MAX_ATTEMPTS` | No | `100` | Intentos de login por IP |
| `LOGIN_WINDOW_SECONDS` | No | `300` | Ventana del limitador de login |
| `PASSWORD_RESET_CODE_MINUTES` | No | `10` | Vigencia del código |
| `PASSWORD_RESET_TOKEN_MINUTES` | No | `15` | Vigencia del token de reset |
| `PASSWORD_RESET_LINK_MINUTES` | No | `15` | Vigencia del enlace mágico |
| `PASSWORD_RESET_MAX_ATTEMPTS` | No | `5` | Intentos del código |
| `FRONTEND_URL` | No | `CORS_ORIGINS[0]` | Base para armar el enlace mágico |
| `SMTP_HOST` | No | — | Servidor de correo |
| `SMTP_PORT` | No | `587` | Puerto SMTP |
| `SMTP_USER` / `SMTP_PASSWORD` | No | — | Credenciales SMTP |
| `SMTP_FROM` | No | `SMTP_USER` | Remitente |
| `SMTP_TLS` | No | `1` | Usar STARTTLS |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | No | — | SMS |
| `TWILIO_FROM` | No | — | Número emisor |
| `AQUAPLANTS_ADMIN_*` | Solo al inicializar | — | Administrador inicial |

## 10. Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `RuntimeError: Configura DB_USER...` | `.env` incompleto | Completar `DB_USER`/`DB_PASSWORD` |
| `SECRET_KEY debe configurarse...` | Clave ausente o corta | Generar una de ≥ 32 caracteres |
| Error de autenticación PostgreSQL | Credenciales/permisos | Revisar usuario, contraseña y permisos del esquema |
| Error de CORS en el navegador | Origen no permitido | Añadir origen a `CORS_ORIGINS` |
| 401 tras iniciar sesión | Token expirado o `token_version` cambió | Volver a iniciar sesión |
| 429 al iniciar sesión | Límite de intentos | Esperar la ventana (`LOGIN_WINDOW_SECONDS`) |
| Frontend sin datos | API en otro host/puerto | Ajustar `js/api.js` y `CORS_ORIGINS` |
| `Port 8000 already in use` | Otro proceso | Cambiar puerto o cerrar el proceso |
| Código de recuperación no llega | SMTP/Twilio sin configurar | Revisar log de la API (modo desarrollo) |
| Error de TLS | Certificado/conexión SSL | Confirmar que PostgreSQL/RDS permite TLS |

## 11. Verificación final

- [ ] `python -m pytest -q` → todas las pruebas pasan.
- [ ] `ruff check .` → sin errores.
- [ ] `/api/health` responde `{"status":"ok"}`.
- [ ] Login correcto devuelve token y `/api/auth/me` responde.
- [ ] Login fallido repetido devuelve 429 con `Retry-After`.
- [ ] El frontend carga sin errores de consola y muestra datos reales.
- [ ] `scripts/load_test.py` termina sin errores 5xx.
- [ ] La instancia desplegada responde por HTTPS y su URL está registrada.
