# Changelog

Todas las fechas usan el formato AAAA-MM-DD.

## [Sin publicar]

### Agregado

- CRUD administrativo de umbrales con prioridad global < instalaciÃ³n < cultivo y generaciÃ³n de alertas al registrar mediciones.
- Resumen de reportes, exportaciÃ³n CSV e historial de reportes generados por usuario.
- Perfil de usuario y cambio de contraseÃ±a autenticado.
- Perfil ampliado: ediciÃ³n de datos personales y contactos de respaldo (`PUT /api/auth/me`), resumen de cultivos y alertas, fortaleza de contraseÃ±a, tema, zona horaria y accesos rÃ¡pidos.
- EdiciÃ³n y eliminaciÃ³n segura de usuarios con protecciÃ³n del Ãºltimo administrador.
- LÃ­mite de intentos de login por identificador e IP con HTTP 429 y `Retry-After`, configurable por entorno, y cabeceras de seguridad HTTP.
- Suite de integraciÃ³n ampliada a 49 pruebas, incluyendo tokens invÃ¡lidos, lÃ­mites de mediciÃ³n, duplicados, limitaciÃ³n de login, grupos de trabajo y recuperaciÃ³n con enlace mÃ¡gico.
- RecuperaciÃ³n de contraseÃ±a con enlace mÃ¡gico de un solo uso (`metodo=link`), token de alta entropÃ­a hasheado, vigencia configurable y lÃ­mite de verificaciones por IP.
- Despliegue reproducible con `Dockerfile`, `docker-compose.yml` (PostgreSQL + API + Nginx), proxy `/api`, `docs/despliegue.md` y configuraciÃ³n de API por entorno en `js/config.js`.
- Script de carga/estrÃ©s `scripts/load_test.py` con latencias p50/p95/p99.
- DocumentaciÃ³n de arquitectura, base de datos, seguridad, entorno, trazabilidad, decisiones (ADR) y cumplimiento de la rÃºbrica.
- ConexiÃ³n PostgreSQL con TLS (`sslmode=require`).
- Flujo de CI con lint y pytest y plantilla de Pull Request.
- Pantalla de perfil y administraciÃ³n de umbrales en el frontend.
- Grupos de trabajo administrables: supervisor responsable, encargados activos, color, estado y sectores derivados del supervisor; CRUD en `admin/grupos.html` y filtrado de responsables al asignar tareas.
- Mapa de instalaciones renovado: filtros instantÃ¡neos con contadores, KPIs operativos, densidad y pantalla completa, detecciÃ³n de superposiciones con autoordenado y panel de detalle con accesos directos.
- DocumentaciÃ³n de contribuciÃ³n y este registro de cambios.
- Panel "Mi grupo" en Equipo para supervisor y encargado, mostrando Ãºnicamente los grupos a los que pertenece cada usuario, y autoactualizaciÃ³n de la vista de grupos del administrador.
- Escalamiento de incidencias a administraciÃ³n con `POST /api/incidencias/{id}/escalar`: asigna a un admin, sube la prioridad, registra el motivo en el historial y notifica a administradores y reportante.
- Directorio de contactos de escalamiento en Mi perfil (`GET /api/equipo/contactos`) con supervisor de grupo, responsables de sector y administradores, incluyendo enlaces de email, llamada y WhatsApp.
- Script `scripts/migrate_to_postgres.py` para migrar datos desde MySQL/MariaDB, SQLite u otro PostgreSQL hacia la base oficial, con `--dry-run`, `--truncate` y reinicio de secuencias.
- Los dispositivos guardan direcciÃ³n IP/host y puerto TCP. Al registrarlos, editarlos o pulsar "Probar conexiÃ³n", la API verifica el alcance real con `POST /api/dispositivos/{id}/probar-conexion` y actualiza `ultimaconexion` si responde. Tiempo de espera configurable con `DEVICE_CONNECT_TIMEOUT`.

### Cambiado

- El acceso principal de los dashboards se muestra como «Inicio» en el menú lateral y en la cabecera, en lugar de «Dashboard».
- El mapa de instalaciones permite arrastrar sectores para administradores, muestra estado, ?rea, dispositivos y m?tricas por tarjeta, a?ade navegaci?n entre sectores, un estado vac?o guiado y mejoras responsive.
- La base PostgreSQL del proyecto pasa a llamarse `aquaplants` (antes `postgres`); `.env.example` y la documentaciÃ³n reflejan el nuevo nombre.
- Los dashboards, cultivos, histÃ³ricos, reportes, comparador y dispositivos consumen Ãºnicamente la API real.
- Instalaciones y dispositivos permiten lectura autenticada con alcance por cultivos; las mutaciones siguen siendo exclusivas de administradores.
- `setup_db.py` ya no contiene credenciales y usa variables de entorno para el administrador inicial.
- La ediciÃ³n de la distribuciÃ³n del mapa invalida la cachÃ© de lectura para reflejar los cambios de inmediato.
- Los supervisores solo asignan tareas a encargados de sus grupos de trabajo; la API valida la pertenencia y notifica al encargado.
- Equipo y Grupos se serializan por lote con consultas agregadas, evitando N+1 al crecer el equipo.

### Eliminado

- Datos y utilidades de demostraciÃ³n del frontend.
- Prototipo legacy Express/SQLite y archivos vacÃ­os de `api/`.
- Hoja de estilos vacÃ­a `dashboard-admin.css`.
