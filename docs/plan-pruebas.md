# Plan y resultados de pruebas

Documento de protocolo, cobertura, ejecución y validación. Los casos
automatizados viven en `tests/test_backend_api.py`; la prueba de carga está en
`scripts/load_test.py`.

## 1. Alcance y entornos

| Entorno | Base de datos | Uso |
| --- | --- | --- |
| Automatizado | SQLite en memoria | `pytest`; aislado y repetible |
| Integración manual | PostgreSQL real | Verificación de login, CRUD y navegación |
| Carga manual | PostgreSQL real + API Uvicorn | `scripts/load_test.py` |

Las pruebas automatizadas **no modifican PostgreSQL**: sustituyen `get_db` por una
sesión SQLite temporal y desactivan la inicialización real.

## 2. Protocolo de ejecución

1. Activar el entorno: `.\.venv\Scripts\Activate.ps1`.
2. Instalar dependencias: `python -m pip install -r requirements-dev.txt`.
3. Ejecutar la suite: `python -m pytest -q`.
4. Ejecutar el lint: `ruff check .`.
5. Compilar módulos: `python -m compileall backend main.py scripts`.
6. Registrar fecha, comando, resultado y discrepancias en la sección 6.
7. Para la prueba de carga, iniciar la API y ejecutar:
   ```powershell
   $env:AQUAPLANTS_PASSWORD = "<clave-admin>"
   python scripts\load_test.py --username admin --requests 1000 --concurrency 50
   ```
8. Para la validación manual, iniciar API + frontend y recorrer la lista de la
   sección 10.

Criterios de aceptación:

- 100 % de las pruebas automatizadas en verde y `ruff check .` sin errores.
- Cero respuestas 5xx en la prueba de carga.
- `p95` de latencia < 1 s en el entorno de referencia.
- Ninguna discrepancia sin causa y recomendación registradas.

## 3. Casos automatizados

| ID | Escenario | Resultado esperado | Prueba |
| --- | --- | --- | --- |
| API-01 | Consultar la raíz de la API | HTTP 200 y enlace a documentación | `test_root_is_available` |
| API-02 | Verificar salud y conexión a BD | HTTP 200 `{"status":"ok"}` | `test_health_checks_database` |
| AUTH-01 | Login con credenciales válidas | HTTP 200, token bearer y perfil sin hash | fixture `api` |
| AUTH-02 | Login con contraseña incorrecta | HTTP 401 y mensaje genérico | `test_login_rejects_invalid_password` |
| SEC-01 | Consultar usuarios sin token | HTTP 401 | `test_users_endpoint_requires_admin` |
| SEC-02 | Consultar usuarios como supervisor | HTTP 403 | `test_users_endpoint_requires_admin` |
| SEC-03 | Listar usuarios como admin | HTTP 200 sin `hashed_password` | `test_admin_can_list_users_without_password_hashes` |
| SEC-04 | Crear usuario con contraseña débil | HTTP 422 | `test_admin_user_creation_validates_password_and_normalizes_role` |
| SEC-05 | Crear usuario como admin | HTTP 201 y rol normalizado | `test_admin_user_creation_validates_password_and_normalizes_role` |
| SEC-06 | Duplicar usuario o email | HTTP 409 | `test_duplicate_username_and_email_are_rejected` |
| SEC-07 | Token alterado, expirado o con `ver` antiguo | HTTP 401 | `test_tampered_expired_and_stale_tokens_are_rejected` |
| SEC-08 | Cabeceras de seguridad HTTP | Incluye `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | `test_security_headers_are_present`, `test_security_headers_include_permissions_policy` |
| SEC-09 | Fuerza bruta de login | HTTP 429 con `Retry-After` tras el límite | `test_login_rate_limit_returns_429_with_retry_after` |
| SEC-10 | Login exitoso tras fallos | Limpia el contador del identificador | `test_successful_login_clears_identifier_counter` |
| AUTH-03 | Perfil y cambio de contraseña | `/api/auth/me` sin hash; invalida la clave anterior | `test_current_user_profile_and_password_change` |
| AUTH-04 | Recuperación de contraseña | Código, token temporal, un solo uso, sesiones invalidadas | `test_password_recovery_flow` |
| AUTH-05 | Recuperación con enlace mágico | Enlace de un solo uso, token temporal y cambio de contraseña | `test_forgot_password_magic_link_flow` |
| DATA-01 | Cultivos visibles para encargado | Solo los asignados | `test_encargado_only_sees_assigned_crops_and_measurements` |
| DATA-02 | Encargado sin asignaciones | Lista vacía | `test_encargado_without_assignments_sees_no_crops` |
| DATA-03 | Mediciones y alertas del encargado | Solo de cultivos asignados | `test_encargado_only_sees_assigned_crops_and_measurements` |
| DATA-04 | Históricos filtrados por rango | Solo mediciones visibles en el rango | `test_historical_measurements_are_registered_and_scoped` |
| DATA-05 | Medición en cultivo ajeno | HTTP 403 sin insertar | `test_encargado_cannot_access_unassigned_crop_or_alert` |
| DATA-06 | Límites de medición (pH, temperatura, humedad) | HTTP 422 fuera de rango; 201 en el borde | `test_measurement_boundaries_are_validated` |
| SEC-11 | Asignar cultivos a encargado | Solo admin; duplicados HTTP 422 | `test_admin_can_assign_crops_to_encargado` |
| ALERTA-01 | Marcar alerta como leída | Persiste lectura sin resolver | `test_alert_can_be_marked_read_without_being_resolved` |
| ALERTA-02 | Resolver alerta | Persiste fecha y marca leída; idempotente | `test_resolving_alert_sets_persisted_state_and_is_idempotent` |
| ALERTA-03 | Resolver alerta ajena | HTTP 403 | `test_encargado_cannot_access_unassigned_crop_or_alert` |
| ALERTA-04 | Marcar todas como leídas | Solo cultivos asignados | `test_mark_all_as_read_only_updates_alerts_for_assigned_crops` |
| ALERTA-05 | Migración aditiva de alertas | Añade columnas una vez y conserva datos | `test_alert_resolution_migration_adds_missing_columns_idempotently` |
| RIEGO-01 | Zonas de riego | Derivadas de cultivos accesibles y consumo real | `test_irrigation_zones_only_include_accessible_crops` |
| RIEGO-02 | Historial de riego | Solo ejecuciones visibles | `test_irrigation_history_contains_real_records_for_assigned_crops` |
| RIEGO-03 | Programar ciclo válido | HTTP 201; persiste sin afirmar activación física | `test_irrigation_schedule_is_persisted_and_zone_disable_cancels_it` |
| RIEGO-04 | Duración fuera de rango | HTTP 422 | `test_irrigation_schedule_is_persisted_and_zone_disable_cancels_it` |
| RIEGO-05 | Programar zona ajena | HTTP 403 | `test_irrigation_schedule_is_persisted_and_zone_disable_cancels_it` |
| RIEGO-06 | Desactivar zona con horarios | HTTP 200; horarios desactivados | `test_irrigation_schedule_is_persisted_and_zone_disable_cancels_it` |
| RIEGO-07 | Programar zona desactivada | HTTP 409 | `test_irrigation_schedule_is_persisted_and_zone_disable_cancels_it` |
| INST-01 | CRUD de instalación como admin | Cambios persistidos y conteos correctos | `test_installation_device_crud_and_reference_protection` |
| INST-02 | Referencias inválidas | HTTP 422 | `test_installation_and_device_endpoints_enforce_roles_and_validation` |
| INST-03 | Eliminar instalación con referencias | HTTP 409 sin borrar datos | `test_installation_device_crud_and_reference_protection` |
| DEV-01 | CRUD de dispositivo | CRUD persistido y MAC normalizada | `test_installation_device_crud_and_reference_protection` |
| DEV-02 | MAC inválida o duplicada | HTTP 422 o 409 | `test_installation_device_crud_and_reference_protection` |
| SEC-12 | Roles en instalaciones/dispositivos | Lectura autenticada; mutación solo admin | `test_installation_and_device_endpoints_enforce_roles_and_validation` |
| MIG-01 | Migración de `cultivos.instalacion_id` | Aditiva e idempotente, conserva filas | `test_crop_installation_migration_is_additive_and_idempotent` |
| USER-01 | Editar y eliminar usuarios | Persiste; impide autoeliminación | `test_admin_can_update_and_delete_users_safely` |
| UMB-01 | CRUD de umbrales y alerta | Alerta con prioridad del cultivo; duplicados 409 | `test_thresholds_crud_and_alert_generation` |
| REP-01 | Resumen, CSV e historial | Métricas/CSV con scoping; historial persistido | `test_reports_summary_export_and_history` |
| OPS-01 | Tareas, incidencias, inventario, calendario | Flujo completo por rol | `test_operations_modules_flow` |
| OPS-02 | Rendimiento con fechas con zona horaria | Filtra por sector y periodo | `test_rendimiento_accepts_aware_dates_and_filters_sector_period` |
| OPS-03 | Calendario con fechas mixtas | Acepta `Z` y naive | `test_calendario_accepts_mixed_timezone_inputs` |
| OPS-04 | Evento con cultivo no asignado | HTTP 403 | `test_encargado_cannot_link_event_to_unassigned_crop` |
| OPS-05 | Editar incidencia con sector/cultivo | Persiste ambas referencias | `test_incidencia_edit_persists_sector_and_crop` |
| OPS-06 | Supervisor asigna sectores | No puede autoasignarse ni a supervisores | `test_supervisor_cannot_grant_sector_assignments_to_supervisors` |

## 4. Cobertura por módulo

| Módulo | Casos | Estado |
| --- | --- | --- |
| Autenticación y sesión | AUTH-01..05, SEC-07, SEC-09, SEC-10 | Cubierto |
| Autorización por rol/alcance | SEC-01..03, SEC-11, SEC-12, DATA-01..05, OPS-04, OPS-06 | Cubierto |
| Usuarios y asignaciones | SEC-04..06, USER-01, SEC-11 | Cubierto |
| Cultivos e instalaciones | DATA-01, INST-01..03, MIG-01 | Cubierto |
| Mediciones, umbrales y alertas | DATA-03..06, UMB-01, ALERTA-01..05 | Cubierto |
| Riego | RIEGO-01..07 | Cubierto |
| Reportes | REP-01 | Cubierto |
| Operación (tareas/incidencias/inventario/calendario/mapa/equipo/rendimiento) | OPS-01..06 | Cubierto |
| Seguridad HTTP | SEC-08 | Cubierto |
| Interfaz visual | Manual (sección 10) | Pendiente de evidencia visual |
| Carga/estrés | `scripts/load_test.py` (sección 5) | Ejecutado |

## 5. Prueba de carga y estrés

Script: `scripts/load_test.py` (solo lectura; no escribe datos).

Endpoints por defecto: `/api/health`, `/api/cultivos/`,
`/api/mediciones/?limit=20`, `/api/alertas/?limit=20`.

| Escenario | Peticiones | Concurrencia | Éxitos | Errores | Throughput | p50 | p95 | p99 | Máx. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Carga normal | 300 | 25 | 300 | 0 | 125.9 req/s | 151 ms | 371 ms | 489 ms | 502 ms |
| Estrés | 1000 | 50 | 1000 | 0 | 161.9 req/s | 298 ms | 414 ms | 472 ms | 483 ms |

- Entorno: API Uvicorn de 1 worker + PostgreSQL local, sin caché previa garantizada.
- Resultado: **0 errores 5xx**, `p95` < 500 ms en ambos escenarios.
- Conclusión: el sistema sostiene 50 peticiones concurrentes de lectura sin
  degradación crítica en el entorno de referencia (equipo de desarrollo local).
- Límite: no se probó escritura concurrente ni hardware IoT; no se definió aún
  un objetivo de SLA de producción.

## 6. Resultados de ejecución

| Fecha | Comando | Resultado | Discrepancias / notas |
| --- | --- | --- | --- |
| 2026-11-03 | `python -m pytest -q` | 28 pruebas aprobadas | Registro histórico previo a esta revisión. |
| 2026-11-10 | `python -m pytest -q` | 40 pruebas aprobadas en 71.84 s | SQLite en memoria; PostgreSQL intacto. Se añadieron límite de login, tokens inválidos, límites de medición y duplicados. |
| 2026-11-15 | `python -m pytest -q` | **49 pruebas aprobadas** en 86.10 s | Incluye recuperación con enlace mágico (AUTH-05); SQLite en memoria; PostgreSQL intacto. |
| 2026-11-10 | `ruff check .` | Sin errores | Lint de Python en todo el proyecto. |
| 2026-11-10 | `scripts/load_test.py --requests 300 --concurrency 25` | 300/300 OK; p95 371 ms | Sin errores. |
| 2026-11-10 | `scripts/load_test.py --requests 1000 --concurrency 50` | 1000/1000 OK; p95 414 ms | Sin errores. |

## 7. Comparación: esperado vs obtenido

| Esperado | Obtenido | Análisis |
| --- | --- | --- |
| Login debe limitar intentos y devolver 429 | Implementado y probado en esta revisión | El plan y `CHANGELOG` lo declaraban, pero el endpoint no lo aplicaba. Se corrigió y se añadió `SEC-09`. |
| Suite documentada con 28 casos | 49 casos automatizados | La documentación estaba desactualizada. Se actualizó y se amplió la cobertura de borde/seguridad, incluido el enlace mágico. |
| Cada endpoint sensible valida rol | 403/401 verificados en pruebas | Coherente con el diseño de autorización en API. |
| Aislamiento de datos por encargado | Verificado en cultivos, mediciones, alertas, históricos y riego | Correcto; los filtros usan `usuario_cultivo`. |
| Migraciones aditivas idempotentes | Verificado para cultivos y alertas | Correcto; conservan filas existentes. |
| Cero errores bajo carga | 0 errores en 300/25 y 1000/50 | Correcto en lectura; escritura concurrente no medida. |
| Cobertura visual 100 % | No automatizada | Requiere recorrido manual con navegador; pendiente de evidencia. |
| Arquitectura con PostgreSQL | Suite usa SQLite; carga usó PostgreSQL real | La suite no valida dialecto PostgreSQL; la prueba de carga sí lo ejerció. |

## 8. Validación de resultados

- **Aislamiento:** cada prueba crea un engine SQLite nuevo con `StaticPool` y
  revierte `get_db`; no hay estado compartido entre casos salvo los limitadores,
  que se limpian al iniciar cada fixture.
- **Cobertura negativa:** se prueban credenciales inválidas, tokens alterados,
  roles insuficientes, cultivos ajenos, rangos fuera de límite, duplicados y
  referencias inexistentes.
- **Idempotencia:** resolver alertas dos veces conserva `fecha_resolucion`;
  las migraciones aditivas se ejecutan dos veces sin duplicar columnas/índices.
- **Persistencia:** varias pruebas consultan la base directamente para
  confirmar que los datos se guardaron, no solo la respuesta HTTP.
- **Repetición:** la suite se ejecutó completa en verde (49/49) y el lint
  también. La carga se repitió con dos niveles de concurrencia con 0 errores.
- **Limitación:** la prueba de carga mide lectura y un login; no valida
  escrituras concurrentes, bloqueos de PostgreSQL ni múltiples workers.

## 9. Discrepancias detectadas y recomendaciones

1. **Límite de login ausente (corregido).** El plan lo exigía y la API no lo
   aplicaba. Ahora existe con configuración por entorno, respuesta 429,
   `Retry-After` y pruebas. *Recomendación:* en producción multi-worker, mover
   el estado a Redis para que el límite sea global.
2. **Documentación de pruebas desactualizada (corregido).** Se pasó de 28 a 49
   casos y se añadieron resultados reales de lint y carga, incluido el enlace
   mágico de recuperación.
3. **Sin pruebas de interfaz automatizadas.** *Recomendación:* incorporar
   Playwright o Cypress para login, navegación por rol y flujos críticos.
4. **Suite solo con SQLite.** *Recomendación:* añadir una prueba de integración
   opcional contra PostgreSQL en CI (servicio de contenedor) para validar
   dialecto, índices y migraciones.
5. **Sin prueba de escritura concurrente.** *Recomendación:* medir altas de
   mediciones y generación de alertas bajo carga con objetivos de latencia.
6. **Umbral de pH no genera alertas.** Documentado en el simulador.
   *Recomendación:* decidir si pH/conductividad deben alertar.
7. **Caché y limitadores por proceso.** *Recomendación:* Redis para varios
   workers y para invalidación de caché entre instancias.
8. **Riego/dispositivos sin lazo físico.** *Recomendación:* integrar un
   controlador IoT antes de prometer control real.
9. **Falta TLS y CSP.** *Recomendación:* proxy con HTTPS y política CSP
   estricta antes de producción.
10. **Sin objetivo de rendimiento formal.** *Recomendación:* fijar SLA (por
    ejemplo p95 < 800 ms con 100 usuarios concurrentes) y repetir la carga en
    el entorno de despliegue.

## 10. Validación manual pendiente (interfaz)

Con la API y el frontend en ejecución:

- [ ] Login, cierre de sesión y recuperación de contraseña.
- [ ] Menú y dashboard correctos para `admin`, `supervisor` y `encargado`.
- [ ] Cultivos, alertas, históricos y riego muestran datos reales.
- [ ] Mapa, calendario, tareas, incidencias e inventario operan por rol.
- [ ] Pantallas de administración (usuarios, instalaciones, dispositivos,
      umbrales) funcionan y bloquean acciones no permitidas.
- [ ] Reportes exportan CSV y generan PDF/Excel en el navegador.
- [ ] Tema oscuro, responsive y navegación por teclado.
- [ ] Centro de notificaciones se actualiza en vivo (SSE) y por sondeo.
- [ ] Sin errores en la consola del navegador.

Registra aquí la evidencia (fecha, navegador, capturas) al completar el
recorrido.
