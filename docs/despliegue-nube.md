# Publicación en la nube (RDS + Render / App Runner)

Guía de las fases 3 a 6 para publicar AquaPlants con HTTPS, usando AWS RDS
como base de datos. Todos los comandos están escritos para **Windows CMD**.

Los valores entre `<...>` son marcadores: reemplázalos por tus datos reales.
No escribas contraseñas en el código ni las subas al repositorio.

Para una instancia EC2 con Ubuntu, systemd, Nginx y HTTPS, sigue
[despliegue-ec2.md](despliegue-ec2.md).

## 1. Fase 3 · Conexión a AWS RDS

La API ya lee la conexión desde variables de entorno (`backend/config.py`) y
usa TLS configurable:

| Variable | Valor para RDS |
| --- | --- |
| `DB_HOST` | endpoint de la instancia (ej. `aquaplants.xxxxx.us-east-1.rds.amazonaws.com`) |
| `DB_PORT` | `5432` |
| `DB_USER` | usuario de la base |
| `DB_PASSWORD` | contraseña robusta |
| `DB_NAME` | nombre de la base |
| `DB_SSLMODE` | `require` (o `verify-full` con CA) |
| `DB_SSLROOTCERT` | ruta al bundle de RDS (opcional, para `verify-full`) |
| `SKIP_INIT_DB` | `1` si el esquema ya existe y no quieres DDL automático |

Notas importantes:

- `SKIP_INIT_DB=1` evita que la API cree tablas, índices o columnas al
  arrancar. Úsalo cuando el esquema de RDS ya está creado. Si la base está
  vacía, déjalo en `0` solo para el primer arranque y luego cámbialo a `1`.
- `SKIP_INIT_DB` **no** modifica ni borra datos: solo omite `init_db()`.
- Para `verify-full`, descarga el bundle de CA de RDS y monta el archivo en el
  contenedor o serviço; indica su ruta en `DB_SSLROOTCERT`.
- No ejecutes `scripts\setup_db.py` contra producción sin revisar antes qué
  hace: inserta datos de demostración solo si no hay usuarios.

## 2. Fase 4 · GitHub (repositorio privado)

El `.gitignore` excluye `.env`, entornos virtuales, logs, `.docx` y `.zip`.
Verifica **antes** del primer commit qué se publicará:

```cmd
cd /d C:\Users\benja\Desktop\aquaplanst
git add -n .
git ls-files
git check-ignore -v .env
```

`git ls-files` debe estar vacío antes del primer `add`; `git check-ignore`
debe confirmar que `.env` está ignorado. Si aparece cualquier `.env`, token o
credencial, detente y corrígelo antes de continuar.

Crear el primer commit y subirlo:

```cmd
git add .
git status
git commit -m "Preparar AquaPlants para despliegue en la nube"
git remote add origin https://github.com/<usuario>/<repositorio-privado>.git
git push -u origin main
```

Para comprobar que no se subió ningún secreto:

```cmd
git ls-files | findstr /I ".env"
git ls-files | findstr /I "password secret token credential"
```

Ambos comandos deben devolver vacío.

## 3. Fase 5 · Render vs AWS App Runner

| Criterio | Render | AWS App Runner |
| --- | --- | --- |
| Facilidad | Alta: conecta el repo, define variables y listo | Media: requiere ECR/imagen y rol IAM |
| Conexión a RDS | Si RDS es público y permite TLS; el plan gratuito no tiene IP de salida fija | VPC Connector: alcanza RDS privado sin exponerlo |
| HTTPS | Automático en `*.onrender.com` y dominio propio | Automático en `*.awsapprunner.com` y dominio propio |
| Costo | Plan free (con suspensión) o desde ~7 USD/mes | Pago por vCPU/memoria consumida + VPC Connector |
| Mantenimiento | Bajo | Medio (IAM, ECR, VPC) |
| Recomendado para pruebas | Sí | Sí, si RDS debe quedar privado |

**Recomendación:** usar **Render** mientras la aplicación está en pruebas,
siempre que RDS sea accesible con TLS y las reglas de seguridad estén
restringidas. Si RDS está en subred privada o no quieres exponerlo, usa
**App Runner con VPC Connector**.

### 3.1 Opción Render

1. Sube el repositorio a GitHub (fase 4).
2. En Render: **New → Web Service → Build and deploy from a Git repository**.
3. Runtime **Python 3**, build `pip install -r requirements.txt`, start:
   `uvicorn main:app --host 0.0.0.0 --port $PORT`.
4. Health check: `/api/health`.
5. Variables de entorno (usa las de la sección 1) y además:
   - `API_HOST=0.0.0.0`
   - `API_WORKERS=1`
   - `CORS_ORIGINS=https://<tu-frontend>`
   - `FRONTEND_URL=https://<tu-frontend>`
   - `SECRET_KEY=<48+ caracteres aleatorios>`
6. Frontend: publícalo como **Static Site** apuntando a la raíz del repo **o**
   usa un contenedor Nginx con proxy `/api`.
   - Si el frontend queda en **otro dominio**, agrega en `index.html`,
     `admin.html`, `encargado.html` y `supervisor.html`:
     `<meta name="aquaplants-api-base" content="https://<tu-api>">`.
   - Si compartes dominio con proxy `/api`, no cambies nada: `js/config.js`
     usa el mismo origen.
7. En RDS, permite el tráfico desde la IP de salida de Render (plan con IP
   estática) o, para pruebas, habilita acceso público con TLS y una regla de
   security group lo más acotada posible. **No** abras el puerto 5432 a
   `0.0.0.0/0` más allá de una prueba temporal.

### 3.2 Opción AWS App Runner

```cmd
aws ecr create-repository --repository-name aquaplants-api
docker build -t aquaplants-api .
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <cuenta>.dkr.ecr.<region>.amazonaws.com
docker tag aquaplants-api:latest <cuenta>.dkr.ecr.<region>.amazonaws.com/aquaplants-api:latest
docker push <cuenta>.dkr.ecr.<region>.amazonaws.com/aquaplants-api:latest
```

Luego, en la consola de App Runner:

- Fuente: imagen de ECR.
- Puerto: `8000`.
- Variables de entorno: las mismas de la sección 1 (`API_HOST=0.0.0.0`).
- **VPC Connector** en la misma VPC/subredes de RDS y un security group que
  permita salida hacia el puerto 5432 de RDS.
- Health check: `/api/health`.

No crees recursos de pago hasta confirmar el presupuesto.

## 4. Fase 6 · Validación

Con la URL pública (`https://<tu-api>` o el dominio del frontend):

```cmd
curl -i https://<tu-api>/api/health
curl -i https://<tu-api>/docs
curl -i https://<tu-frontend>/
```

Inicio de sesión y uso de un endpoint protegido:

```cmd
curl -X POST https://<tu-api>/api/auth/login -H "Content-Type: application/x-www-form-urlencoded" -d "username=<usuario>&password=<clave>"
curl -H "Authorization: Bearer <token>" https://<tu-api>/api/auth/me
```

Lista de comprobación:

- [ ] La página de login carga por HTTPS.
- [ ] El inicio de sesión devuelve un token y `/api/auth/me` responde 200.
- [ ] `/api/health` responde `{"status":"ok"}` (confirma conexión a RDS).
- [ ] La gestión de usuarios funciona y no permite autodesactivarse.
- [ ] Los roles respetan sus permisos (admin, supervisor, encargado).
- [ ] Los módulos de AquaPlants cargan y consultan datos reales.
- [ ] El acceso funciona desde un dispositivo externo (móvil/datos móviles).
- [ ] El navegador muestra candado HTTPS y no hay errores de CORS en consola.
- [ ] Los logs del proveedor no contienen contraseñas ni tokens.

## 5. Seguridad operativa

- Rota `SECRET_KEY` y la contraseña de RDS antes de publicar; no reutilices
  las credenciales de desarrollo.
- Guarda los secretos solo en las variables del proveedor, nunca en el repo.
- Activa respaldos automáticos de RDS y prueba una restauración.
- Revisa que los límites de login y la recuperación de contraseña usen SMTP o
  Twilio reales; no actives `PASSWORD_RESET_DEV_MODE` en producción.
- Con más de un worker, mueve los limitadores en memoria a un almacén
  compartido (por ejemplo, Redis).
