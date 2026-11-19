"""Persisted irrigation zone settings, schedules, and execution history."""
from datetime import datetime, time, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    Cultivo,
    ProgramacionRiego,
    Riego,
    Usuario,
    UsuarioCultivo,
    ZonaRiego,
)
from backend.security import get_current_active_user, visible_cultivo_ids


router = APIRouter(prefix="/riego", tags=["Riego"])


class ZonaRiegoUpdate(BaseModel):
    activa: bool


class ProgramacionRiegoCreate(BaseModel):
    zona_id: int = Field(gt=0)
    hora_inicio: time
    duracion: int = Field(ge=1, le=120)
    frecuencia: Literal[
        "diario", "lunes", "martes", "miercoles",
        "jueves", "viernes", "sabado", "domingo"
    ]


def _require_crop_access(db: Session, user: Usuario, crop_id: int) -> Cultivo:
    crop = db.query(Cultivo).filter(Cultivo.id == crop_id).first()
    if not crop:
        raise HTTPException(status_code=404, detail="Cultivo no encontrado")

    visible_ids = visible_cultivo_ids(db, user)
    if visible_ids is not None and not db.query(UsuarioCultivo.id).filter(
        UsuarioCultivo.usuario_id == user.id,
        UsuarioCultivo.cultivo_id == crop_id,
    ).first():
        raise HTTPException(
            status_code=403,
            detail="No tienes acceso a este cultivo"
        )
    return crop


def _get_or_create_zone(db: Session, crop_id: int) -> ZonaRiego:
    zone = db.query(ZonaRiego).filter(ZonaRiego.cultivo_id == crop_id).first()
    if zone:
        return zone

    zone = ZonaRiego(cultivo_id=crop_id, activa=True, duracion_programada=15)
    db.add(zone)
    try:
        db.flush()
        return zone
    except IntegrityError:
        db.rollback()
        zone = db.query(ZonaRiego).filter(
            ZonaRiego.cultivo_id == crop_id
        ).first()
        if not zone:
            raise
        return zone


@router.get("/zonas")
def obtener_zonas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    """Return one persisted software irrigation zone per accessible crop."""
    crops_query = db.query(Cultivo).order_by(Cultivo.id)
    visible_ids = visible_cultivo_ids(db, current_user)
    if visible_ids is not None:
        crops_query = crops_query.filter(Cultivo.id.in_(visible_ids))
    crops = crops_query.all()
    crop_ids = [crop.id for crop in crops]
    if not crop_ids:
        return []

    zones = {
        zone.cultivo_id: zone
        for zone in db.query(ZonaRiego).filter(
            ZonaRiego.cultivo_id.in_(crop_ids)
        ).all()
    }
    last_waterings = (
        db.query(Riego.cultivo_id, func.max(Riego.fecha_inicio))
        .filter(Riego.cultivo_id.in_(crop_ids))
        .group_by(Riego.cultivo_id)
        .all()
    )
    last_by_crop = {crop_id: started for crop_id, started in last_waterings}

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_usage = (
        db.query(Riego.cultivo_id, func.sum(Riego.consumo_litros))
        .filter(
            Riego.cultivo_id.in_(crop_ids),
            Riego.fecha_inicio >= start_of_day,
            Riego.fecha_inicio <= now,
        )
        .group_by(Riego.cultivo_id)
        .all()
    )
    usage_by_crop = {crop_id: float(total or 0) for crop_id, total in today_usage}
    schedule_counts = (
        db.query(ZonaRiego.cultivo_id, func.count(ProgramacionRiego.id))
        .join(ProgramacionRiego, ProgramacionRiego.zona_id == ZonaRiego.id)
        .filter(
            ZonaRiego.cultivo_id.in_(crop_ids),
            ProgramacionRiego.activa.is_(True),
        )
        .group_by(ZonaRiego.cultivo_id)
        .all()
    )
    schedules_by_crop = {crop_id: count for crop_id, count in schedule_counts}

    return [
        {
            "id": crop.id,
            "nombre": crop.ubicacion or f"Zona - {crop.nombre}",
            "cultivo_id": crop.id,
            "cultivo_nombre": crop.nombre,
            "activa": (
                zones[crop.id].activa
                if crop.id in zones else crop.estado == "activo"
            ),
            "ultimo_riego": (
                last_by_crop[crop.id].isoformat()
                if last_by_crop.get(crop.id) else None
            ),
            "duracion_programada": (
                zones[crop.id].duracion_programada
                if crop.id in zones else None
            ),
            "consumo_hoy": round(usage_by_crop.get(crop.id, 0), 2),
            "ciclos_programados": schedules_by_crop.get(crop.id, 0),
            "eficiencia": None,
        }
        for crop in crops
    ]


@router.put("/zonas/{zona_id}")
def actualizar_zona(
    zona_id: int,
    update: ZonaRiegoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    """Enable or disable software scheduling for the crop-backed zone."""
    crop = _require_crop_access(db, current_user, zona_id)
    zone = _get_or_create_zone(db, crop.id)
    zone.activa = update.activa
    if not update.activa:
        db.query(ProgramacionRiego).filter(
            ProgramacionRiego.zona_id == zone.id,
            ProgramacionRiego.activa.is_(True),
        ).update(
            {ProgramacionRiego.activa: False},
            synchronize_session=False,
        )
    db.commit()
    return {"id": crop.id, "activa": zone.activa}


@router.get("/historial")
def obtener_historial(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    """Return actual watering records; schedules are not execution records."""
    query = db.query(Riego, Cultivo).join(Cultivo, Riego.cultivo_id == Cultivo.id)
    visible_ids = visible_cultivo_ids(db, current_user)
    if visible_ids is not None:
        query = query.filter(Riego.cultivo_id.in_(visible_ids))

    records = query.order_by(Riego.fecha_inicio.desc()).limit(limit).all()
    return [
        {
            "id": watering.id,
            "zona": watering.zona or crop.ubicacion or f"Zona - {crop.nombre}",
            "duracion": watering.duracion_minutos,
            "consumo": watering.consumo_litros,
            "tipo": watering.tipo or "manual",
            "estado": watering.estado or "completado",
            "fecha": (
                watering.fecha_inicio.isoformat()
                if watering.fecha_inicio else None
            ),
        }
        for watering, crop in records
    ]


@router.post("/programar", status_code=201)
def programar_riego(
    schedule: ProgramacionRiegoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    """Persist a schedule; physical irrigation requires a connected controller."""
    crop = _require_crop_access(db, current_user, schedule.zona_id)
    zone = _get_or_create_zone(db, crop.id)
    if not zone.activa:
        raise HTTPException(
            status_code=409,
            detail="Activa la zona antes de programar un ciclo"
        )

    scheduled = ProgramacionRiego(
        zona_id=zone.id,
        hora_inicio=schedule.hora_inicio.strftime("%H:%M"),
        duracion_minutos=schedule.duracion,
        frecuencia=schedule.frecuencia,
        activa=True,
        created_by=current_user.id,
    )
    zone.duracion_programada = schedule.duracion
    db.add(scheduled)
    db.commit()
    db.refresh(scheduled)
    return {
        "id": scheduled.id,
        "zona_id": schedule.zona_id,
        "hora_inicio": scheduled.hora_inicio,
        "duracion": scheduled.duracion_minutos,
        "frecuencia": scheduled.frecuencia,
        "activa": scheduled.activa,
        "mensaje": (
            "Programación guardada. No hay un controlador de riego conectado; "
            "el ciclo no se ejecutará físicamente."
        ),
    }
