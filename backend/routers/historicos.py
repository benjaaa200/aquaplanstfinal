"""
AquaPlants - Router de Históricos
Endpoint para obtener datos históricos con filtros por fecha y cultivo.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime

from backend.database import get_db
from backend.models import Medicion, Usuario
from backend.schemas import MedicionResponse
from backend.security import get_current_active_user, visible_cultivo_ids

router = APIRouter(prefix="/historicos", tags=["Históricos"])

@router.get("/", response_model=List[MedicionResponse])
def obtener_historicos(
    start: datetime = Query(..., description="Fecha de inicio (YYYY-MM-DDTHH:MM:SS)"),
    end: datetime = Query(..., description="Fecha de fin (YYYY-MM-DDTHH:MM:SS)"),
    cultivo_id: Optional[int] = Query(None, description="ID del cultivo (opcional)"),
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    Obtiene mediciones históricas en un rango de fechas.
    """
    query = db.query(Medicion).filter(
        and_(
            Medicion.fecha_hora >= start,
            Medicion.fecha_hora <= end
        )
    )
    
    if cultivo_id:
        query = query.filter(Medicion.cultivo_id == cultivo_id)

    visible_ids = visible_cultivo_ids(db, current_user)
    if visible_ids is not None:
        query = query.filter(Medicion.cultivo_id.in_(visible_ids))
    
    # Ordenar de más antiguo a más reciente para gráficos
    mediciones = query.order_by(Medicion.fecha_hora.asc()).offset(offset).limit(limit).all()
    return mediciones