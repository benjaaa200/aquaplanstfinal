# Trazabilidad interfaz ↔ negocio ↔ API

Relación entre las necesidades de negocio, las vistas del frontend y los
endpoints que las sostienen. Todas las pantallas consumen la API real (no hay
mocks ni datos de demostración en el frontend).

## 1. Procesos de negocio cubiertos

| # | Proceso de negocio | Vista(s) | Endpoints principales | Roles |
| --- | --- | --- | --- | --- |
| 1 | Iniciar sesión y recuperar acceso | `index.html` | `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/verify-reset-code`, `POST /api/auth/reset-password` | Todos |
| 2 | Consultar perfil, contactos de escalamiento y cambiar contraseña | `pages/perfil.html` | `GET /api/auth/me`, `GET /api/equipo/contactos`, `PUT /api/auth/change-password` | Todos |
| 3 | Monitorear KPIs según rol | `pages/dashboard.html`, `dashboard-admin`, `dashboard-supervisor`, `dashboard-encargado` | `GET /api/dashboard/kpis`, `/api/alertas/`, `/api/cultivos/`, `/api/mediciones/`, `/api/dispositivos/` | Todos |
| 4 | Gestionar cultivos | `pages/cultivos.html` | `GET/POST /api/cultivos/`, `PUT/DELETE /api/cultivos/{id}` | Admin muta; supervisor/encargado leen |
| 5 | Ver series históricas y comparar cultivos | `pages/historicos.html`, `pages/comparador.html` | `GET /api/historicos/`, `/api/cultivos/` | Todos según alcance |
| 6 | Atender alertas (leer/resolver) | `pages/alertas.html` | `GET /api/alertas/`, `PUT /api/alertas/{id}/leer`, `PUT /api/alertas/{id}/resolver`, `PUT /api/alertas/marcar-todas` | Todos según alcance |
| 7 | Programar y revisar riego | `pages/riego.html` | `GET /api/riego/zonas`, `/api/riego/historial`, `PUT /api/riego/zonas/{id}`, `POST /api/riego/programar` | Encargado/admin |
| 8 | Administrar instalaciones/sectores | `admin/instalaciones.html` | `GET/POST /api/instalaciones/`, `PUT /api/instalaciones/{id}`, `PATCH .../estado`, `DELETE .../{id}` | Admin |
| 9 | Administrar dispositivos IoT | `admin/dispositivos.html`, `pages/dispositivos.html` | `GET/POST /api/dispositivos/`, `PUT .../{id}`, `PATCH .../estado`, `DELETE .../{id}` | Admin muta; lectura autenticada |
| 10 | Definir umbrales de alerta | `admin/umbrales.html` | `GET/POST /api/umbrales/`, `PUT .../{id}`, `PATCH .../estado`, `DELETE .../{id}` | Admin |
| 11 | Gestionar usuarios y asignaciones | `admin/usuarios.html` | `GET/POST /api/usuarios/`, `PUT/DELETE .../{id}`, `PUT .../{id}/cultivos` | Admin |
| 12 | Centro de notificaciones en vivo | Topbar + `pages/notificaciones.html` | `GET /api/notificaciones/`, `/resumen`, `PUT .../{id}/leer`, `PUT /marcar-todas`, `POST /enviar`, `GET /stream` (SSE) | Todos |
| 13 | Gestionar tareas (Kanban) | `pages/tareas.html` | `GET/POST /api/tareas/`, `PUT .../{id}/estado`, `POST .../{id}/comentarios`, `GET /tareas/resumen` | Admin/supervisor crea; encargado ejecuta |
| 14 | Registrar y resolver incidencias | `pages/incidencias.html` | `GET/POST /api/incidencias/`, `PUT .../{id}`, `PUT .../{id}/estado`, `POST .../{id}/comentarios`, `POST .../{id}/escalar`, `GET /estadisticas` | Admin/encargado |
| 15 | Controlar inventario y solicitudes | `pages/inventario.html` | `GET/POST /api/inventario/productos`, `/movimientos`, `/solicitudes`, `GET /alertas` | Admin/encargado |
| 16 | Planificar calendario agrícola | `pages/calendario.html` | `GET/POST /api/calendario/eventos`, `PUT .../{id}`, `POST .../{id}/completar`, `GET /resumen` | Admin/encargado |
| 17 | Visualizar mapa de instalaciones | `pages/mapa.html` | `GET /api/mapa/`, `PUT /api/mapa/config/{sector_id}` | Todos leen; admin edita |
| 18 | Coordinar equipo y actividad | `pages/equipo.html` | `GET /api/equipo/`, `GET /api/equipo/contactos`, `GET /api/equipo/{id}/actividad`, `PUT /api/equipo/{id}/sectores` | Admin/supervisor/encargado |
| 19 | Analizar rendimiento | `pages/rendimiento.html` | `GET /api/rendimiento/` | Admin/supervisor |
| 20 | Generar y descargar reportes | `pages/reportes.html` | `GET /api/reportes/resumen`, `/export`, `POST /historial`, `GET/DELETE /historial` | Todos según alcance |
| 21 | Simular sensores sin hardware | `simulador/index.html`, `scripts/simulate_devices.py` | `POST /api/mediciones/` | Admin |
| 22 | Organizar grupos de trabajo | `admin/grupos.html` | `GET/POST /api/grupos/`, `PUT/DELETE /api/grupos/{id}` | Admin gestiona; supervisor/encargado consultan su grupo |

## 2. Navegación y coherencia visual

- `js/layout.js` inyecta una **única** barra lateral, topbar, buscador global,
  centro de notificaciones y filtros globales en todas las páginas, evitando
  duplicación y manteniendo el mismo comportamiento.
- La barra lateral se organiza por áreas: Principal, Monitoreo, Operación,
  Análisis, Administración y Cuenta. Los elementos de administración solo
  aparecen para `admin` (y la API vuelve a validar el permiso).
- El dashboard se selecciona automáticamente según el rol
  (`dashboard-admin`, `dashboard-supervisor`, `dashboard-encargado`).
- El selector de tema y el estado de la barra lateral se recuerdan en
  `localStorage`.

## 3. Sistema de diseño

`css/aqua-identity.css` concentra los **tokens** y componentes:

- Paleta natural (bosque, oliva, salvia, marfil, terracota) con variables
  `--g-*` y aliases retrocompatibles (`--primary`, `--surface`, etc.).
- Tipografías: `Inter` (cuerpo), `Plus Jakarta Sans` (títulos) y `Fraunces`
  (display editorial).
- Radios, sombras, espaciados y estados semánticos (`success`, `warning`,
  `danger`, `info`) reutilizados en todos los módulos.
- Componentes unificados: tarjetas, botones, formularios, tablas, badges,
  modales, estados vacíos, panel de notificaciones, mapa, calendario, kanban y
  login.
- **Tema oscuro** completo mediante `[data-theme="dark"]`, con contraste
  ajustado y sin duplicar componentes.

Los CSS por módulo (`dashboard.css`, `alertas.css`, etc.) solo añaden
particularidades; la identidad global se define una vez.

## 4. Accesibilidad y usabilidad

- Etiquetas `aria-label`, `aria-expanded`, `aria-live` y roles (`search`,
  `dialog`) en controles dinámicos.
- Navegación por teclado en el buscador global (`Ctrl K`, flechas, `Enter`,
  `Esc`) y foco visible (`:focus-visible`).
- Mensajes de error y éxito con `role="alert"`.
- Diseño responsive (`responsive.css` y media queries) para escritorio, tablet
  y móvil.
- Estado de conexión ("Actualizado hace…", "Sin conexión") y refresco manual.
- Confirmaciones para acciones destructivas en las pantallas administrativas.

## 5. Cómo verificar la coherencia

1. Inicia sesión con cada rol y compara el menú y los dashboards.
2. Recorre cada proceso de la tabla y confirma que la vista llama al endpoint
   indicado (consola → red del navegador).
3. Intenta una mutación administrativa como `encargado`/`supervisor`: la API
   debe responder 403 aunque el control esté visible.
4. Activa el tema oscuro y reduce la ventana para revisar contraste y layout.
5. Navega solo con teclado y verifica el foco y los atajos.

La evidencia visual y funcional se registra en
[`docs/plan-pruebas.md`](plan-pruebas.md).
