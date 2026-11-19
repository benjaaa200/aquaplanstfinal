# Despliegue de AquaPlants

Guía para ejecutar la API, PostgreSQL y el frontend en un entorno reproducible
y para publicarlos en un servidor accesible.

## 1. Despliegue local con Docker Compose

Requisitos: Docker Desktop o Docker Engine con Compose v2.

```powershell
Copy-Item .env.example .env
# Edita .env: define DB_PASSWORD, SECRET_KEY y los datos del administrador.
docker compose up -d --build
```

Servicios:

| Servicio | URL local | Descripción |
| --- | --- | --- |
| `web` | <http://localhost:5500> | Frontend estático + proxy `/api` |
| `api` | <http://localhost:8000> | FastAPI (documentación en `/docs`) |
| `db` | `db:5432` | PostgreSQL 16 con volumen `pgdata` |

Verificación:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8000/api/health
Invoke-WebRequest http://localhost:5500/index.html -UseBasicParsing
```

Si la base está vacía, crea el administrador y los datos base:

```powershell
docker compose exec api python scripts/setup_db.py
```

Detener sin borrar datos:

```powershell
docker compose down
```

Borrar también el volumen de PostgreSQL (destruye datos):

```powershell
docker compose down -v
```

## 2. Variables mínimas para un entorno público

| Variable | Ejemplo | Uso |
| --- | --- | --- |
| `DB_HOST` | `db` (Compose) o host de RDS | Host de PostgreSQL |
| `DB_PORT` | `5432` | Puerto |
| `DB_USER` | `aquaplants` | Usuario |
| `DB_PASSWORD` | clave robusta | Contraseña |
| `DB_NAME` | `aquaplants` | Base |
| `DB_SSLMODE` | `require` (RDS) / `disable` (local) | TLS hacia PostgreSQL |
| `DB_SSLROOTCERT` | ruta al bundle de RDS | Verificación de CA (opcional) |
| `SKIP_INIT_DB` | `1` en producción | Evita DDL automático al arrancar |
| `SECRET_KEY` | 48+ caracteres aleatorios | Firma JWT |
| `CORS_ORIGINS` | `https://aquaplants.ejemplo.cl` | Origen del frontend |
| `FRONTEND_URL` | `https://aquaplants.ejemplo.cl` | Enlace de recuperación |
| `API_HOST` | `0.0.0.0` | Bind del contenedor/PaaS |
| `PORT` | lo inyecta el PaaS | Puerto público (Render/App Runner) |
| `API_PORT` | `8000` | Puerto interno |
| `SMTP_*` | según proveedor | Recuperación por correo |

Genera la clave con:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

No uses `CORS_ORIGINS=*` ni subas `.env` al repositorio.

## 3. Publicación en un servidor o nube

### Opción A · VPS con Docker + proxy TLS

1. Instala Docker y Docker Compose en la VM.
2. Clona el repositorio y crea `.env` con valores de producción.
3. Ejecuta `docker compose up -d --build`.
4. Coloca Nginx, Caddy o Traefik delante del puerto `5500` con HTTPS. El
   contenedor `web` ya proxya `/api` hacia la API, por lo que el frontend y la
   API comparten origen.
5. Abre los puertos 80/443 y restringe el acceso directo a 5500/8000.

Ejemplo con Caddy (fuera de Compose):

```caddyfile
aquaplants.ejemplo.cl {
    reverse_proxy 127.0.0.1:5500
}
```

### Opción B · PaaS con Dockerfile

1. Crea un servicio de PostgreSQL gestionado (RDS, Neon, Supabase, Railway).
2. Crea un servicio web usando el `Dockerfile` del repositorio y expone el
   puerto `8000`.
3. Define las variables de la sección 2. En plataformas que inyectan `PORT`,
   `serve.py` lo respeta automáticamente.
4. Publica el frontend como sitio estático. Si la API queda en **otro dominio**,
   agrega en las páginas la etiqueta:

   ```html
   <meta name="aquaplants-api-base" content="https://api.ejemplo.cl">
   ```

   Si compartes dominio mediante un proxy `/api`, no necesitas cambiar nada:
   `js/config.js` usa el mismo origen en dominios que no son localhost.
5. Ejecuta una vez `python scripts/setup_db.py` contra la base gestionada.

### Opción C · Base gestionada + frontend estático

- Backend: contenedor o PaaS con el `Dockerfile`.
- Base: PostgreSQL gestionado con TLS.
- Frontend: Nginx, S3 + CloudFront, Netlify, Vercel o GitHub Pages.
- Configura `CORS_ORIGINS` con el dominio exacto del frontend y
  `FRONTEND_URL` para que el enlace de recuperación abra el login correcto.

## 4. Operación y mantención

- **Salud:** `/api/health` valida la conexión a la base; úsalo en el balanceador.
- **Respaldos:** programa `pg_dump` diario y prueba la restauración.
- **Logs:** los contenedores escriben en stdout; recólatelos con el proveedor.
- **Escalado:** aumenta `API_WORKERS` o réplicas. Con más de un worker, mueve
  los limitadores y la caché a Redis (ver recomendaciones).
- **TLS:** obligatorio en producción; el contenedor `web` no termina TLS.
- **Secretos:** rota `SECRET_KEY`, contraseñas de BD y credenciales SMTP.
- **Actualizaciones:** reconstruye la imagen y aplica migraciones aditivas al
  iniciar. Haz respaldo antes de actualizar.

## 5. Evidencia para la rúbrica

Registra en `docs/plan-pruebas.md`:

- URL pública del frontend y de la API.
- Fecha y resultado de `/api/health`.
- Capturas de login, dashboard y recuperación de contraseña en el entorno
  desplegado.
- Resultado de la prueba de carga contra el entorno publicado.
