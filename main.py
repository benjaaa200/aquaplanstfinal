"""
AquaPlants - Aplicación Principal FastAPI
Punto de entrada del servidor backend.
"""
from contextlib import asynccontextmanager
import logging
import os
import time

from anyio import to_thread
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from backend.config import CORS_ORIGINS, SKIP_INIT_DB
from backend.database import engine, init_db
from backend.logging_config import configure_logging
from backend.routers import usuarios  

configure_logging()
logger = logging.getLogger("aquaplants.api")


class ConditionalGZipMiddleware(GZipMiddleware):
    """Skip compression for long-lived streams such as Server-Sent Events."""

    async def __call__(self, scope, receive, send):
        if (
            scope.get("type") == "http"
            and scope.get("path", "").endswith("/notificaciones/stream")
        ):
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)


# Importar solo los routers que existen y están listos
from backend.routers import (
    auth, mediciones, dashboard, alertas, cultivos, historicos, riego,
    instalaciones, dispositivos, umbrales, reportes,
    notificaciones, incidencias, tareas, inventario, calendario, mapa,
    equipo, rendimiento, grupos,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Más hilos permiten atender más peticiones síncronas en paralelo.
    try:
        to_thread.current_default_thread_limiter().total_tokens = int(
            os.getenv("API_THREADS", "60")
        )
    except (AttributeError, ValueError):
        logger.warning("No se pudo configurar API_THREADS; se usa el valor por defecto")
    if SKIP_INIT_DB:
        logger.info("SKIP_INIT_DB activo: no se ejecuta DDL automático.")
    else:
        init_db()
    logger.info("AquaPlants API iniciada.")
    yield


app = FastAPI(
    title="AquaPlants API",
    description="Sistema de Monitoreo de Cultivos Hidropónicos IoT",
    version="1.0.0",
    lifespan=lifespan,
)

# Configuración de CORS para permitir peticiones desde el frontend (Live Server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Comprime respuestas grandes para reducir ancho de banda con muchos usuarios.
app.add_middleware(ConditionalGZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every request with status and latency for basic observability."""
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    if request.url.path not in {"/docs", "/redoc", "/openapi.json"}:
        logger.info(
            "%s %s -> %s (%.1f ms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return a generic error without leaking internal details."""
    logger.exception(
        "Excepción no controlada en %s %s", request.method, request.url.path
    )
    return JSONResponse(
        status_code=500, content={"detail": "Error interno del servidor"}
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = (
        "geolocation=(), microphone=(), camera=()"
    )
    return response

# Registrar los routers (Nota: auth.router ya tiene "/auth" interno, así que solo ponemos "/api")
app.include_router(auth.router, prefix="/api", tags=["Autenticación"])
app.include_router(mediciones.router, prefix="/api", tags=["Mediciones IoT"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(alertas.router, prefix="/api", tags=["Alertas"])
app.include_router(cultivos.router, prefix="/api", tags=["Cultivos"])
app.include_router(historicos.router, prefix="/api", tags=["Históricos"])
app.include_router(riego.router, prefix="/api", tags=["Riego"])
app.include_router(usuarios.router, prefix="/api", tags=["Gestión de Usuarios"])
app.include_router(instalaciones.router, prefix="/api")
app.include_router(instalaciones.admin_router, prefix="/api")
app.include_router(dispositivos.router, prefix="/api")
app.include_router(umbrales.router, prefix="/api")
app.include_router(reportes.router, prefix="/api")
app.include_router(notificaciones.router, prefix="/api")
app.include_router(incidencias.router, prefix="/api")
app.include_router(tareas.router, prefix="/api")
app.include_router(inventario.router, prefix="/api")
app.include_router(calendario.router, prefix="/api")
app.include_router(mapa.router, prefix="/api")
app.include_router(equipo.router, prefix="/api")
app.include_router(rendimiento.router, prefix="/api")
app.include_router(grupos.router, prefix="/api")

# Endpoint raíz para verificar que el servidor está vivo
@app.get("/")
def root():
    return {
        "message": "AquaPlants API funcionando correctamente",
        "docs": "/docs"
    }


@app.get("/api/health")
def health():
    """Report API health only when the configured database is reachable."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok"}