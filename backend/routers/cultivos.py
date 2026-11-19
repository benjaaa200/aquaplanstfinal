"""
AquaPlants - Router de Cultivos
Endpoints para gestionar los cultivos hidropónicos.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend.models import Cultivo, Instalacion, Usuario
from backend.schemas import CultivoCreate, CultivoResponse
from backend.security import get_current_active_user, require_admin, visible_cultivo_ids

router = APIRouter(prefix="/cultivos", tags=["Cultivos"])

@router.get("/", response_model=List[CultivoResponse])
def obtener_cultivos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    Obtiene la lista de todos los cultivos.
    """
    query = db.query(Cultivo).order_by(Cultivo.id)
    cultivo_ids = visible_cultivo_ids(db, current_user)
    if cultivo_ids is not None:
        query = query.filter(Cultivo.id.in_(cultivo_ids))
    return query.all()

@router.post("/", response_model=CultivoResponse, status_code=status.HTTP_201_CREATED)
def crear_cultivo(
    cultivo: CultivoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    """
    Crea un nuevo cultivo en la base de datos.
    """
    # Convertir el esquema de Pydantic a diccionario para crear el modelo SQLAlchemy
    if cultivo.instalacion_id and not db.query(Instalacion.id).filter(
        Instalacion.id == cultivo.instalacion_id
    ).first():
        raise HTTPException(status_code=422, detail="Instalación no encontrada")
    nuevo_cultivo = Cultivo(**cultivo.model_dump())
    
    db.add(nuevo_cultivo)
    db.commit()
    db.refresh(nuevo_cultivo)
    return nuevo_cultivo

@router.delete("/{cultivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cultivo(
    cultivo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    """
    Elimina un cultivo por su ID.
    """
    cultivo = db.query(Cultivo).filter(Cultivo.id == cultivo_id).first()
    if not cultivo:
        raise HTTPException(status_code=404, detail="Cultivo no encontrado")
    
    db.delete(cultivo)
    db.commit()
    return None