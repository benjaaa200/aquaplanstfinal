# Registro de decisiones de arquitectura (ADR)

Decisiones relevantes con contexto, alternativa considerada y consecuencias.
Formato ligero inspirado en ADR.

## ADR-001 · FastAPI + PostgreSQL como arquitectura oficial

- **Fecha:** 2026
- **Estado:** Aceptada (revisada: migración a PostgreSQL)
- **Contexto:** El proyecto necesitaba una API tipada, documentación automática
  y una base relacional para mediciones y operación agrícola.
- **Decisión:** Usar FastAPI + SQLAlchemy + PostgreSQL (`psycopg`); el frontend
  es estático (HTML/CSS/JS) sin framework.
- **Alternativas:** Express/SQLite (prototipo retirado), Django, MySQL/MariaDB.
- **Consecuencias:** Documentación OpenAPI gratuita, validación con Pydantic y
  despliegue simple del frontend. Requiere operar PostgreSQL por separado; la
  migración desde MySQL/SQLite se resuelve con `scripts/migrate_to_postgres.py`.

## ADR-002 · JWT con `token_version`

- **Fecha:** 2026
- **Estado:** Aceptada
- **Contexto:** Se necesitaba autenticación sin sesiones de servidor y a la vez
  poder revocar sesiones al cambiar la contraseña.
- **Decisión:** JWT HS256 con `sub`, `role`, `ver`, `iat`, `exp`; comparar
  `ver` con `usuarios.token_version` en cada petición.
- **Alternativas:** Sesiones en servidor, JWT sin revocación.
- **Consecuencias:** Escalado horizontal y revocación efectiva. El token se
  guarda en el navegador (riesgo XSS mitigable con CSP/cookies HttpOnly).

## ADR-003 · `create_all` + migraciones aditivas

- **Fecha:** 2026
- **Estado:** Aceptada
- **Contexto:** Bases existentes no debían perder datos al actualizar y no se
  quería introducir una herramienta de migraciones completa.
- **Decisión:** `Base.metadata.create_all` para tablas nuevas y funciones
  `ensure_*` para columnas/índices aditivos e idempotentes.
- **Alternativas:** Alembic desde el inicio.
- **Consecuencias:** Actualizaciones seguras y simples, pero sin historial de
  migraciones ni rollback automático. Se recomienda Alembic al crecer.

## ADR-004 · SQLite en memoria para pruebas

- **Fecha:** 2026
- **Estado:** Aceptada
- **Contexto:** La suite debía ser rápida, repetible y no tocar datos reales.
- **Decisión:** Sustituir `get_db` por SQLite con `StaticPool` y desactivar
  `init_db` en pruebas.
- **Alternativas:** Contenedor PostgreSQL por prueba.
- **Consecuencias:** Pruebas rápidas y aisladas; no cubren particularidades del
  dialecto PostgreSQL (se compensa con validación manual y carga real).

## ADR-005 · Caché y limitadores en memoria

- **Fecha:** 2026
- **Estado:** Aceptada (revisable)
- **Contexto:** Los dashboards se sondean seguido y se necesitaba frenar abuso
  sin añadir infraestructura.
- **Decisión:** TTL cache y limitadores de ventana deslizante en `cache.py`.
- **Alternativas:** Redis desde el inicio.
- **Consecuencias:** Sin dependencias extra en desarrollo, pero el estado es por
  proceso. Con varios workers se recomienda Redis.

## ADR-006 · Sistema de diseño centralizado

- **Fecha:** 2026
- **Estado:** Aceptada
- **Contexto:** Muchas páginas independientes necesitaban una identidad común.
- **Decisión:** Tokens y componentes en `css/aqua-identity.css`, cargado después
  de los CSS de módulo; `js/layout.js` inyecta la navegación común.
- **Alternativas:** Framework de componentes (React/Vue).
- **Consecuencias:** Consistencia y despliegue estático simple; la lógica
  compartida debe mantenerse en JS plano.

## ADR-007 · Límite de intentos de login

- **Fecha:** 2026-11-10
- **Estado:** Aceptada
- **Contexto:** El plan y el `CHANGELOG` declaraban el límite, pero el endpoint
  no lo aplicaba.
- **Decisión:** Limitador por `IP + identificador` (5/5 min) y por IP
  (100/5 min), con HTTP 429 y `Retry-After`; limpiar el contador del
  identificador tras un login correcto.
- **Alternativas:** Bloqueo persistente de cuenta, CAPTCHA.
- **Consecuencias:** Reduce fuerza bruta sin bloquear cuentas de terceros. El
  estado no se comparte entre workers; usar Redis en producción.

## ADR-008 � Enlace m�gico para recuperaci�n de contrase�a

- **Fecha:** 2026-11-15
- **Estado:** Aceptada
- **Contexto:** El c�digo de 6 d�gitos funciona, pero requiere transcribirlo y
  depende de SMTP/SMS; se busc� una alternativa con mejor experiencia.
- **Decisi�n:** Agregar `metodo=link` a `POST /api/auth/forgot-password` y un
  endpoint `POST /api/auth/verify-reset-link`. El enlace contiene un token de
  alta entrop�a (`secrets.token_urlsafe(32)`) que se guarda hasheado, expira en
  `PASSWORD_RESET_LINK_MINUTES`, es de un solo uso y se cambia por el mismo JWT
  temporal `scope=password_reset` que usa el c�digo.
- **Alternativas:** JWT autocontenido sin registro en BD (no permite un solo
  uso fiable), enlace que consume el token por GET (riesgo con esc�neres de
  correo).
- **Consecuencias:** Mejor UX y mismo modelo de seguridad; requiere configurar
  `FRONTEND_URL` y entregar el correo por SMTP. El token se elimina de la URL
  del navegador tras verificarlo y la p�gina usa `Referrer-Policy: no-referrer`.
