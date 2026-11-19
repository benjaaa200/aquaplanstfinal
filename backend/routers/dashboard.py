from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.cache import api_cache
from backend.database import get_db
from backend.models import Medicion, Alerta, Usuario
from backend.schemas import DashboardKPIsResponse
from backend.security import get_current_active_user, visible_cultivo_ids

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/kpis", response_model=DashboardKPIsResponse)
def obtener_kpis_dashboard(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """
    Calcula los KPIs en tiempo real desde la base de datos.
    """
    cache_key = ("dashboard-kpis", db.get_bind(), current_user.id)
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    # 1. Obtener promedios de las últimas 20 mediciones
    # Nota: Ajusta la subconsulta según tu dialecto SQL si es necesario, 
    # esta es una forma compatible con SQLite/SQLAlchemy
    mediciones_query = db.query(Medicion)
    cultivo_ids = visible_cultivo_ids(db, current_user)
    if cultivo_ids is not None:
        mediciones_query = mediciones_query.filter(Medicion.cultivo_id.in_(cultivo_ids))
    ultimas_mediciones = mediciones_query.order_by(
        Medicion.fecha_hora.desc()
    ).limit(20).subquery()
    
    kpis = db.query(
        func.avg(ultimas_mediciones.c.temperatura).label('avg_temp'),
        func.avg(ultimas_mediciones.c.humedad).label('avg_humidity'),
        func.avg(ultimas_mediciones.c.nivel_agua).label('avg_water')
    ).first()

    # 2. Contar alertas activas (no resueltas)
    alertas_query = db.query(Alerta).filter(Alerta.resuelta.is_(False))
    if cultivo_ids is not None:
        alertas_query = alertas_query.filter(Alerta.cultivo_id.in_(cultivo_ids))
    alertas_activas = alertas_query.count()

    result = {
        "avg_temp": round(kpis.avg_temp, 1) if kpis.avg_temp else 0.0,
        "avg_humidity": round(kpis.avg_humidity, 1) if kpis.avg_humidity else 0.0,
        "avg_water": round(kpis.avg_water, 1) if kpis.avg_water else 0.0,
        "active_alerts": alertas_activas
    }
    api_cache.set(cache_key, result, 8.0)
    return result