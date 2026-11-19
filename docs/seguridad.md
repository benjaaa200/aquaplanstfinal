# Seguridad de AquaPlants

Controles implementados, modelo de amenazas y limitaciones conocidas. El
objetivo es documentar qué protege el sistema y qué debe reforzarse para un
despliegue en producción.

## 1. Controles implementados

### 1.1 Autenticación

- **Contraseñas con bcrypt** (`passlib[bcrypt]`), nunca en texto plano.
- **Longitud mínima de 12 caracteres** al crear, cambiar o recuperar una
  contraseña.
- **JWT HS256** firmado con `SECRET_KEY` (obligatoria, ≥ 32 caracteres) e
  incluye `sub`, `role`, `ver`, `iat` y `exp`.
- **Expiración configurable** (`ACCESS_TOKEN_EXPIRE_MINUTES`, 5–1440 min).
- **Revocación de sesiones** mediante `usuarios.token_version`: cambiar o
  recuperar la contraseña invalida todos los tokens previos.
- **Mensajes genéricos** en login y en la recuperación de contraseña para no
  revelar qué cuentas existen.
- **Igualación de tiempos** en login: si el usuario no existe se verifica una
  contraseña ficticia para reducir ataques de temporización.

### 1.2 Límite de intentos (fuerza bruta)

`backend/cache.py` implementa un limitador de ventana deslizante en memoria:

| Flujo | Límite por defecto | Clave |
| --- | --- | --- |
| Login | 5 intentos / 5 min | `IP + identificador` |
| Login | 100 intentos / 5 min | IP |
| Recuperación | 5 solicitudes / hora | `IP + identificador` |
| Recuperación | 20 solicitudes / hora | IP |

Al exceder el login se responde **HTTP 429** con `Retry-After`. Un inicio de
sesión correcto limpia el contador del identificador (no el de la IP). La clave
incluye la IP para que un atacante no pueda bloquear la cuenta de un tercero.

Variables: `LOGIN_MAX_ATTEMPTS`, `LOGIN_IP_MAX_ATTEMPTS`,
`LOGIN_WINDOW_SECONDS`.

> El estado es **por proceso**. Con varios workers cada uno tiene su propio
> contador; para un límite global se recomienda Redis o un proxy con rate
> limiting.

### 1.3 Autorización

- **RBAC** con tres roles: `admin`/`administrador`, `supervisor`, `encargado`.
- **Alcance por cultivo:** los encargados solo ven cultivos en
  `usuario_cultivo`; el filtro se aplica en la API, no solo en la interfaz.
- **Dependencias explícitas** (`require_admin`, `require_cultivo_access`) para
  cada operación sensible.
- **Protecciones administrativas:** nadie puede desactivar/eliminar su propia
  cuenta y debe quedar al menos un administrador activo.
- **Referencias protegidas:** no se elimina una instalación con cultivos o
  dispositivos vinculados.

### 1.4 Validación y consistencia

- Esquemas **Pydantic** con tipos, longitudes, patrones (`EmailStr`, MAC,
  código de 6 dígitos) y rangos (pH 0–14, humedad 0–100, etc.).
- **SQLAlchemy ORM** con consultas parametrizadas, lo que evita inyección SQL
  en las rutas normales.
- Restricciones de unicidad e integridad en la base para reglas críticas.

### 1.5 Protección de respuestas y errores

- **Cabeceras HTTP** en todas las respuestas:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- **Manejador global de errores** que registra el detalle en el log y devuelve
  un mensaje genérico `Error interno del servidor`, sin trazas al cliente.
- **CORS con lista explícita** de orígenes; se rechaza `*` en configuración.
- **GZip** solo para respuestas HTTP normales (excluye SSE).

### 1.6 Gestión de secretos

- `.env` está en `.gitignore`; `.env.example` contiene solo marcadores.
- `config.py` falla al arrancar si faltan credenciales de BD, `SECRET_KEY`
  (≥ 32 caracteres) o si `CORS_ORIGINS` usa `*`.
- Los códigos de recuperación se guardan **hasheados** (SHA-256 con
  `SECRET_KEY`) y se comparan con `hmac.compare_digest`.
- No se registran contraseñas ni tokens en logs.

### 1.7 Recuperación de contraseña

- Código de 6 dígitos, vigencia de 10 min, máximo 5 intentos, un solo uso.
- Enlace mágico de un solo uso (token de alta entropía hasheado en BD), vigencia
  de 15 min y límite de verificaciones por IP.
- Token temporal de recuperación de 15 min con `scope=password_reset`.
- Se invalidan los tokens previos y todas las sesiones activas al cambiarla.
- Si no hay SMTP/Twilio configurado, el código o enlace se escribe en el log
  **solo para desarrollo**.

## 2. Modelo de amenazas

| Amenaza | Mitigación | Estado |
| --- | --- | --- |
| Fuerza bruta de contraseñas | Limitador por identificador e IP + 429 | Implementado |
| Pulverización de credenciales | Límite por IP | Implementado |
| Enumeración de cuentas | Mensajes genéricos + tiempos equivalentes | Implementado |
| Robo de sesión por cambio de contraseña | `token_version` invalida tokens | Implementado |
| Acceso a datos de otros cultivos | Scoping en API por `usuario_cultivo` | Implementado |
| Escalada de privilegios | `require_admin` en mutaciones | Implementado |
| Inyección SQL | ORM parametrizado + validación | Implementado |
| XSS reflejado en respuestas | Serialización JSON + escape en frontend | Parcial |
| Clickjacking | `X-Frame-Options: DENY` | Implementado |
| Fugas por errores | Handler genérico + logging interno | Implementado |
| Fuga de secretos en repositorio | `.env` ignorado + validación de config | Implementado |
| Fuerza bruta de códigos de recuperación | 5 intentos + hashing + expiración | Implementado |
| Reutilización o fuga del enlace mágico | Token de alta entropía hasheado, un solo uso, expiración y `Referrer-Policy: no-referrer` | Implementado |
| Repudio de acciones | Bitácoras de comentarios y estados | Parcial |
| Interceptación de tráfico | Requiere TLS en el despliegue | Pendiente (producción) |

## 3. Limitaciones conocidas y recomendaciones

1. **TLS/HTTPS:** la API de desarrollo corre en HTTP. En producción debe estar
   detrás de un proxy con TLS (Nginx, Caddy, Traefik) y `Secure`/`HttpOnly`
   cookies si se migra a cookies.
2. **Almacenamiento del token:** el frontend usa `localStorage`/`sessionStorage`.
   Un XSS podría leerlo. Se recomienda una **CSP estricta** y, a futuro,
   cookies `HttpOnly` + `SameSite`.
3. **CSP:** no se envía `Content-Security-Policy`. Añadirla requiere inventariar
   `cdn.jsdelivr.net` y `fonts.googleapis.com`.
4. **Limitadores en memoria:** no son compartidos entre workers ni persisten
   tras reinicios. Usar Redis para producción multi-worker.
5. **Sin MFA:** no hay segundo factor. Recomendado para cuentas admin.
6. **Sin bloqueo persistente de cuentas:** el límite es por ventana; no hay
   bloqueo permanente ni notificación al usuario.
7. **Permisos de PostgreSQL:** se debe usar una cuenta con permisos mínimos
   sobre el esquema de AquaPlants, sin privilegios administrativos innecesarios.
8. **Auditoría:** hay bitácoras de negocio, pero no un log de auditoría
   inmutable de accesos administrativos.
9. **Dependencias:** fijar versiones y ejecutar `pip audit` periódicamente.

## 4. Checklist de despliegue seguro

- [ ] `SECRET_KEY` aleatoria de ≥ 32 caracteres, distinta por entorno.
- [ ] `DB_PASSWORD` robusta y cuenta PostgreSQL de privilegio mínimo.
- [ ] `CORS_ORIGINS` con dominios reales, sin `*`.
- [ ] TLS terminado en proxy y redirección de HTTP a HTTPS.
- [ ] `SMTP_*`/`TWILIO_*` configurados con credenciales de producción.
- [ ] Respaldos automáticos y restauración probada.
- [ ] Rotación de credenciales y de `SECRET_KEY` planificada.
- [ ] Revisar logs y alertas de errores 401/403/429.
- [ ] `pip install -r requirements.txt` con versiones fijadas.
- [ ] Ejecutar `pytest`, `ruff` y la prueba de carga antes de publicar.

## 5. Pruebas de seguridad automatizadas

En `tests/test_backend_api.py`:

- `test_login_rejects_invalid_password`
- `test_login_rate_limit_returns_429_with_retry_after`
- `test_successful_login_clears_identifier_counter`
- `test_tampered_expired_and_stale_tokens_are_rejected`
- `test_security_headers_are_present`
- `test_security_headers_include_permissions_policy`
- `test_users_endpoint_requires_admin`
- `test_encargado_only_sees_assigned_crops_and_measurements`
- `test_encargado_cannot_access_unassigned_crop_or_alert`
- `test_admin_can_list_users_without_password_hashes`
- `test_admin_user_creation_validates_password_and_normalizes_role`
- `test_duplicate_username_and_email_are_rejected`
- `test_measurement_boundaries_are_validated`
- `test_password_recovery_flow`
