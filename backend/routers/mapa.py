"""Mapa visual de instalaciones y configuración de distribución."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from backend.cache import api_cache
from backend.database import get_db
from backend.models import (
    Alerta,
    ConfiguracionMapa,
    Cultivo,
    Dispositivo,
    EventoCalendario,
    Incidencia,
    Instalacion,
    Usuario,
)
from backend.schemas_ops import MapaConfigUpdate
from backend.security import get_current_active_user, require_admin
from backend.services import scoped_instalacion_ids
from backend.utils import utcnow

router = APIRouter(prefix="/mapa", tags=["Mapa de instalaciones"])


def _config_default(sector: Instalacion, index: int) -> dict:
    return {
        "posicion_x": (index % 3) * 4,
        "posicion_y": (index // 3) * 2,
        "ancho": 4,
        "alto": 2,
        "tipo_sector": "cultivo",
        "color": "#5E7A55",
    }


def _serializar_sector(
    sector: Instalacion,
    config: ConfiguracionMapa | None,
    index: int,
    cultivos: list[Cultivo],
    incidencias: list[Incidencia],
    dispositivos_count: int,
    alertas_count: int,
    ultima_inspeccion: EventoCalendario | None,
    proximo_mantenimiento: EventoCalendario | None,
) -> dict:
    layout = _config_default(sector, index)
    if config:
        layout = {
            "posicion_x": config.posicion_x,
            "posicion_y": config.posicion_y,
            "ancho": config.ancho,
            "alto": config.alto,
            "tipo_sector": config.tipo_sector,
            "color": config.color,
        }
    return {
        "id": sector.id,
        "nombre": sector.nombre,
        "ubicacion": sector.ubicacion,
        "descripcion": sector.descripcion,
        "area_m2": sector.area_m2,
        "activa": sector.activa,
        "responsable_id": sector.responsable_id,
        "responsable_nombre": (
            sector.responsable.nombre_completo if sector.responsable else None
        ),
        "layout": layout,
        "cultivos": [
            {
                "id": cultivo.id,
                "nombre": cultivo.nombre,
                "tipo_planta": cultivo.tipo_planta,
                "estado": cultivo.estado,
                "area_m2": cultivo.area_m2,
            }
            for cultivo in cultivos
        ],
        "cultivos_count": len(cultivos),
        "dispositivos_count": dispositivos_count,
        "alertas_count": alertas_count,
        "incidencias_abiertas": len(incidencias),
        "incidencias": [
            {
                "id": incidencia.id,
                "titulo": incidencia.titulo,
                "prioridad": incidencia.prioridad,
                "estado": incidencia.estado,
                "fecha_creacion": incidencia.fecha_creacion,
            }
            for incidencia in incidencias[:5]
        ],
        "ultima_inspeccion": {
            "titulo": ultima_inspeccion.titulo,
            "fecha": ultima_inspeccion.fecha_realizacion,
            "resultado": ultima_inspeccion.resultado,
        } if ultima_inspeccion else None,
        "proximo_mantenimiento": {
            "id": proximo_mantenimiento.id,
            "titulo": proximo_mantenimiento.titulo,
            "fecha": proximo_mantenimiento.fecha_inicio,
            "responsable": proximo_mantenimiento.responsable_nombre,
        } if proximo_mantenimiento else None,
    }


def _agrupar_por_sector(rows, attr: str = "sector_id") -> dict[int, list]:
    grouped: dict[int, list] = {}
    for row in rows:
        grouped.setdefault(getattr(row, attr), []).append(row)
    return grouped


def _primero_por_sector(rows, attr: str = "sector_id") -> dict[int, object]:
    first: dict[int, object] = {}
    for row in rows:
        first.setdefault(getattr(row, attr), row)
    return first


@router.get("/")
def obtener_mapa(
    estado: str | None = None,
    tipo_cultivo: str | None = None,
    buscar: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    cache_key = ("mapa", db.get_bind(), current_user.id, estado, tipo_cultivo, buscar)
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    query = db.query(Instalacion).options(joinedload(Instalacion.responsable))
    scope = scoped_instalacion_ids(db, current_user)
    if scope is not None:
        query = query.filter(Instalacion.id.in_(scope))
    if estado == "activas":
        query = query.filter(Instalacion.activa.is_(True))
    elif estado == "inactivas":
        query = query.filter(Instalacion.activa.is_(False))
    if buscar:
        pattern = f"%{buscar.strip()}%"
        query = query.filter(
            Instalacion.nombre.like(pattern) | Instalacion.ubicacion.like(pattern)
        )
    sectores = query.order_by(Instalacion.nombre).all()
    configs = {
        row.sector_id: row
        for row in db.query(ConfiguracionMapa).all()
    }

    ids = [sector.id for sector in sectores]
    cultivos_por_sector: dict[int, list] = {}
    incidencias_por_sector: dict[int, list] = {}
    ultima_inspeccion_por_sector: dict[int, object] = {}
    proximo_mantenimiento_por_sector: dict[int, object] = {}
    dispositivos_por_sector: dict[int, int] = {}
    alertas_por_sector: dict[int, int] = {}

    if ids:
        cultivos_por_sector = _agrupar_por_sector(
            db.query(Cultivo)
            .filter(Cultivo.instalacion_id.in_(ids))
            .order_by(Cultivo.nombre)
            .all(),
            "instalacion_id",
        )
        incidencias_por_sector = _agrupar_por_sector(
            db.query(Incidencia)
            .filter(
                Incidencia.sector_id.in_(ids),
                Incidencia.estado.notin_(("resuelta", "cerrada")),
            )
            .order_by(Incidencia.fecha_creacion.desc())
            .all()
        )
        ultima_inspeccion_por_sector = _primero_por_sector(
            db.query(EventoCalendario)
            .filter(
                EventoCalendario.sector_id.in_(ids),
                EventoCalendario.tipo == "inspeccion",
                EventoCalendario.estado == "completado",
            )
            .order_by(EventoCalendario.fecha_realizacion.desc())
            .all()
        )
        proximo_mantenimiento_por_sector = _primero_por_sector(
            db.query(EventoCalendario)
            .filter(
                EventoCalendario.sector_id.in_(ids),
                EventoCalendario.tipo == "mantenimiento",
                EventoCalendario.estado.in_(("programado", "en_ejecucion")),
                EventoCalendario.fecha_inicio >= utcnow(),
            )
            .order_by(EventoCalendario.fecha_inicio)
            .all()
        )
        dispositivos_por_sector = dict(
            db.query(Dispositivo.instalacion_id, func.count(Dispositivo.id))
            .filter(Dispositivo.instalacion_id.in_(ids))
            .group_by(Dispositivo.instalacion_id)
            .all()
        )
        alertas_por_sector = dict(
            db.query(Cultivo.instalacion_id, func.count(Alerta.id))
            .join(Alerta, Alerta.cultivo_id == Cultivo.id)
            .filter(
                Cultivo.instalacion_id.in_(ids),
                Alerta.resuelta.is_(False),
            )
            .group_by(Cultivo.instalacion_id)
            .all()
        )

    data = [
        _serializar_sector(
            sector,
            configs.get(sector.id),
            index,
            cultivos_por_sector.get(sector.id, []),
            incidencias_por_sector.get(sector.id, []),
            dispositivos_por_sector.get(sector.id, 0),
            alertas_por_sector.get(sector.id, 0),
            ultima_inspeccion_por_sector.get(sector.id),
            proximo_mantenimiento_por_sector.get(sector.id),
        )
        for index, sector in enumerate(sectores)
    ]
    if tipo_cultivo:
        data = [
            sector for sector in data
            if any(
                (cultivo.get("tipo_planta") or "").lower() == tipo_cultivo.lower()
                for cultivo in sector["cultivos"]
            )
        ]
    result = {
        "sectores": data,
        "total": len(data),
        "cultivos_total": sum(sector["cultivos_count"] for sector in data),
        "incidencias_abiertas": sum(sector["incidencias_abiertas"] for sector in data),
        "alertas_total": sum(sector["alertas_count"] for sector in data),
    }
    api_cache.set(cache_key, result, 6.0)
    return result


@router.put("/config/{sector_id}")
def actualizar_configuracion(
    sector_id: int,
    payload: MapaConfigUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    if not db.query(Instalacion.id).filter(Instalacion.id == sector_id).first():
        raise HTTPException(status_code=404, detail="Sector no encontrado")
    config = db.query(ConfiguracionMapa).filter(
        ConfiguracionMapa.sector_id == sector_id
    ).first()
    if not config:
        config = ConfiguracionMapa(sector_id=sector_id)
        db.add(config)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(config, campo, valor)
    db.commit()
    db.refresh(config)
    api_cache.clear()
    return {
        "sector_id": config.sector_id,
        "posicion_x": config.posicion_x,
        "posicion_y": config.posicion_y,
        "ancho": config.ancho,
        "alto": config.alto,
        "tipo_sector": config.tipo_sector,
        "color": config.color,
    }
