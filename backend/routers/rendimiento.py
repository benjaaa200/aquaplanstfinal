"""Informes de rendimiento calculados a partir de registros reales."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.cache import api_cache
from backend.database import get_db
from backend.models import (
    Cultivo,
    EventoCalendario,
    Incidencia,
    Instalacion,
    MovimientoInventario,
    Tarea,
    Usuario,
)
from backend.security import get_current_active_user, visible_cultivo_ids
from backend.services import is_staff, scoped_instalacion_ids
from backend.utils import naive_utc, utcnow

router = APIRouter(prefix="/rendimiento", tags=["Rendimiento"])

ESTADOS_TAREA_ABIERTOS = ("pendiente", "en_progreso", "en_revision", "atrasada")


def _en_rango(valor, inicio, fin) -> bool:
    valor = naive_utc(valor)
    if not valor:
        return False
    if inicio and valor < inicio:
        return False
    if fin and valor > fin:
        return False
    return True


def _meses(inicio: datetime | None, fin: datetime | None) -> list[tuple[str, datetime, datetime]]:
    if not fin:
        fin = utcnow()
    if not inicio:
        inicio = (fin.replace(day=1) - timedelta(days=31 * 5)).replace(day=1)
    buckets = []
    cursor = inicio.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    while cursor <= fin:
        if cursor.month == 12:
            siguiente = cursor.replace(year=cursor.year + 1, month=1)
        else:
            siguiente = cursor.replace(month=cursor.month + 1)
        buckets.append((cursor.strftime("%Y-%m"), cursor, siguiente))
        cursor = siguiente
    return buckets


@router.get("/")
def informe_rendimiento(
    fecha_inicio: datetime | None = None,
    fecha_fin: datetime | None = None,
    sector_id: int | None = None,
    cultivo_id: int | None = None,
    responsable_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    fecha_inicio = naive_utc(fecha_inicio)
    fecha_fin = naive_utc(fecha_fin)
    cache_key = (
        "rendimiento",
        db.get_bind(),
        current_user.id,
        fecha_inicio,
        fecha_fin,
        sector_id,
        cultivo_id,
        responsable_id,
    )
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    scope = scoped_instalacion_ids(db, current_user)
    staff = is_staff(current_user)

    cultivos_query = db.query(Cultivo)
    visible_ids = visible_cultivo_ids(db, current_user)
    if visible_ids is not None:
        cultivos_query = cultivos_query.filter(Cultivo.id.in_(visible_ids))
    if scope is not None:
        cultivos_query = cultivos_query.filter(Cultivo.instalacion_id.in_(scope))
    if sector_id:
        cultivos_query = cultivos_query.filter(Cultivo.instalacion_id == sector_id)
    if cultivo_id:
        cultivos_query = cultivos_query.filter(Cultivo.id == cultivo_id)
    cultivos = cultivos_query.all()

    tareas_query = db.query(Tarea)
    if scope is not None:
        tareas_query = tareas_query.filter(Tarea.sector_id.in_(scope))
    if not staff:
        tareas_query = tareas_query.filter(
            (Tarea.responsable_id == current_user.id)
            | (Tarea.creador_id == current_user.id)
        )
    if sector_id:
        tareas_query = tareas_query.filter(Tarea.sector_id == sector_id)
    if cultivo_id:
        tareas_query = tareas_query.filter(Tarea.cultivo_id == cultivo_id)
    if responsable_id:
        tareas_query = tareas_query.filter(Tarea.responsable_id == responsable_id)
    tareas = tareas_query.all()

    incidencias_query = db.query(Incidencia)
    if scope is not None:
        incidencias_query = incidencias_query.filter(Incidencia.sector_id.in_(scope))
    if not staff:
        incidencias_query = incidencias_query.filter(
            (Incidencia.reportado_por == current_user.id)
            | (Incidencia.asignado_a == current_user.id)
        )
    if sector_id:
        incidencias_query = incidencias_query.filter(Incidencia.sector_id == sector_id)
    if cultivo_id:
        incidencias_query = incidencias_query.filter(Incidencia.cultivo_id == cultivo_id)
    if responsable_id:
        incidencias_query = incidencias_query.filter(
            Incidencia.asignado_a == responsable_id
        )
    incidencias = incidencias_query.all()

    eventos_query = db.query(EventoCalendario)
    if scope is not None:
        eventos_query = eventos_query.filter(EventoCalendario.sector_id.in_(scope))
    if not staff:
        eventos_query = eventos_query.filter(
            (EventoCalendario.responsable_id == current_user.id)
            | (EventoCalendario.creador_id == current_user.id)
        )
    if sector_id:
        eventos_query = eventos_query.filter(EventoCalendario.sector_id == sector_id)
    if cultivo_id:
        eventos_query = eventos_query.filter(EventoCalendario.cultivo_id == cultivo_id)
    if responsable_id:
        eventos_query = eventos_query.filter(
            EventoCalendario.responsable_id == responsable_id
        )
    eventos = eventos_query.all()

    movimientos_query = db.query(MovimientoInventario)
    if scope is not None:
        movimientos_query = movimientos_query.filter(
            MovimientoInventario.sector_id.in_(scope)
        )
    if sector_id:
        movimientos_query = movimientos_query.filter(
            MovimientoInventario.sector_id == sector_id
        )
    movimientos = movimientos_query.filter(
        MovimientoInventario.tipo == "salida"
    ).all()

    tareas_completadas = [
        row for row in tareas
        if row.estado == "completada"
        and _en_rango(row.fecha_completada or row.fecha_creacion, fecha_inicio, fecha_fin)
    ]
    incidencias_rango = [
        row for row in incidencias
        if _en_rango(row.fecha_creacion, fecha_inicio, fecha_fin)
    ]
    incidencias_resueltas = [
        row for row in incidencias
        if row.estado in ("resuelta", "cerrada")
        and _en_rango(row.fecha_resolucion or row.fecha_creacion, fecha_inicio, fecha_fin)
    ]
    mantenimientos = [
        row for row in eventos
        if row.tipo == "mantenimiento" and row.estado == "completado"
        and _en_rango(row.fecha_realizacion or row.fecha_inicio, fecha_inicio, fecha_fin)
    ]
    inspecciones = [
        row for row in eventos
        if row.tipo == "inspeccion" and row.estado == "completado"
        and _en_rango(row.fecha_realizacion or row.fecha_inicio, fecha_inicio, fecha_fin)
    ]
    movimientos_rango = [
        row for row in movimientos
        if _en_rango(row.fecha_creacion, fecha_inicio, fecha_fin)
    ]

    sectores = db.query(Instalacion)
    if scope is not None:
        sectores = sectores.filter(Instalacion.id.in_(scope))
    if sector_id:
        sectores = sectores.filter(Instalacion.id == sector_id)
    sectores = sectores.order_by(Instalacion.nombre).all()

    por_sector = []
    for sector in sectores:
        sector_tareas = [
            row for row in tareas
            if row.sector_id == sector.id
            and _en_rango(row.fecha_creacion, fecha_inicio, fecha_fin)
        ]
        sector_incidencias = [
            row for row in incidencias
            if row.sector_id == sector.id
            and _en_rango(row.fecha_creacion, fecha_inicio, fecha_fin)
        ]
        sector_eventos = [
            row for row in eventos
            if row.sector_id == sector.id
            and _en_rango(row.fecha_inicio, fecha_inicio, fecha_fin)
        ]
        sector_movimientos = [
            row for row in movimientos_rango if row.sector_id == sector.id
        ]
        por_sector.append({
            "sector_id": sector.id,
            "sector_nombre": sector.nombre,
            "cultivos": sum(1 for row in cultivos if row.instalacion_id == sector.id),
            "tareas_total": len(sector_tareas),
            "tareas_completadas": sum(1 for row in sector_tareas if row.estado == "completada"),
            "incidencias_total": len(sector_incidencias),
            "incidencias_resueltas": sum(
                1 for row in sector_incidencias if row.estado in ("resuelta", "cerrada")
            ),
            "eventos_completados": sum(
                1 for row in sector_eventos if row.estado == "completado"
            ),
            "consumo_insumos": round(sum(row.cantidad for row in sector_movimientos), 2),
        })

    serie = []
    for etiqueta, inicio_mes, fin_mes in _meses(fecha_inicio, fecha_fin):
        serie.append({
            "periodo": etiqueta,
            "tareas_completadas": sum(
                1 for row in tareas
                if row.estado == "completada"
                and _en_rango(row.fecha_completada, inicio_mes, fin_mes)
            ),
            "incidencias_registradas": sum(
                1 for row in incidencias
                if _en_rango(row.fecha_creacion, inicio_mes, fin_mes)
            ),
            "incidencias_resueltas": sum(
                1 for row in incidencias
                if row.estado in ("resuelta", "cerrada")
                and _en_rango(row.fecha_resolucion, inicio_mes, fin_mes)
            ),
            "mantenimientos": sum(
                1 for row in eventos
                if row.tipo == "mantenimiento" and row.estado == "completado"
                and _en_rango(row.fecha_realizacion, inicio_mes, fin_mes)
            ),
            "inspecciones": sum(
                1 for row in eventos
                if row.tipo == "inspeccion" and row.estado == "completado"
                and _en_rango(row.fecha_realizacion, inicio_mes, fin_mes)
            ),
            "consumo_insumos": round(sum(
                row.cantidad for row in movimientos
                if _en_rango(row.fecha_creacion, inicio_mes, fin_mes)
            ), 2),
        })

    ahora = utcnow()
    pendientes = sum(1 for row in tareas if row.estado in ESTADOS_TAREA_ABIERTOS)
    atrasadas = sum(
        1 for row in tareas
        if row.estado in ESTADOS_TAREA_ABIERTOS
        and row.fecha_limite and naive_utc(row.fecha_limite) < ahora
    )
    resumen = [
        f"{sum(1 for row in cultivos if row.estado == 'activo')} cultivos activos "
        f"y {sum(1 for row in cultivos if row.estado != 'activo')} finalizados.",
        f"{len(tareas_completadas)} tareas completadas; {pendientes} pendientes "
        f"y {atrasadas} atrasadas.",
        f"{len(incidencias_resueltas)} incidencias resueltas de "
        f"{len(incidencias_rango)} registradas en el periodo.",
        f"{len(mantenimientos)} mantenimientos y {len(inspecciones)} inspecciones completadas.",
        f"Consumo registrado de insumos: "
        f"{round(sum(row.cantidad for row in movimientos_rango), 2)} unidades.",
    ]

    result = {
        "filtros": {
            "fecha_inicio": fecha_inicio,
            "fecha_fin": fecha_fin,
            "sector_id": sector_id,
            "cultivo_id": cultivo_id,
            "responsable_id": responsable_id,
        },
        "indicadores": {
            "cultivos_activos": sum(1 for row in cultivos if row.estado == "activo"),
            "cultivos_finalizados": sum(1 for row in cultivos if row.estado != "activo"),
            "tareas_completadas": len(tareas_completadas),
            "tareas_pendientes": pendientes,
            "tareas_atrasadas": atrasadas,
            "incidencias_registradas": len(incidencias_rango),
            "incidencias_resueltas": len(incidencias_resueltas),
            "mantenimientos_realizados": len(mantenimientos),
            "inspecciones_realizadas": len(inspecciones),
            "consumo_insumos": round(sum(row.cantidad for row in movimientos_rango), 2),
        },
        "resumen_ejecutivo": resumen,
        "por_sector": por_sector,
        "serie": serie,
    }
    api_cache.set(cache_key, result, 10.0)
    return result
