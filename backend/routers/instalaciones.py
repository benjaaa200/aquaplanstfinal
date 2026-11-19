from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Alerta, Cultivo, Dispositivo, Instalacion, Usuario
from backend.schemas import (
    InstalacionCreate,
    InstalacionStatusUpdate,
    InstalacionUpdate,
)
from backend.security import (
    get_current_active_user,
    require_admin,
    visible_cultivo_ids,
)

router = APIRouter(prefix="/instalaciones", tags=["Instalaciones"])
admin_router = APIRouter(tags=["Administración"])


def _responsable(db: Session, responsable_id: int | None) -> None:
    if responsable_id is None:
        return
    user = db.query(Usuario).filter(Usuario.id == responsable_id).first()
    if not user or not user.activo or (user.rol or "").lower() != "encargado":
        raise HTTPException(status_code=422, detail="Responsable inválido")


def _serializar(instalacion: Instalacion, db: Session) -> dict:
    cultivos_count = db.query(func.count(Cultivo.id)).filter(
        Cultivo.instalacion_id == instalacion.id
    ).scalar()
    dispositivos_count = db.query(func.count(Dispositivo.id)).filter(
        Dispositivo.instalacion_id == instalacion.id
    ).scalar()
    alertas_count = db.query(func.count(Alerta.id)).join(
        Cultivo, Alerta.cultivo_id == Cultivo.id
    ).filter(Cultivo.instalacion_id == instalacion.id, Alerta.resuelta.is_(False)).scalar()
    return {
        "id": instalacion.id,
        "nombre": instalacion.nombre,
        "descripcion": instalacion.descripcion,
        "ubicacion": instalacion.ubicacion,
        "area_m2": instalacion.area_m2,
        "responsable_id": instalacion.responsable_id,
        "responsable_nombre": (
            instalacion.responsable.nombre_completo if instalacion.responsable else None
        ),
        "activa": instalacion.activa,
        "fecha_creacion": instalacion.fecha_creacion,
        "dispositivos_count": dispositivos_count,
        "cultivos_count": cultivos_count,
        "alertas_count": alertas_count,
    }


@router.get("/")
def listar_instalaciones(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(Instalacion)
    cultivo_ids = visible_cultivo_ids(db, current_user)
    if cultivo_ids is not None:
        instalacion_ids = db.query(Cultivo.instalacion_id).filter(
            Cultivo.id.in_(cultivo_ids),
            Cultivo.instalacion_id.isnot(None),
        )
        query = query.filter(Instalacion.id.in_(instalacion_ids))
    instalaciones = query.order_by(Instalacion.nombre).all()
    return [_serializar(item, db) for item in instalaciones]


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_instalacion(
    datos: InstalacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    _responsable(db, datos.responsable_id)
    instalacion = Instalacion(**datos.model_dump())
    db.add(instalacion)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una instalación con ese nombre") from exc
    db.refresh(instalacion)
    return _serializar(instalacion, db)


@router.put("/{instalacion_id}")
def actualizar_instalacion(
    instalacion_id: int,
    datos: InstalacionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    instalacion = db.query(Instalacion).filter(Instalacion.id == instalacion_id).first()
    if not instalacion:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")
    cambios = datos.model_dump(exclude_unset=True)
    if "responsable_id" in cambios:
        _responsable(db, cambios["responsable_id"])
    for campo, valor in cambios.items():
        setattr(instalacion, campo, valor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una instalación con ese nombre") from exc
    db.refresh(instalacion)
    return _serializar(instalacion, db)


@router.patch("/{instalacion_id}/estado")
def cambiar_estado_instalacion(
    instalacion_id: int,
    datos: InstalacionStatusUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    instalacion = db.query(Instalacion).filter(Instalacion.id == instalacion_id).first()
    if not instalacion:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")
    instalacion.activa = datos.activa
    db.commit()
    db.refresh(instalacion)
    return _serializar(instalacion, db)


@router.delete("/{instalacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_instalacion(
    instalacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    instalacion = db.query(Instalacion).filter(Instalacion.id == instalacion_id).first()
    if not instalacion:
        raise HTTPException(status_code=404, detail="Instalación no encontrada")
    if db.query(Cultivo.id).filter(Cultivo.instalacion_id == instalacion_id).first():
        raise HTTPException(status_code=409, detail="Desasigna los cultivos antes de eliminar")
    if db.query(Dispositivo.id).filter(Dispositivo.instalacion_id == instalacion_id).first():
        raise HTTPException(status_code=409, detail="Desasigna los dispositivos antes de eliminar")
    db.delete(instalacion)
    db.commit()
@admin_router.get("/admin/estadisticas")
def estadisticas_administrativas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    return {
        "total_instalaciones": db.query(Instalacion.id).count(),
        "instalaciones_activas": db.query(Instalacion.id).filter(
            Instalacion.activa.is_(True)
        ).count(),
        "total_dispositivos": db.query(Dispositivo.id).count(),
        "alertas_activas": db.query(Alerta.id).filter(
            Alerta.resuelta.is_(False)
        ).count(),
    }
