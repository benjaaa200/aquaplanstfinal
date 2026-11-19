from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime

from backend.database import get_db
from backend.models import Alerta, Usuario
from backend.schemas import AlertaResponse, AlertaUpdate
from backend.security import (
    get_current_active_user,
    is_admin,
    require_cultivo_access,
    visible_cultivo_ids,
)

router = APIRouter(prefix="/alertas", tags=["Alertas"])

@router.get("/", response_model=List[AlertaResponse])
def obtener_alertas(
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    Obtiene todas las alertas ordenadas por fecha (más recientes primero).
    """
    query = db.query(Alerta).options(
        joinedload(Alerta.cultivo)
    ).order_by(Alerta.fecha_hora.desc())
    cultivo_ids = visible_cultivo_ids(db, current_user)
    if cultivo_ids is not None:
        query = query.filter(Alerta.cultivo_id.in_(cultivo_ids))
    alertas = query.offset(offset).limit(limit).all()
    return alertas

@router.put("/{alerta_id}/leer", response_model=AlertaResponse)
def marcar_alerta_leida(
    alerta_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    Marca una alerta específica como leída.
    """
    alerta = db.query(Alerta).filter(Alerta.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    require_cultivo_access(db, current_user, alerta.cultivo_id)
    
    if not alerta.leida:
        alerta.leida = True
        alerta.fecha_lectura = datetime.utcnow()
    db.commit()
    db.refresh(alerta)
    return alerta

@router.put("/marcar-todas", status_code=status.HTTP_200_OK)
def marcar_todas_leidas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    Marca todas las alertas no leídas como leídas.
    """
    query = db.query(Alerta).filter(Alerta.leida.is_(False))
    cultivo_ids = visible_cultivo_ids(db, current_user)
    if cultivo_ids is not None:
        query = query.filter(Alerta.cultivo_id.in_(cultivo_ids))
    updated = query.update(
        {
            Alerta.leida: True,
            Alerta.fecha_lectura: func.coalesce(
                Alerta.fecha_lectura, datetime.utcnow()
            ),
        },
        synchronize_session=False,
    )
    db.commit()
    return {"message": f"{updated} alertas marcadas como leídas", "updated": updated}


@router.put("/{alerta_id}/resolver", response_model=AlertaResponse)
def resolver_alerta(
    alerta_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """Resolve an alert belonging to a crop the current user can access."""
    alerta = db.query(Alerta).filter(Alerta.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    require_cultivo_access(db, current_user, alerta.cultivo_id)

    if not alerta.resuelta:
        resolved_at = datetime.utcnow()
        alerta.resuelta = True
        alerta.fecha_resolucion = resolved_at
        if not alerta.leida:
            alerta.leida = True
            alerta.fecha_lectura = resolved_at
    db.commit()
    db.refresh(alerta)
    return alerta

@router.delete("/{alerta_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_alerta(
    alerta_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    Elimina una alerta del sistema (solo administradores).
    """
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Solo administradores pueden eliminar alertas")
    
    alerta = db.query(Alerta).filter(Alerta.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    
    db.delete(alerta)
    db.commit()
    return None