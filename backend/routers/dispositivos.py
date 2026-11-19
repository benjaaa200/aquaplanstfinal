from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import DEVICE_CONNECT_TIMEOUT
from backend.connectivity import DEFAULT_DEVICE_PORT, probar_conexion
from backend.database import get_db
from backend.models import Cultivo, Dispositivo, Instalacion, Usuario
from backend.schemas import (
    DispositivoCreate,
    DispositivoStatusUpdate,
    DispositivoUpdate,
)
from backend.security import (
    get_current_active_user,
    require_admin,
    visible_cultivo_ids,
)
from backend.utils import utcnow

router = APIRouter(prefix="/dispositivos", tags=["Dispositivos"])


def _instalacion_valida(db: Session, instalacion_id: int | None) -> None:
    if instalacion_id is not None and not db.query(Instalacion.id).filter(
        Instalacion.id == instalacion_id
    ).first():
        raise HTTPException(status_code=422, detail="Instalación no encontrada")


def _serializar(dispositivo: Dispositivo) -> dict:
    return {
        "id": dispositivo.id,
        "nombre": dispositivo.nombre,
        "tipo": dispositivo.tipo,
        "modelo": dispositivo.modelo,
        "direccion_mac": dispositivo.direccion_mac,
        "direccion_ip": dispositivo.direccion_ip,
        "puerto": dispositivo.puerto,
        "descripcion": dispositivo.descripcion,
        "instalacion_id": dispositivo.instalacion_id,
        "instalacion_nombre": (
            dispositivo.instalacion.nombre if dispositivo.instalacion else None
        ),
        "estado": dispositivo.estado,
        "ultimaconexion": dispositivo.ultimaconexion,
        "fecha_creacion": dispositivo.fecha_creacion,
    }


def _comprobar_conexion(dispositivo: Dispositivo) -> dict | None:
    """Check TCP reachability and record the last successful connection."""
    if not dispositivo.direccion_ip:
        return None
    resultado = probar_conexion(
        dispositivo.direccion_ip,
        dispositivo.puerto,
        timeout=DEVICE_CONNECT_TIMEOUT,
    )
    if resultado["alcanzable"]:
        dispositivo.ultimaconexion = utcnow()
    return resultado


@router.get("/")
def listar_dispositivos(
    instalacion_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(Dispositivo).order_by(Dispositivo.nombre)
    cultivo_ids = visible_cultivo_ids(db, current_user)
    if cultivo_ids is not None:
        instalacion_ids = db.query(Cultivo.instalacion_id).filter(
            Cultivo.id.in_(cultivo_ids),
            Cultivo.instalacion_id.isnot(None),
        )
        query = query.filter(Dispositivo.instalacion_id.in_(instalacion_ids))
    if instalacion_id is not None:
        query = query.filter(Dispositivo.instalacion_id == instalacion_id)
    return [_serializar(item) for item in query.all()]


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_dispositivo(
    datos: DispositivoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    _instalacion_valida(db, datos.instalacion_id)
    valores = datos.model_dump()
    if valores["direccion_mac"]:
        valores["direccion_mac"] = valores["direccion_mac"].upper().replace("-", ":")
    valores["puerto"] = valores.get("puerto") or DEFAULT_DEVICE_PORT
    dispositivo = Dispositivo(**valores)
    db.add(dispositivo)
    conexion = _comprobar_conexion(dispositivo)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El nombre o la dirección MAC ya están registrados") from exc
    db.refresh(dispositivo)
    respuesta = _serializar(dispositivo)
    if conexion is not None:
        respuesta["conexion"] = conexion
    return respuesta


@router.put("/{dispositivo_id}")
def actualizar_dispositivo(
    dispositivo_id: int,
    datos: DispositivoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    dispositivo = db.query(Dispositivo).filter(Dispositivo.id == dispositivo_id).first()
    if not dispositivo:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    cambios = datos.model_dump(exclude_unset=True)
    if "instalacion_id" in cambios:
        _instalacion_valida(db, cambios["instalacion_id"])
    if cambios.get("direccion_mac"):
        cambios["direccion_mac"] = cambios["direccion_mac"].upper().replace("-", ":")
    if "puerto" in cambios and cambios["puerto"] is None:
        cambios["puerto"] = DEFAULT_DEVICE_PORT
    for campo, valor in cambios.items():
        setattr(dispositivo, campo, valor)
    conexion = None
    if {"direccion_ip", "puerto"} & cambios.keys():
        conexion = _comprobar_conexion(dispositivo)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="El nombre o la dirección MAC ya están registrados") from exc
    db.refresh(dispositivo)
    respuesta = _serializar(dispositivo)
    if conexion is not None:
        respuesta["conexion"] = conexion
    return respuesta


@router.patch("/{dispositivo_id}/estado")
def cambiar_estado_dispositivo(
    dispositivo_id: int,
    datos: DispositivoStatusUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    dispositivo = db.query(Dispositivo).filter(Dispositivo.id == dispositivo_id).first()
    if not dispositivo:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    dispositivo.estado = datos.estado
    db.commit()
    db.refresh(dispositivo)
    return _serializar(dispositivo)


@router.post("/{dispositivo_id}/probar-conexion")
def probar_conexion_dispositivo(
    dispositivo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    """Try to reach the device over TCP and update its last-connection time."""
    dispositivo = db.query(Dispositivo).filter(Dispositivo.id == dispositivo_id).first()
    if not dispositivo:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    if not dispositivo.direccion_ip:
        raise HTTPException(
            status_code=422,
            detail="El dispositivo no tiene una dirección IP configurada",
        )
    conexion = _comprobar_conexion(dispositivo)
    if conexion and conexion["alcanzable"]:
        db.commit()
        db.refresh(dispositivo)
    respuesta = _serializar(dispositivo)
    respuesta["conexion"] = conexion
    return respuesta


@router.delete("/{dispositivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_dispositivo(
    dispositivo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    dispositivo = db.query(Dispositivo).filter(Dispositivo.id == dispositivo_id).first()
    if not dispositivo:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    db.delete(dispositivo)
    db.commit()
