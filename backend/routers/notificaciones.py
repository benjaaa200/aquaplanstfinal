"""Centro de notificaciones unificado."""
import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.database import get_db
from backend.models import Notificacion, Usuario
from backend.schemas_ops import NotificacionAdminCreate, NotificacionUpdate
from backend.security import (
    get_current_active_user,
    get_current_user_from_query_token,
    require_admin,
)
from backend.services import generar_alertas_pendientes, notificar_usuarios

router = APIRouter(prefix="/notificaciones", tags=["Notificaciones"])


def serializar(notificacion: Notificacion) -> dict:
    return {
        "id": notificacion.id,
        "categoria": notificacion.categoria,
        "titulo": notificacion.titulo,
        "mensaje": notificacion.mensaje,
        "prioridad": notificacion.prioridad,
        "leida": notificacion.leida,
        "url": notificacion.url,
        "entidad_tipo": notificacion.entidad_tipo,
        "entidad_id": notificacion.entidad_id,
        "fecha_creacion": notificacion.fecha_creacion,
    }


@router.get("/")
def listar_notificaciones(
    categoria: str | None = None,
    leida: bool | None = None,
    prioridad: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    generar_alertas_pendientes(db, current_user)
    query = db.query(Notificacion).filter(
        Notificacion.usuario_id == current_user.id
    )
    if categoria:
        query = query.filter(Notificacion.categoria == categoria)
    if leida is not None:
        query = query.filter(Notificacion.leida.is_(leida))
    if prioridad:
        query = query.filter(Notificacion.prioridad == prioridad)
    return [
        serializar(item)
        for item in query.order_by(Notificacion.fecha_creacion.desc())
        .offset(offset)
        .limit(limit)
        .all()
    ]


@router.get("/resumen")
def resumen_notificaciones(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    generar_alertas_pendientes(db, current_user)
    base = db.query(Notificacion).filter(Notificacion.usuario_id == current_user.id)
    no_leidas = base.filter(Notificacion.leida.is_(False)).count()
    urgentes = base.filter(
        Notificacion.leida.is_(False),
        Notificacion.prioridad.in_(("urgente", "importante")),
    ).count()
    categorias = {
        row[0]: row[1]
        for row in db.query(
            Notificacion.categoria, func.count(Notificacion.id)
        ).filter(
            Notificacion.usuario_id == current_user.id,
            Notificacion.leida.is_(False),
        ).group_by(Notificacion.categoria).all()
    }
    return {
        "total": base.count(),
        "no_leidas": no_leidas,
        "urgentes": urgentes,
        "por_categoria": categorias,
    }


def _resumen_en_vivo(db: Session, usuario_id: int) -> dict:
    """Short read-only summary used by the SSE stream."""
    base = db.query(Notificacion).filter(Notificacion.usuario_id == usuario_id)
    no_leidas = base.filter(Notificacion.leida.is_(False)).count()
    urgentes = base.filter(
        Notificacion.leida.is_(False),
        Notificacion.prioridad.in_(("urgente", "importante")),
    ).count()
    ultimo_id = (
        db.query(func.max(Notificacion.id)).filter(
            Notificacion.usuario_id == usuario_id
        ).scalar()
        or 0
    )
    return {
        "total": base.count(),
        "no_leidas": no_leidas,
        "urgentes": urgentes,
        "ultimo_id": ultimo_id,
    }


@router.get("/stream")
async def stream_notificaciones(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user_from_query_token),
):
    """Server-Sent Events with the unread counter for the notification bell."""

    async def event_generator():
        ultimo_envio = None
        while not await request.is_disconnected():
            resumen = await run_in_threadpool(_resumen_en_vivo, db, current_user.id)
            firma = (resumen["no_leidas"], resumen["urgentes"], resumen["ultimo_id"])
            if firma != ultimo_envio:
                ultimo_envio = firma
                yield f"data: {json.dumps(resumen)}\n\n"
            else:
                yield ": keep-alive\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{notificacion_id}")
def obtener_notificacion(
    notificacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    notificacion = db.query(Notificacion).filter(
        Notificacion.id == notificacion_id,
        Notificacion.usuario_id == current_user.id,
    ).first()
    if not notificacion:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return serializar(notificacion)


@router.put("/marcar-todas")

def marcar_todas_leidas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    updated = db.query(Notificacion).filter(
        Notificacion.usuario_id == current_user.id,
        Notificacion.leida.is_(False),
    ).update({Notificacion.leida: True}, synchronize_session=False)
    db.commit()
    return {"message": f"{updated} notificaciones marcadas como leídas", "updated": updated}


@router.post("/enviar", status_code=status.HTTP_201_CREATED)
def enviar_comunicacion(
    payload: NotificacionAdminCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    targets = set()
    if payload.usuario_ids:
        valid_ids = {
            row[0]
            for row in db.query(Usuario.id).filter(
                Usuario.id.in_(payload.usuario_ids), Usuario.activo.is_(True)
            ).all()
        }
        invalid_ids = set(payload.usuario_ids) - valid_ids
        if invalid_ids:
            raise HTTPException(
                status_code=422,
                detail="Uno o más destinatarios no existen o están inactivos",
            )
        targets.update(valid_ids)
    if payload.roles:
        targets.update(
            row[0]
            for row in db.query(Usuario.id).filter(
                Usuario.rol.in_(payload.roles), Usuario.activo.is_(True)
            ).all()
        )
    if not targets:
        raise HTTPException(
            status_code=422, detail="Selecciona al menos un destinatario"
        )
    notificar_usuarios(
        db,
        targets,
        payload.categoria,
        payload.titulo,
        payload.mensaje,
        payload.prioridad,
        payload.url,
        "comunicacion",
        None,
    )
    db.commit()
    return {"message": "Comunicación enviada", "destinatarios": len(targets)}


@router.put("/{notificacion_id}/leer")
def marcar_leida(
    notificacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    notificacion = db.query(Notificacion).filter(
        Notificacion.id == notificacion_id,
        Notificacion.usuario_id == current_user.id,
    ).first()
    if not notificacion:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    notificacion.leida = True
    db.commit()
    db.refresh(notificacion)
    return serializar(notificacion)


@router.put("/{notificacion_id}")
def actualizar_notificacion(
    notificacion_id: int,
    payload: NotificacionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    notificacion = db.query(Notificacion).filter(
        Notificacion.id == notificacion_id,
        Notificacion.usuario_id == current_user.id,
    ).first()
    if not notificacion:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(notificacion, campo, valor)
    db.commit()
    db.refresh(notificacion)
    return serializar(notificacion)


@router.delete("/{notificacion_id}", status_code=status.HTTP_204_NO_CONTENT)

def eliminar_notificacion(
    notificacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    notificacion = db.query(Notificacion).filter(
        Notificacion.id == notificacion_id,
        Notificacion.usuario_id == current_user.id,
    ).first()
    if not notificacion:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    db.delete(notificacion)
    db.commit()
    return None

