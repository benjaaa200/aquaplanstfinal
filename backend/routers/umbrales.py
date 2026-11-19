"""AquaPlants - Router de umbrales ambientales configurables."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Cultivo, Instalacion, Umbral, Usuario
from backend.schemas import (
    UmbralCreate,
    UmbralResponse,
    UmbralStatusUpdate,
    UmbralUpdate,
)
from backend.security import require_admin

router = APIRouter(prefix="/umbrales", tags=["Umbrales"])


def _validate_range(valor_minimo, valor_maximo):
    if (
        valor_minimo is not None
        and valor_maximo is not None
        and valor_minimo > valor_maximo
    ):
        raise HTTPException(
            status_code=422,
            detail="El valor mínimo no puede ser mayor que el valor máximo",
        )


def _validate_scope(db: Session, instalacion_id, cultivo_id):
    if instalacion_id is not None and not db.query(Instalacion.id).filter(
        Instalacion.id == instalacion_id
    ).first():
        raise HTTPException(status_code=404, detail="Instalación no encontrada")
    if cultivo_id is not None and not db.query(Cultivo.id).filter(
        Cultivo.id == cultivo_id
    ).first():
        raise HTTPException(status_code=404, detail="Cultivo no encontrado")


def _find_duplicate(db: Session, variable, instalacion_id, cultivo_id, exclude_id=None):
    query = db.query(Umbral).filter(Umbral.variable == variable)
    query = query.filter(
        Umbral.instalacion_id.is_(None)
        if instalacion_id is None
        else Umbral.instalacion_id == instalacion_id
    )
    query = query.filter(
        Umbral.cultivo_id.is_(None)
        if cultivo_id is None
        else Umbral.cultivo_id == cultivo_id
    )
    if exclude_id is not None:
        query = query.filter(Umbral.id != exclude_id)
    return query.first()


@router.get("/", response_model=list[UmbralResponse])
def listar_umbrales(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    return db.query(Umbral).order_by(Umbral.variable, Umbral.id).all()


@router.post("/", response_model=UmbralResponse, status_code=status.HTTP_201_CREATED)
def crear_umbral(
    datos: UmbralCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    _validate_range(datos.valor_minimo, datos.valor_maximo)
    _validate_scope(db, datos.instalacion_id, datos.cultivo_id)
    if _find_duplicate(
        db, datos.variable, datos.instalacion_id, datos.cultivo_id
    ):
        raise HTTPException(
            status_code=409,
            detail="Ya existe un umbral para esa variable y alcance",
        )

    umbral = Umbral(**datos.model_dump())
    db.add(umbral)
    db.commit()
    db.refresh(umbral)
    return umbral


@router.put("/{umbral_id}", response_model=UmbralResponse)
def actualizar_umbral(
    umbral_id: int,
    datos: UmbralUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    umbral = db.query(Umbral).filter(Umbral.id == umbral_id).first()
    if not umbral:
        raise HTTPException(status_code=404, detail="Umbral no encontrado")

    changes = datos.model_dump(exclude_unset=True)
    variable = changes.get("variable", umbral.variable)
    instalacion_id = changes.get("instalacion_id", umbral.instalacion_id)
    cultivo_id = changes.get("cultivo_id", umbral.cultivo_id)
    valor_minimo = changes.get("valor_minimo", umbral.valor_minimo)
    valor_maximo = changes.get("valor_maximo", umbral.valor_maximo)

    _validate_range(valor_minimo, valor_maximo)
    _validate_scope(db, instalacion_id, cultivo_id)
    if _find_duplicate(
        db, variable, instalacion_id, cultivo_id, exclude_id=umbral.id
    ):
        raise HTTPException(
            status_code=409,
            detail="Ya existe un umbral para esa variable y alcance",
        )

    for field, value in changes.items():
        setattr(umbral, field, value)
    db.commit()
    db.refresh(umbral)
    return umbral


@router.patch("/{umbral_id}/estado", response_model=UmbralResponse)
def cambiar_estado_umbral(
    umbral_id: int,
    datos: UmbralStatusUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    umbral = db.query(Umbral).filter(Umbral.id == umbral_id).first()
    if not umbral:
        raise HTTPException(status_code=404, detail="Umbral no encontrado")
    umbral.activo = datos.activo
    db.commit()
    db.refresh(umbral)
    return umbral


@router.delete("/{umbral_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_umbral(
    umbral_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    umbral = db.query(Umbral).filter(Umbral.id == umbral_id).first()
    if not umbral:
        raise HTTPException(status_code=404, detail="Umbral no encontrado")
    db.delete(umbral)
    db.commit()
