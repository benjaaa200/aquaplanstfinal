"""AquaPlants - Router de reportes y exportaciones."""

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    Alerta,
    Cultivo,
    Dispositivo,
    Medicion,
    ReporteGenerado,
    Riego,
    Usuario,
)
from backend.schemas import REPORTE_TIPOS, ReporteCreate, ReporteResponse
from backend.security import (
    get_current_active_user,
    is_admin,
    require_cultivo_access,
    visible_cultivo_ids,
)

router = APIRouter(prefix="/reportes", tags=["Reportes"])


def _visible_crop_query(db: Session, user: Usuario, model):
    query = db.query(model)
    ids = visible_cultivo_ids(db, user)
    if ids is not None:
        query = query.filter(model.cultivo_id.in_(ids))
    return query


def _visible_device_query(db: Session, user: Usuario):
    query = db.query(Dispositivo)
    ids = visible_cultivo_ids(db, user)
    if ids is not None:
        installation_ids = db.query(Cultivo.instalacion_id).filter(
            Cultivo.id.in_(ids), Cultivo.instalacion_id.isnot(None)
        )
        query = query.filter(Dispositivo.instalacion_id.in_(installation_ids))
    return query


def _range_filter(query, model, fecha_inicio, fecha_fin):
    return query.filter(
        and_(
            model.fecha_hora >= fecha_inicio,
            model.fecha_hora <= fecha_fin,
        )
    )


def _validate_range(fecha_inicio, fecha_fin):
    if fecha_inicio > fecha_fin:
        raise HTTPException(
            status_code=422,
            detail="La fecha de inicio no puede ser posterior a la fecha de fin",
        )


def _mediciones(db, user, inicio, fin, cultivo_id):
    query = _visible_crop_query(db, user, Medicion)
    query = _range_filter(query, Medicion, inicio, fin)
    if cultivo_id:
        require_cultivo_access(db, user, cultivo_id)
        query = query.filter(Medicion.cultivo_id == cultivo_id)
    return query.order_by(Medicion.fecha_hora.asc()).all()


def _alertas(db, user, inicio, fin, cultivo_id):
    query = _visible_crop_query(db, user, Alerta)
    query = _range_filter(query, Alerta, inicio, fin)
    if cultivo_id:
        require_cultivo_access(db, user, cultivo_id)
        query = query.filter(Alerta.cultivo_id == cultivo_id)
    return query.order_by(Alerta.fecha_hora.asc()).all()


def _riegos(db, user, inicio, fin, cultivo_id):
    query = _visible_crop_query(db, user, Riego)
    query = query.filter(
        and_(Riego.fecha_inicio >= inicio, Riego.fecha_inicio <= fin)
    )
    if cultivo_id:
        require_cultivo_access(db, user, cultivo_id)
        query = query.filter(Riego.cultivo_id == cultivo_id)
    return query.order_by(Riego.fecha_inicio.asc()).all()


def _cultivos(db, user, inicio, fin, cultivo_id):
    query = db.query(Cultivo)
    ids = visible_cultivo_ids(db, user)
    if ids is not None:
        query = query.filter(Cultivo.id.in_(ids))
    if cultivo_id:
        require_cultivo_access(db, user, cultivo_id)
        query = query.filter(Cultivo.id == cultivo_id)
    return query.order_by(Cultivo.id).all()


def _dispositivos(db, user, inicio, fin, cultivo_id):
    if cultivo_id:
        require_cultivo_access(db, user, cultivo_id)
        cultivo = db.query(Cultivo).filter(Cultivo.id == cultivo_id).first()
        if not cultivo or cultivo.instalacion_id is None:
            return []
        return (
            db.query(Dispositivo)
            .filter(Dispositivo.instalacion_id == cultivo.instalacion_id)
            .order_by(Dispositivo.id)
            .all()
        )
    return _visible_device_query(db, user).order_by(Dispositivo.id).all()


COLLECTORS = {
    "mediciones": _mediciones,
    "alertas": _alertas,
    "riego": _riegos,
    "cultivos": _cultivos,
    "dispositivos": _dispositivos,
}


def _resumen_mediciones(rows):
    if not rows:
        return {
            "total": 0,
            "promedio_temperatura": None,
            "promedio_humedad": None,
            "promedio_nivel_agua": None,
            "promedio_ph": None,
            "promedio_conductividad": None,
        }

    def average(attribute):
        values = [
            getattr(row, attribute)
            for row in rows
            if getattr(row, attribute) is not None
        ]
        return round(sum(values) / len(values), 2) if values else None

    return {
        "total": len(rows),
        "promedio_temperatura": average("temperatura"),
        "promedio_humedad": average("humedad"),
        "promedio_nivel_agua": average("nivel_agua"),
        "promedio_ph": average("ph"),
        "promedio_conductividad": average("conductividad"),
    }


def _resumen_alertas(rows):
    severidades = {}
    resueltas = 0
    leidas = 0
    for row in rows:
        severidades[row.severidad] = severidades.get(row.severidad, 0) + 1
        resueltas += 1 if row.resuelta else 0
        leidas += 1 if row.leida else 0
    return {
        "total": len(rows),
        "por_severidad": severidades,
        "resueltas": resueltas,
        "leidas": leidas,
        "pendientes": len(rows) - resueltas,
    }


def _resumen_riego(rows):
    return {
        "total": len(rows),
        "consumo_total_litros": round(
            sum(row.consumo_litros or 0 for row in rows), 2
        ),
        "duracion_total_minutos": sum(row.duracion_minutos or 0 for row in rows),
    }


def _resumen_cultivos(rows):
    return {
        "total": len(rows),
        "activos": sum(1 for row in rows if row.estado == "activo"),
        "area_total_m2": round(sum(row.area_m2 or 0 for row in rows), 2),
    }


def _resumen_dispositivos(rows):
    tipos = {}
    for row in rows:
        tipos[row.tipo] = tipos.get(row.tipo, 0) + 1
    return {
        "total": len(rows),
        "activos": sum(1 for row in rows if row.estado == "activo"),
        "inactivos": sum(1 for row in rows if row.estado != "activo"),
        "por_tipo": tipos,
    }


RESUMENES = {
    "mediciones": _resumen_mediciones,
    "alertas": _resumen_alertas,
    "riego": _resumen_riego,
    "cultivos": _resumen_cultivos,
    "dispositivos": _resumen_dispositivos,
}


def _serialize_row(tipo, row):
    if tipo == "mediciones":
        return [
            row.id,
            row.cultivo_id,
            row.fecha_hora.isoformat() if row.fecha_hora else "",
            row.temperatura,
            row.humedad,
            row.nivel_agua,
            row.ph,
            row.conductividad,
        ]
    if tipo == "alertas":
        return [
            row.id,
            row.cultivo_id,
            row.tipo,
            row.severidad,
            row.mensaje,
            row.valor_detectado,
            row.umbral,
            row.leida,
            row.resuelta,
            row.fecha_hora.isoformat() if row.fecha_hora else "",
        ]
    if tipo == "riego":
        return [
            row.id,
            row.cultivo_id,
            row.zona,
            row.tipo,
            row.duracion_minutos,
            row.consumo_litros,
            row.fecha_inicio.isoformat() if row.fecha_inicio else "",
            row.estado,
        ]
    if tipo == "cultivos":
        return [
            row.id,
            row.nombre,
            row.ubicacion,
            row.tipo_planta,
            row.estado,
            row.area_m2,
            row.instalacion_id,
        ]
    return [
        row.id,
        row.nombre,
        row.tipo,
        row.modelo,
        row.direccion_mac,
        row.instalacion_id,
        row.estado,
    ]


def _csv_safe(value):
    """Evita inyección de fórmulas al abrir el CSV en hojas de cálculo."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


CSV_HEADERS = {
    "mediciones": [
        "id",
        "cultivo_id",
        "fecha_hora",
        "temperatura",
        "humedad",
        "nivel_agua",
        "ph",
        "conductividad",
    ],
    "alertas": [
        "id",
        "cultivo_id",
        "tipo",
        "severidad",
        "mensaje",
        "valor_detectado",
        "umbral",
        "leida",
        "resuelta",
        "fecha_hora",
    ],
    "riego": [
        "id",
        "cultivo_id",
        "zona",
        "tipo",
        "duracion_minutos",
        "consumo_litros",
        "fecha_inicio",
        "estado",
    ],
    "cultivos": [
        "id",
        "nombre",
        "ubicacion",
        "tipo_planta",
        "estado",
        "area_m2",
        "instalacion_id",
    ],
    "dispositivos": [
        "id",
        "nombre",
        "tipo",
        "modelo",
        "direccion_mac",
        "instalacion_id",
        "estado",
    ],
}


@router.get("/resumen")
def resumen_reporte(
    tipo: str = Query(..., description="Tipo de reporte"),
    fecha_inicio: datetime = Query(...),
    fecha_fin: datetime = Query(...),
    cultivo_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    if tipo not in REPORTE_TIPOS:
        raise HTTPException(status_code=422, detail="Tipo de reporte no válido")
    _validate_range(fecha_inicio, fecha_fin)

    rows = COLLECTORS[tipo](db, current_user, fecha_inicio, fecha_fin, cultivo_id)
    return {
        "tipo": tipo,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "resumen": RESUMENES[tipo](rows),
    }


@router.get("/export")
def exportar_reporte(
    tipo: str = Query(...),
    fecha_inicio: datetime = Query(...),
    fecha_fin: datetime = Query(...),
    cultivo_id: Optional[int] = Query(default=None),
    formato: str = Query(default="csv"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    if tipo not in REPORTE_TIPOS:
        raise HTTPException(status_code=422, detail="Tipo de reporte no válido")
    if formato.lower() != "csv":
        raise HTTPException(
            status_code=422,
            detail="La exportación directa solo está disponible en formato CSV",
        )
    _validate_range(fecha_inicio, fecha_fin)

    rows = COLLECTORS[tipo](db, current_user, fecha_inicio, fecha_fin, cultivo_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADERS[tipo])
    for row in rows:
        writer.writerow([_csv_safe(value) for value in _serialize_row(tipo, row)])

    filename = f"reporte_{tipo}_{fecha_inicio:%Y%m%d}_{fecha_fin:%Y%m%d}.csv"
    return Response(
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/historial", response_model=list[ReporteResponse])
def listar_historial(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(ReporteGenerado)
    if not is_admin(current_user):
        query = query.filter(ReporteGenerado.usuario_id == current_user.id)
    return query.order_by(ReporteGenerado.fecha_generacion.desc()).limit(limit).all()


@router.post(
    "/historial", response_model=ReporteResponse, status_code=status.HTTP_201_CREATED
)
def registrar_historial(
    datos: ReporteCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    _validate_range(datos.fecha_inicio, datos.fecha_fin)
    if datos.cultivo_id:
        require_cultivo_access(db, current_user, datos.cultivo_id)

    reporte = ReporteGenerado(usuario_id=current_user.id, **datos.model_dump())
    db.add(reporte)
    db.commit()
    db.refresh(reporte)
    return reporte


@router.delete("/historial/{reporte_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_historial(
    reporte_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    reporte = db.query(ReporteGenerado).filter(
        ReporteGenerado.id == reporte_id
    ).first()
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    if reporte.usuario_id != current_user.id and not is_admin(current_user):
        raise HTTPException(
            status_code=403, detail="No puedes eliminar este reporte"
        )
    db.delete(reporte)
    db.commit()
