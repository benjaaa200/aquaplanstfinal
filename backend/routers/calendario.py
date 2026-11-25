"""Calendario agrícola, mantenimientos e inspecciones."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import (
    Cultivo,
    EventoCalendario,
    Incidencia,
    Instalacion,
    Usuario,
)
from backend.schemas_ops import (
    EventoCompletar,
    EventoCreate,
    EventoEstadoUpdate,
    EventoUpdate,
)
from backend.security import (
    get_current_active_user,
    require_admin,
    require_cultivo_access,
)
from backend.services import (
    is_staff,
    notificar_sector,
    notificar_usuarios,
    require_instalacion_access,
    scoped_instalacion_ids,
)
from backend.utils import naive_utc, utcnow

router = APIRouter(prefix="/calendario", tags=["Calendario"])


def serializar(evento: EventoCalendario, detalle: bool = False) -> dict:
    data = {
        "id": evento.id,
        "titulo": evento.titulo,
        "tipo": evento.tipo,
        "categoria": evento.categoria,
        "descripcion": evento.descripcion,
        "fecha_inicio": evento.fecha_inicio,
        "fecha_fin": evento.fecha_fin,
        "sector_id": evento.sector_id,
        "sector_nombre": evento.sector_nombre,
        "cultivo_id": evento.cultivo_id,
        "cultivo_nombre": evento.cultivo_nombre,
        "responsable_id": evento.responsable_id,
        "responsable_nombre": evento.responsable_nombre,
        "estado": evento.estado,
        "fecha_realizacion": evento.fecha_realizacion,
        "resultado": evento.resultado,
        "observaciones": evento.observaciones,
        "recomendaciones": evento.recomendaciones,
        "incidencia_id": evento.incidencia_id,
        "creador_id": evento.creador_id,
        "fecha_creacion": evento.fecha_creacion,
        "atrasado": bool(
            evento.estado in ("programado", "en_ejecucion")
            and naive_utc(evento.fecha_inicio) < utcnow()
        ),
    }
    if detalle and evento.incidencia:
        data["incidencia"] = {
            "id": evento.incidencia.id,
            "titulo": evento.incidencia.titulo,
            "estado": evento.incidencia.estado,
        }
    return data


def _scope_query(db: Session, user: Usuario, query):
    scope = scoped_instalacion_ids(db, user)
    if scope is None:
        return query
    if is_staff(user):
        return query.filter(EventoCalendario.sector_id.in_(scope))
    return query.filter(
        EventoCalendario.sector_id.in_(scope)
        | (EventoCalendario.responsable_id == user.id)
        | (EventoCalendario.creador_id == user.id)
    )


def _evento_con_acceso(db: Session, user: Usuario, evento_id: int) -> EventoCalendario:
    evento = db.query(EventoCalendario).options(
        joinedload(EventoCalendario.sector),
        joinedload(EventoCalendario.cultivo),
        joinedload(EventoCalendario.responsable),
        joinedload(EventoCalendario.incidencia),
    ).filter(EventoCalendario.id == evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    if is_staff(user):
        scope = scoped_instalacion_ids(db, user)
        if scope is not None and evento.sector_id not in scope:
            raise HTTPException(status_code=403, detail="No tienes acceso a este evento")
    elif (
        evento.creador_id != user.id
        and evento.responsable_id != user.id
        and evento.sector_id not in (scoped_instalacion_ids(db, user) or set())
    ):
        raise HTTPException(status_code=403, detail="No tienes acceso a este evento")
    return evento


def _validar(db: Session, user: Usuario, sector_id: int | None, cultivo_id: int | None,
             responsable_id: int | None) -> None:
    if sector_id:
        if not db.query(Instalacion.id).filter(Instalacion.id == sector_id).first():
            raise HTTPException(status_code=422, detail="Sector no encontrado")
        require_instalacion_access(db, user, sector_id)
    cultivo = None
    if cultivo_id:
        cultivo = db.query(Cultivo).filter(Cultivo.id == cultivo_id).first()
        if not cultivo:
            raise HTTPException(status_code=422, detail="Cultivo no encontrado")
        require_cultivo_access(db, user, cultivo_id)
        if sector_id and cultivo.instalacion_id and cultivo.instalacion_id != sector_id:
            raise HTTPException(
                status_code=422,
                detail="El cultivo no pertenece al sector indicado",
            )
    if responsable_id and not db.query(Usuario).filter(
        Usuario.id == responsable_id, Usuario.activo.is_(True)
    ).first():
        raise HTTPException(status_code=422, detail="Responsable inválido")


@router.get("/eventos")
def listar_eventos(
    fecha_inicio: datetime | None = None,
    fecha_fin: datetime | None = None,
    tipo: str | None = None,
    categoria: str | None = None,
    estado: str | None = None,
    sector_id: int | None = None,
    responsable_id: int | None = None,
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    fecha_inicio = naive_utc(fecha_inicio)
    fecha_fin = naive_utc(fecha_fin)
    query = db.query(EventoCalendario).options(
        joinedload(EventoCalendario.sector),
        joinedload(EventoCalendario.cultivo),
        joinedload(EventoCalendario.responsable),
    )
    query = _scope_query(db, current_user, query)
    if fecha_inicio:
        query = query.filter(EventoCalendario.fecha_inicio >= fecha_inicio)
    if fecha_fin:
        query = query.filter(EventoCalendario.fecha_inicio <= fecha_fin)
    if tipo:
        query = query.filter(EventoCalendario.tipo == tipo)
    if categoria:
        query = query.filter(EventoCalendario.categoria == categoria)
    if estado:
        query = query.filter(EventoCalendario.estado == estado)
    if sector_id:
        query = query.filter(EventoCalendario.sector_id == sector_id)
    if responsable_id:
        query = query.filter(EventoCalendario.responsable_id == responsable_id)
    return [
        serializar(item)
        for item in query.order_by(EventoCalendario.fecha_inicio).limit(limit).all()
    ]


@router.get("/proximos")
def proximos_eventos(
    dias: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    now = utcnow()
    query = _scope_query(
        db, current_user,
        db.query(EventoCalendario).filter(
            EventoCalendario.fecha_inicio >= now,
            EventoCalendario.fecha_inicio <= now + timedelta(days=dias),
            EventoCalendario.estado.in_(("programado", "en_ejecucion")),
        ),
    )
    return [
        serializar(item)
        for item in query.options(
            joinedload(EventoCalendario.sector),
            joinedload(EventoCalendario.cultivo),
            joinedload(EventoCalendario.responsable),
        ).order_by(EventoCalendario.fecha_inicio).all()
    ]


@router.get("/resumen")
def resumen_calendario(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = _scope_query(db, current_user, db.query(EventoCalendario))
    rows = query.all()
    now = utcnow()
    return {
        "total": len(rows),
        "programados": sum(1 for row in rows if row.estado == "programado"),
        "en_ejecucion": sum(1 for row in rows if row.estado == "en_ejecucion"),
        "completados": sum(1 for row in rows if row.estado == "completado"),
        "atrasados": sum(
            1 for row in rows
            if row.estado in ("programado", "en_ejecucion")
            and naive_utc(row.fecha_inicio) < now
        ),
        "mantenimientos": sum(1 for row in rows if row.tipo == "mantenimiento"),
        "inspecciones": sum(1 for row in rows if row.tipo == "inspeccion"),
        "proximo": serializar(
            min(
                (row for row in rows if row.estado in ("programado", "en_ejecucion")
                 and naive_utc(row.fecha_inicio) >= now),
                key=lambda row: naive_utc(row.fecha_inicio),
                default=None,
            )
        ) if any(
            row.estado in ("programado", "en_ejecucion")
            and naive_utc(row.fecha_inicio) >= now
            for row in rows
        ) else None,
    }


@router.post("/eventos", status_code=status.HTTP_201_CREATED)
def crear_evento(
    payload: EventoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    payload.fecha_inicio = naive_utc(payload.fecha_inicio)
    payload.fecha_fin = naive_utc(payload.fecha_fin)
    if payload.fecha_fin and payload.fecha_fin < payload.fecha_inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin no puede ser anterior al inicio")
    _validar(
        db, current_user, payload.sector_id, payload.cultivo_id, payload.responsable_id
    )
    evento = EventoCalendario(
        **payload.model_dump(),
        creador_id=current_user.id,
    )
    if evento.responsable_id is None and not is_staff(current_user):
        evento.responsable_id = current_user.id
    db.add(evento)
    db.flush()
    notificar_usuarios(
        db,
        [evento.responsable_id],
        "mantenimiento" if evento.tipo == "mantenimiento" else (
            "inspeccion" if evento.tipo == "inspeccion" else "calendario"
        ),
        f"Nuevo evento: {evento.titulo}",
        f"{evento.categoria.replace('_', ' ')} · {evento.fecha_inicio:%d-%m-%Y %H:%M}",
        "importante" if evento.tipo in ("mantenimiento", "inspeccion") else "info",
        f"../pages/calendario.html?id={evento.id}",
        "evento",
        evento.id,
    )
    if evento.tipo in ("mantenimiento", "inspeccion"):
        notificar_sector(
            db,
            evento.sector_id,
            "mantenimiento" if evento.tipo == "mantenimiento" else "inspeccion",
            f"{evento.tipo.capitalize()} programado",
            f"{evento.titulo} · {evento.fecha_inicio:%d-%m-%Y %H:%M}",
            "info",
            f"../pages/calendario.html?id={evento.id}",
            "evento",
            evento.id,
        )
    db.commit()
    db.refresh(evento)
    return serializar(_evento_con_acceso(db, current_user, evento.id), detalle=True)


@router.get("/eventos/{evento_id}")
def obtener_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    return serializar(_evento_con_acceso(db, current_user, evento_id), detalle=True)


@router.put("/eventos/{evento_id}")
def actualizar_evento(
    evento_id: int,
    payload: EventoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    evento = _evento_con_acceso(db, current_user, evento_id)
    if not is_staff(current_user) and evento.creador_id != current_user.id \
            and evento.responsable_id != current_user.id:
        raise HTTPException(status_code=403, detail="No puedes editar este evento")
    cambios = payload.model_dump(exclude_unset=True)
    for campo in ("fecha_inicio", "fecha_fin"):
        if campo in cambios:
            cambios[campo] = naive_utc(cambios[campo])
    fecha_inicio = cambios.get("fecha_inicio", evento.fecha_inicio)
    fecha_fin = cambios.get("fecha_fin", evento.fecha_fin)
    if fecha_fin and fecha_inicio and fecha_fin < fecha_inicio:
        raise HTTPException(status_code=422, detail="La fecha de fin no puede ser anterior al inicio")
    _validar(
        db, current_user,
        cambios.get("sector_id", evento.sector_id),
        cambios.get("cultivo_id", evento.cultivo_id),
        cambios.get("responsable_id", evento.responsable_id),
    )
    for campo, valor in cambios.items():
        setattr(evento, campo, valor)
    db.commit()
    db.refresh(evento)
    return serializar(_evento_con_acceso(db, current_user, evento.id), detalle=True)


@router.patch("/eventos/{evento_id}/estado")
def cambiar_estado_evento(
    evento_id: int,
    payload: EventoEstadoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    evento = _evento_con_acceso(db, current_user, evento_id)
    if not is_staff(current_user) and evento.responsable_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el responsable puede cambiar el estado")
    evento.estado = payload.estado
    if payload.estado == "completado" and not evento.fecha_realizacion:
        evento.fecha_realizacion = utcnow()
    db.commit()
    db.refresh(evento)
    return serializar(evento)


@router.post("/eventos/{evento_id}/completar")
def completar_evento(
    evento_id: int,
    payload: EventoCompletar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    evento = _evento_con_acceso(db, current_user, evento_id)
    if not is_staff(current_user) and evento.responsable_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el responsable puede completar este evento")
    evento.estado = "completado"
    evento.fecha_realizacion = naive_utc(payload.fecha_realizacion) or utcnow()
    evento.resultado = payload.resultado
    evento.observaciones = payload.observaciones
    evento.recomendaciones = payload.recomendaciones
    incidencia = None
    if payload.crear_incidencia:
        titulo = payload.incidencia_titulo or f"Incidencia detectada en {evento.titulo}"
        descripcion = payload.incidencia_descripcion or payload.observaciones or (
            "Incidencia generada al completar una inspección."
        )
        incidencia = Incidencia(
            titulo=titulo,
            descripcion=descripcion,
            categoria="infraestructura" if evento.tipo == "mantenimiento" else "plantas",
            prioridad="alta",
            estado="nueva",
            sector_id=evento.sector_id,
            cultivo_id=evento.cultivo_id,
            reportado_por=current_user.id,
        )
        db.add(incidencia)
        db.flush()
        evento.incidencia_id = incidencia.id
        notificar_sector(
            db,
            evento.sector_id,
            "incidencia",
            "Incidencia generada desde inspección",
            titulo,
            "importante",
            f"../pages/incidencias.html?id={incidencia.id}",
            "incidencia",
            incidencia.id,
        )
    notificar_sector(
        db,
        evento.sector_id,
        "mantenimiento" if evento.tipo == "mantenimiento" else "inspeccion",
        f"{evento.tipo.capitalize()} completado",
        f"{evento.titulo} · {evento.fecha_realizacion:%d-%m-%Y}",
        "info",
        f"../pages/calendario.html?id={evento.id}",
        "evento",
        evento.id,
    )
    db.commit()
    db.refresh(evento)
    data = serializar(_evento_con_acceso(db, current_user, evento.id), detalle=True)
    if incidencia:
        data["incidencia_generada"] = {
            "id": incidencia.id,
            "titulo": incidencia.titulo,
        }
    return data


@router.delete("/eventos/{evento_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    evento = db.query(EventoCalendario).filter(EventoCalendario.id == evento_id).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    db.delete(evento)
    db.commit()
    return None
