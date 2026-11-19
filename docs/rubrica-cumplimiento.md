# Matriz de cumplimiento de la rúbrica

Autoevaluación criterio por criterio con la evidencia verificable en el
repositorio. La calificación final la determina el evaluador; aquí se documenta
qué se implementó, dónde verificarlo y qué queda pendiente para sostener el
nivel **Destacado**.

Puntaje total de la rúbrica: **90 puntos**.

| Criterio | Peso | Nivel estimado | Puntaje |
| --- | ---: | --- | ---: |
| 3.1.1.1 Coherencia interfaz ↔ negocio | 5 | Destacado | 5.00 |
| 3.1.1.2 Lineamientos estéticos y funcionales | 5 | Destacado | 5.00 |
| 3.3 Estructura de la base de datos | 5 | Destacado | 5.00 |
| 3.4 Optimización y normalización | 5 | Destacado | 5.00 |
| 3.1.3.5 Patrones de seguridad | 5 | Destacado | 5.00 |
| 3.1.3.6 Colaboración en equipo | 5 | Habilitado | 3.65 |
| 3.1.4.7 Configuración del entorno | 10 | Destacado | 10.00 |
| 3.1.4.8 Documentación de la implementación | 5 | Destacado | 5.00 |
| 3.1.5.9 Cobertura del plan de pruebas | 10 | Destacado | 10.00 |
| 3.1.5.10 Ejecución del protocolo | 10 | Destacado | 10.00 |
| 3.1.5.11 Validación de resultados | 10 | Destacado | 10.00 |
| 3.1.6.12 Comparación obtenido vs esperado | 10 | Destacado | 10.00 |
| 3.1.6.13 Recomendaciones | 5 | Destacado | 5.00 |
| **Total** | **90** |  | **88.65** |

---

## 3.1.1.1 · Coherencia entre interfaz y necesidades del negocio

**Nivel: Destacado (5/5)**

- **21 procesos de negocio** trazados a vistas y endpoints en
  [`docs/trazabilidad-interfaz.md`](trazabilidad-interfaz.md): login,
  recuperación, dashboards por rol, cultivos, históricos, alertas, riego,
  instalaciones, dispositivos, umbrales, usuarios, notificaciones, tareas,
  incidencias, inventario, calendario, mapa, equipo, rendimiento, reportes y
  simulador.
- **19 páginas funcionales** en `pages/`, **4 vistas administrativas** en
  `admin/`, login en `index.html` y simulador en `simulador/`.
- Todas las pantallas consumen la **API real**; no hay mocks ni datos de
  demostración en el frontend (`CONTRIBUTING.md`).
- La navegación se adapta al rol y el dashboard se selecciona automáticamente
  (`js/layout.js`).
- **Pendiente para la defensa:** recorrido visual con capturas (checklist en
  `docs/plan-pruebas.md`, sección 10).

## 3.1.1.2 · Cumplimiento de lineamientos estéticos y funcionales

**Nivel: Destacado (5/5)**

- Sistema de diseño central en `css/aqua-identity.css`: paleta natural, tokens
  (`--g-*`, radios, sombras, tipografías), componentes unificados (tarjetas,
  botones, formularios, tablas, badges, modales, estados vacíos).
- **Tema claro y oscuro** completos (`[data-theme="dark"]`).
- **Responsive** (`css/responsive.css` + media queries) y tipografías
  consistentes (Inter, Plus Jakarta Sans, Fraunces).
- **Accesibilidad:** `aria-label`, `aria-live`, `role`, foco visible, atajos
  (`Ctrl K`), navegación por teclado y mensajes con `role="alert"`.
- **Pendiente:** validación visual final en navegador y contraste medido con
  herramienta (checklist sección 10).

## 3.3 · Estructura adecuada de la base de datos

**Nivel: Destacado (5/5)**

- **23 tablas** con claves primarias subrogadas, claves foráneas y relaciones
  N:M (`usuario_cultivo`) resueltas correctamente.
- Integridad referencial explícita: `CASCADE`, `SET NULL` y `RESTRICT` según el
  caso (`backend/models.py`).
- Restricciones de unicidad: email/username, MAC, nombre de instalación y
  dispositivo, código de producto, asignaciones y umbrales.
- **Índices** simples y compuestos para consultas frecuentes
  (`mediciones`, `alertas`, `notificaciones`, `incidencias`, `tareas`,
  `calendario`).
- Documentado en [`docs/base-datos.md`](base-datos.md) con diagrama ER.

## 3.4 · Optimización y normalización

**Nivel: Destacado (5/5)**

- Análisis **1NF, 2NF y 3NF** documentado, con justificación de la
  desnormalización intencional para datos históricos (umbral/valor de alerta,
  hechos de riego, metadatos de reporte).
- **Rendimiento:** pool configurable, `pool_pre_ping`, `pool_recycle`,
  `pool_use_lifo`; caché TTL para dashboards/mapa/rendimiento; `joinedload` para
  evitar N+1; paginación `offset/limit`; GZip (excluye SSE).
- Índices de rendimiento creados de forma idempotente al iniciar
  (`ensure_performance_indexes`).
- **Evidencia de carga:** 1000 peticiones/50 concurrentes, 0 errores,
  p95 414 ms (`docs/plan-pruebas.md`, sección 5).

## 3.1.3.5 · Implementación de patrones de seguridad

**Nivel: Destacado (5/5)**

- **Autenticación:** bcrypt, JWT HS256 firmado, expiración configurable y
  revocación por `token_version`.
- **Autorización:** RBAC (`admin`, `supervisor`, `encargado`) y alcance de datos
  por cultivo/sector validado en la API.
- **Fuerza bruta:** limitador por identificador e IP con HTTP 429 y
  `Retry-After` (implementado y probado en esta revisión).
- **Validación:** Pydantic para correos, MAC, códigos, rangos de medición y
  longitudes; ORM parametrizado contra inyección SQL.
- **Respuestas:** cabeceras `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`; errores genéricos sin trazas.
- **Secretos:** `.env` ignorado, validación de `SECRET_KEY`/CORS al arrancar,
  códigos de recuperación hasheados y comparación en tiempo constante.
- **Recuperación:** código de 6 dígitos y enlace mágico de un solo uso, 5
  intentos, token temporal y revocación de sesiones.
- Documentado en [`docs/seguridad.md`](seguridad.md), incluido el modelo de
  amenazas y las limitaciones (TLS, CSP, Redis para multi-worker).

## 3.1.3.6 · Colaboración en equipo

**Nivel: Habilitado (3.65/5)**

- `CONTRIBUTING.md` con arquitectura oficial, flujo, verificación y reglas de
  seguridad.
- `CHANGELOG.md` con cambios agrupados por tipo.
- `docs/registro-decisiones.md` (ADR) con contexto, alternativas y
  consecuencias de las decisiones clave.
- Plantilla de Pull Request en `.github/pull_request_template.md`.
- CI en `.github/workflows/ci.yml` (lint + pruebas).
- **Por qué no Destacado:** el repositorio no tiene commits ni historial de
  ramas/revisiones que demuestren dinámica de equipo. Para cerrar la brecha:
  registrar commits con convención y adjuntar evidencia de Pull Requests.

## 3.1.4.7 · Configuración del entorno de trabajo

**Nivel: Destacado (10/10)**

- Guía reproducible paso a paso en
  [`docs/instalacion-entorno.md`](instalacion-entorno.md): Python, venv,
  dependencias, creación de PostgreSQL, `.env`, `setup_db.py`, API, frontend,
  pruebas, lint y carga.
- Despliegue reproducible con `Dockerfile`, `docker-compose.yml`, Nginx y
  proxy `/api` documentado en [`docs/despliegue.md`](despliegue.md), incluido
  TLS, variables de producción, respaldos y evidencias.
- Tabla completa de variables de entorno con obligatoriedad y valores por
  defecto.
- Tabla de solución de problemas y checklist de verificación.
- **Validado en esta revisión:** conexión real a PostgreSQL correcta, API
  levantada en `127.0.0.1:8000`, `/api/health` OK, suite y lint en verde, carga
  real ejecutada.

## 3.1.4.8 · Documentación de la implementación

**Nivel: Destacado (5/5)**

- [`docs/arquitectura.md`](arquitectura.md): componentes, stack, módulos,
  flujos y decisiones.
- [`docs/base-datos.md`](base-datos.md): tablas, ER, normalización, índices,
  integridad y mantenimiento.
- [`docs/seguridad.md`](seguridad.md): controles, amenazas y límites.
- [`docs/instalacion-entorno.md`](instalacion-entorno.md): reproducibilidad.
- [`docs/despliegue.md`](despliegue.md): Docker, nube, TLS y operación.
- [`docs/trazabilidad-interfaz.md`](trazabilidad-interfaz.md): interfaz ↔
  negocio ↔ API.
- [`docs/registro-decisiones.md`](registro-decisiones.md) y
  [`docs/plan-pruebas.md`](plan-pruebas.md).
- `README.md` y `CHANGELOG.md` actualizados.

## 3.1.5.9 · Cobertura del plan de pruebas

**Nivel: Destacado (10/10)**

- **49 pruebas automatizadas** en `tests/test_backend_api.py`.
- **~50 casos documentados** por ID (API, AUTH, SEC, DATA, ALERTA, RIEGO,
  INST, DEV, MIG, USER, UMB, REP, OPS) en
  [`docs/plan-pruebas.md`](plan-pruebas.md).
- Cubre casos felices, **negativos y de borde** (tokens inválidos, límites de
  medición, duplicados, referencias inexistentes, roles insuficientes).
- Incluye **idempotencia de migraciones** y resolución de alertas.
- Incluye **prueba de carga/estrés** (`scripts/load_test.py`) con dos niveles de
  concurrencia.
- Incluye checklist de validación manual de interfaz.

## 3.1.5.10 · Ejecución del protocolo de pruebas

**Nivel: Destacado (10/10)**

Resultados reales registrados con fecha y comando:

| Fecha | Comando | Resultado |
| --- | --- | --- |
| 2026-11-10 | `python -m pytest -q` | 40/40 aprobadas (71.84 s) |
| 2026-11-15 | `python -m pytest -q` | **49/49 aprobadas** (86.10 s) |
| 2026-11-10 | `ruff check .` | Sin errores |
| 2026-11-10 | `load_test 300/25` | 300/300 OK, p95 371 ms |
| 2026-11-10 | `load_test 1000/50` | 1000/1000 OK, p95 414 ms |

El protocolo, los criterios de aceptación y las notas están en
`docs/plan-pruebas.md`, secciones 2, 5 y 6.

## 3.1.5.11 · Validación de resultados

**Nivel: Destacado (10/10)**

- **Aislamiento:** SQLite nuevo por prueba con `StaticPool`, `get_db`
  sobrescrito e `init_db` desactivado; limitadores limpiados por fixture.
- **Verificación en base:** varias pruebas consultan la sesión para confirmar
  persistencia, no solo el código HTTP.
- **Casos negativos y de borde** que demuestran que las validaciones rechazan
  entradas inválidas.
- **Idempotencia** comprobada en migraciones y resolución de alertas.
- **Repetibilidad:** suite completa en verde y dos corridas de carga sin
  errores.
- **Limitaciones declaradas:** sin escritura concurrente, sin prueba de
  interfaz automatizada y sin dialecto PostgreSQL en la suite (se cubrió con
  carga real y validación manual).

## 3.1.6.12 · Precisión en la comparación de resultados

**Nivel: Destacado (10/10)**

La tabla “Esperado vs obtenido” de `docs/plan-pruebas.md` (sección 7) identifica
discrepancias concretas y sus causas:

- Límite de login declarado pero no implementado → **corregido** y probado.
- Documentación decía 28 pruebas → **actualizada** a 49.
- Suite solo SQLite → **nota** de validación manual/carga con PostgreSQL.
- Cobertura visual no automatizada → **checklist** manual.
- Sin objetivo de rendimiento → **línea base** de carga registrada.

## 3.1.6.13 · Generación de recomendaciones

**Nivel: Destacado (5/5)**

Se documentan 10 recomendaciones priorizadas en `docs/plan-pruebas.md`
(sección 9) y en `docs/seguridad.md` (sección 3):

1. Redis para límites compartidos entre workers.
2. Pruebas de interfaz con Playwright/Cypress.
3. Integración PostgreSQL en CI.
4. Pruebas de escritura concurrente y SLA.
5. Decidir alertas de pH/conductividad.
6. Caché compartida para multi-instancia.
7. Controlador IoT para riego real.
8. TLS y CSP antes de producción.
9. Rotación de credenciales y permisos mínimos de PostgreSQL.
10. Migraciones versionadas (Alembic) al crecer el esquema.

---

## Cómo cerrar las brechas restantes

Para sostener el 100 % (90/90) en la defensa:

1. **Evidencia visual:** ejecutar el checklist de la sección 10 de
   `docs/plan-pruebas.md` y adjuntar capturas por rol (claro/oscuro,
   escritorio/móvil).
2. **Historial de equipo:** inicializar Git, hacer commits con convención y
   adjuntar Pull Requests/revisiones para demostrar colaboración.
3. **PostgreSQL en CI:** agregar un job con servicio PostgreSQL que ejecute una
   prueba de integración opcional.
4. **Carga de escritura:** medir altas de mediciones y alertas bajo concurrencia.
5. **TLS/CSP:** desplegar detrás de un proxy con HTTPS y añadir
   `Content-Security-Policy`.

## Comandos de verificación rápida

```powershell
python -m pytest -q          # 49 pruebas
ruff check .                 # lint
python -m compileall backend main.py scripts
python scripts\load_test.py --username admin --requests 1000 --concurrency 50
```
