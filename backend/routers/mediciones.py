from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend.models import Alerta, Cultivo, Medicion, Umbral, Usuario
from backend.schemas import MedicionCreate, MedicionResponse
from backend.security import (
    get_current_active_user,
    require_cultivo_access,
    visible_cultivo_ids,
)
from backend.services import notificar_alerta_sensor
from backend.utils import utcnow

router = APIRouter(prefix="/mediciones", tags=["Mediciones IoT"])

DEFAULT_UMBRALES = {
    "temperatura": {
        "nombre": "Temperatura",
        "unidad": "°C",
        "minimo": None,
        "maximo": 30.0,
    },
    "humedad": {
        "nombre": "Humedad relativa",
        "unidad": "%",
        "minimo": 40.0,
        "maximo": None,
    },
    "nivel_agua": {
        "nombre": "Nivel de agua",
        "unidad": "%",
        "minimo": 20.0,
        "maximo": None,
    },
    "ph": {
        "nombre": "pH",
        "unidad": "pH",
        "minimo": 5.5,
        "maximo": 7.5,
    },
    "conductividad": {
        "nombre": "Conductividad eléctrica",
        "unidad": "µS/cm",
        "minimo": None,
        "maximo": 2000.0,
    },
}

SEVERIDAD_POR_VARIABLE = {
    "temperatura": "critical",
    "humedad": "warning",
    "nivel_agua": "critical",
    "ph": "warning",
    "conductividad": "warning",
}


def _umbrales_para_cultivo(db: Session, cultivo: Cultivo):
    umbrales = {
        variable: dict(config) for variable, config in DEFAULT_UMBRALES.items()
    }
    rows = db.query(Umbral).filter(
        Umbral.activo.is_(True),
        or_(
            Umbral.cultivo_id == cultivo.id,
            Umbral.instalacion_id == cultivo.instalacion_id,
            (Umbral.cultivo_id.is_(None)) & (Umbral.instalacion_id.is_(None)),
        ),
    ).all()

    def prioridad(umbral):
        if umbral.cultivo_id is not None:
            return 2
        if umbral.instalacion_id is not None:
            return 1
        return 0

    for umbral in sorted(rows, key=prioridad):
        if umbral.variable not in umbrales:
            continue
        umbrales[umbral.variable].update(
            {
                "nombre": umbral.nombre,
                "unidad": umbral.unidad
                if umbral.unidad is not None
                else umbrales[umbral.variable]["unidad"],
                "minimo": umbral.valor_minimo,
                "maximo": umbral.valor_maximo,
            }
        )
    return umbrales


def _evaluar_variable(variable, valor, config):
    minimo = config.get("minimo")
    maximo = config.get("maximo")
    severidad = SEVERIDAD_POR_VARIABLE.get(variable, "warning")
    unidad = config.get("unidad") or ""

    if minimo is not None and valor < minimo:
        return (
            severidad,
            f"{config['nombre']}: {valor}{unidad} por debajo del mínimo "
            f"({minimo}{unidad})",
            minimo,
        )
    if maximo is not None and valor > maximo:
        return (
            severidad,
            f"{config['nombre']}: {valor}{unidad} supera el máximo "
            f"({maximo}{unidad})",
            maximo,
        )
    return None


@router.post("/", response_model=MedicionResponse, status_code=status.HTTP_201_CREATED)
def ingestar_medicion(
    medicion: MedicionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    HU-16, 17, 18: Endpoint para que los dispositivos IoT envíen mediciones.
    HU-19: Evalúa umbrales configurables y genera alertas automáticas.
    """
    require_cultivo_access(db, current_user, medicion.cultivo_id)
    cultivo = db.query(Cultivo).filter(Cultivo.id == medicion.cultivo_id).first()
    if not cultivo:
        raise HTTPException(status_code=404, detail="Cultivo no encontrado")
    nueva_medicion = Medicion(
        cultivo_id=medicion.cultivo_id,
        temperatura=medicion.temperatura,
        humedad=medicion.humedad,
        nivel_agua=medicion.nivel_agua,
        ph=medicion.ph,
        conductividad=medicion.conductividad,
        fecha_hora=medicion.fecha_hora or utcnow()
    )
    db.add(nueva_medicion)

    umbrales = _umbrales_para_cultivo(db, cultivo)
    valores = {
        "temperatura": medicion.temperatura,
        "humedad": medicion.humedad,
        "nivel_agua": medicion.nivel_agua,
        "ph": medicion.ph,
        "conductividad": medicion.conductividad,
    }

    for variable, valor in valores.items():
        if valor is None:
            continue
        evaluacion = _evaluar_variable(variable, valor, umbrales[variable])
        if not evaluacion:
            continue
        severidad, mensaje, umbral = evaluacion
        alerta = Alerta(
            cultivo_id=medicion.cultivo_id,
            tipo=variable,
            severidad=severidad,
            mensaje=mensaje,
            valor_detectado=valor,
            umbral=umbral,
            fecha_hora=utcnow(),
            leida=False,
        )
        db.add(alerta)
        db.flush()
        notificar_alerta_sensor(db, alerta, cultivo)

    db.commit()
    db.refresh(nueva_medicion)
    return nueva_medicion


@router.get("/", response_model=List[MedicionResponse])
def obtener_mediciones(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    Obtiene las últimas mediciones visibles para el usuario autenticado.
    """
    query = db.query(Medicion)
    cultivo_ids = visible_cultivo_ids(db, current_user)
    if cultivo_ids is not None:
        query = query.filter(Medicion.cultivo_id.in_(cultivo_ids))
    query = query.order_by(Medicion.fecha_hora.desc()).offset(offset).limit(limit)
    return query.all()
