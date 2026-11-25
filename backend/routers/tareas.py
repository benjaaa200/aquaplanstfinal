"""Centro de tareas y asignaciones con historial y notificaciones."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import (
    Cultivo,
    GrupoTrabajo,
    Instalacion,
    Tarea,
    TareaComentario,
    Usuario,
)
from backend.schemas_ops import (
    ComentarioCreate,
    TareaCreate,
    TareaEstadoUpdate,
    TareaUpdate,
)
from backend.security import (
    get_current_active_user,
    require_admin,
    require_cultivo_access,
)
from backend.services import (
    is_admin,
    is_encargado,
    is_staff,
    is_supervisor,
    notificar_sector,
    notificar_usuarios,
    require_instalacion_access,
    scoped_instalacion_ids,
)
from backend.utils import naive_utc, utcnow

router = APIRouter(prefix="/tareas", tags=["Tareas"])

ESTADOS_ABIERTOS = ("pendiente", "en_progreso", "en_revision", "atrasada")


def serializar(tarea: Tarea, detalle: bool = False) -> dict:
    data = {
        "id": tarea.id,
        "titulo": tarea.titulo,
        "descripcion": tarea.descripcion,
        "categoria": tarea.categoria,
        "prioridad": tarea.prioridad,
        "estado": tarea.estado,
        "responsable_id": tarea.responsable_id,
        "responsable_nombre": tarea.responsable_nombre,
        "creador_id": tarea.creador_id,
        "creador_nombre": tarea.creador_nombre,
        "sector_id": tarea.sector_id,
        "sector_nombre": tarea.sector_nombre,
        "cultivo_id": tarea.cultivo_id,
        "cultivo_nombre": tarea.cultivo_nombre,
        "observaciones": tarea.observaciones,
        "fecha_creacion": tarea.fecha_creacion,
        "fecha_limite": tarea.fecha_limite,
        "fecha_completada": tarea.fecha_completada,
        "completada_por": tarea.completada_por,
        "atrasada": bool(
            tarea.fecha_limite
            and tarea.estado in ESTADOS_ABIERTOS
            and naive_utc(tarea.fecha_limite) < utcnow()
        ),
    }
    if detalle:
        data["comentarios"] = [
            serializar_comentario(item)
            for item in sorted(tarea.comentarios, key=lambda row: row.id)
        ]
    return data


def serializar_comentario(comentario: TareaComentario) -> dict:
    return {
        "id": comentario.id,
        "usuario_id": comentario.usuario_id,
        "usuario_nombre": comentario.usuario_nombre,
        "comentario": comentario.comentario,
        "estado_anterior": comentario.estado_anterior,
        "estado_nuevo": comentario.estado_nuevo,
        "fecha_creacion": comentario.fecha_creacion,
    }


def _scope_query(db: Session, user: Usuario, query):
    if not is_staff(user):
        return query.filter(Tarea.responsable_id == user.id)
    scope = scoped_instalacion_ids(db, user)
    if scope is not None:
        query = query.filter(Tarea.sector_id.in_(scope))
    return query


def _tarea_con_acceso(db: Session, user: Usuario, tarea_id: int) -> Tarea:
    tarea = db.query(Tarea).options(
        joinedload(Tarea.responsable),
        joinedload(Tarea.creador),
        joinedload(Tarea.sector),
        joinedload(Tarea.cultivo),
        joinedload(Tarea.comentarios),
    ).filter(Tarea.id == tarea_id).first()
    if not tarea:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    if is_staff(user):
        scope = scoped_instalacion_ids(db, user)
        if scope is not None and tarea.sector_id not in scope:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta tarea")
    elif tarea.responsable_id != user.id and tarea.creador_id != user.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta tarea")
    return tarea


def _validar_usuario(db: Session, usuario_id: int | None) -> Usuario | None:
    if not usuario_id:
        return None
    usuario = db.query(Usuario).filter(
        Usuario.id == usuario_id, Usuario.activo.is_(True)
    ).first()
    if not usuario:
        raise HTTPException(status_code=422, detail="Responsable inválido")
    return usuario


def _validar_asignacion_responsable(
    db: Session, user: Usuario, responsable: Usuario | None
) -> None:
    """Keep supervisor assignments inside their own work groups."""
    if not responsable or is_admin(user) or not is_supervisor(user):
        return
    if not is_encargado(responsable):
        raise HTTPException(
            status_code=422,
            detail="Los supervisores solo asignan tareas a encargados",
        )
    grupos = db.query(GrupoTrabajo).filter(
        GrupoTrabajo.supervisor_id == user.id
    ).all()
    if not grupos:
        return
    permitidos = {
        miembro.id for grupo in grupos for miembro in grupo.miembros
    }
    if responsable.id not in permitidos:
        raise HTTPException(
            status_code=403,
            detail="El encargado no pertenece a tus grupos de trabajo",
        )


def _validar_sector_cultivo(
    db: Session, user: Usuario, sector_id: int | None, cultivo_id: int | None
) -> None:
    if sector_id:
        if not db.query(Instalacion.id).filter(Instalacion.id == sector_id).first():
            raise HTTPException(status_code=422, detail="Sector no encontrado")
        require_instalacion_access(db, user, sector_id)
    if cultivo_id:
        if not db.query(Cultivo.id).filter(Cultivo.id == cultivo_id).first():
            raise HTTPException(status_code=422, detail="Cultivo no encontrado")
        require_cultivo_access(db, user, cultivo_id)


@router.get("/")
def listar_tareas(
    estado: str | None = None,
    categoria: str | None = None,
    prioridad: str | None = None,
    responsable_id: int | None = None,
    sector_id: int | None = None,
    cultivo_id: int | None = None,
    buscar: str | None = None,
    mine: bool = False,
    limit: int = Query(default=300, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(Tarea).options(
        joinedload(Tarea.responsable),
        joinedload(Tarea.creador),
        joinedload(Tarea.sector),
        joinedload(Tarea.cultivo),
    )
    query = _scope_query(db, current_user, query)
    if mine:
        query = query.filter(Tarea.responsable_id == current_user.id)
    if estado:
        query = query.filter(Tarea.estado == estado)
    if categoria:
        query = query.filter(Tarea.categoria == categoria)
    if prioridad:
        query = query.filter(Tarea.prioridad == prioridad)
    if responsable_id:
        query = query.filter(Tarea.responsable_id == responsable_id)
    if sector_id:
        query = query.filter(Tarea.sector_id == sector_id)
    if cultivo_id:
        query = query.filter(Tarea.cultivo_id == cultivo_id)
    if buscar:
        pattern = f"%{buscar.strip()}%"
        query = query.filter(
            Tarea.titulo.like(pattern) | Tarea.descripcion.like(pattern)
        )
    rows = query.order_by(
        Tarea.estado.in_(("completada", "cancelada")),
        Tarea.fecha_limite.is_(None),
        Tarea.fecha_limite,
        Tarea.fecha_creacion.desc(),
    ).limit(limit).all()
    return [serializar(item) for item in rows]


@router.get("/resumen")
def resumen_tareas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = _scope_query(db, current_user, db.query(Tarea))
    rows = query.all()
    now = utcnow()
    por_estado: dict[str, int] = {}
    for row in rows:
        por_estado[row.estado] = por_estado.get(row.estado, 0) + 1
    return {
        "total": len(rows),
        "por_estado": por_estado,
        "pendientes": por_estado.get("pendiente", 0),
        "en_progreso": por_estado.get("en_progreso", 0),
        "en_revision": por_estado.get("en_revision", 0),
        "completadas": por_estado.get("completada", 0),
        "atrasadas": sum(
            1 for row in rows
            if row.fecha_limite and row.estado in ESTADOS_ABIERTOS and naive_utc(row.fecha_limite) < now
        ),
        "mis_tareas": sum(
            1 for row in rows
            if row.responsable_id == current_user.id and row.estado in ESTADOS_ABIERTOS
        ),
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_tarea(
    payload: TareaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    if not is_staff(current_user):
        raise HTTPException(status_code=403, detail="Solo supervisores y administradores crean tareas")
    if payload.sector_id is None and scoped_instalacion_ids(db, current_user) is not None:
        raise HTTPException(status_code=422, detail="Selecciona un sector para la tarea")
    _validar_sector_cultivo(db, current_user, payload.sector_id, payload.cultivo_id)
    responsable = _validar_usuario(db, payload.responsable_id)
    _validar_asignacion_responsable(db, current_user, responsable)

    tarea = Tarea(
        **payload.model_dump(),
        creador_id=current_user.id,
        estado="pendiente",
    )
    db.add(tarea)
    db.flush()
    db.add(
        TareaComentario(
            tarea_id=tarea.id,
            usuario_id=current_user.id,
            comentario="Tarea creada.",
            estado_nuevo="pendiente",
        )
    )
    if responsable:
        notificar_usuarios(
            db,
            [responsable.id],
            "tarea",
            "Nueva tarea asignada",
            f"{tarea.titulo} · prioridad {tarea.prioridad}",
            "importante" if tarea.prioridad in ("alta", "critica") else "info",
            f"../pages/tareas.html?id={tarea.id}",
            "tarea",
            tarea.id,
        )
    db.commit()
    db.refresh(tarea)
    return serializar(_tarea_con_acceso(db, current_user, tarea.id), detalle=True)


@router.get("/{tarea_id}")
def obtener_tarea(
    tarea_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    return serializar(_tarea_con_acceso(db, current_user, tarea_id), detalle=True)


@router.put("/{tarea_id}")
def actualizar_tarea(
    tarea_id: int,
    payload: TareaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    if not is_staff(current_user):
        raise HTTPException(status_code=403, detail="Solo supervisores y administradores editan tareas")
    tarea = _tarea_con_acceso(db, current_user, tarea_id)
    cambios = payload.model_dump(exclude_unset=True)
    if "sector_id" in cambios or "cultivo_id" in cambios:
        _validar_sector_cultivo(
            db,
            current_user,
            cambios.get("sector_id", tarea.sector_id),
            cambios.get("cultivo_id", tarea.cultivo_id),
        )
    responsable_anterior = tarea.responsable_id
    if (
        "responsable_id" in cambios
        and cambios["responsable_id"] != responsable_anterior
    ):
        responsable = _validar_usuario(db, cambios["responsable_id"])
        _validar_asignacion_responsable(db, current_user, responsable)
    for campo, valor in cambios.items():
        setattr(tarea, campo, valor)
    if tarea.responsable_id and tarea.responsable_id != responsable_anterior:
        notificar_usuarios(
            db,
            [tarea.responsable_id],
            "tarea",
            "Tarea reasignada",
            f"Se te asignó: {tarea.titulo}",
            "importante",
            f"../pages/tareas.html?id={tarea.id}",
            "tarea",
            tarea.id,
        )
    db.commit()
    db.refresh(tarea)
    return serializar(_tarea_con_acceso(db, current_user, tarea.id), detalle=True)


@router.put("/{tarea_id}/estado")
def cambiar_estado_tarea(
    tarea_id: int,
    payload: TareaEstadoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    tarea = _tarea_con_acceso(db, current_user, tarea_id)
    if not is_staff(current_user) and tarea.responsable_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el responsable puede actualizar esta tarea")
    estado_anterior = tarea.estado
    tarea.estado = payload.estado
    if payload.estado == "completada":
        tarea.fecha_completada = utcnow()
        tarea.completada_por = current_user.id
    elif estado_anterior == "completada":
        tarea.fecha_completada = None
        tarea.completada_por = None
    db.add(
        TareaComentario(
            tarea_id=tarea.id,
            usuario_id=current_user.id,
            comentario=payload.comentario or "Cambio de estado.",
            estado_anterior=estado_anterior,
            estado_nuevo=payload.estado,
        )
    )
    notificar_usuarios(
        db,
        [tarea.creador_id, tarea.responsable_id],
        "tarea",
        "Tarea actualizada",
        f"{tarea.titulo}: {payload.estado.replace('_', ' ')}",
        "importante" if payload.estado == "completada" else "info",
        f"../pages/tareas.html?id={tarea.id}",
        "tarea",
        tarea.id,
    )
    if payload.estado == "completada":
        notificar_sector(
            db,
            tarea.sector_id,
            "tarea",
            "Tarea completada",
            f"{tarea.titulo} fue completada por {current_user.nombre_completo or current_user.username}",
            "info",
            f"../pages/tareas.html?id={tarea.id}",
            "tarea",
            tarea.id,
        )
    db.commit()
    db.refresh(tarea)
    return serializar(_tarea_con_acceso(db, current_user, tarea.id), detalle=True)


@router.post("/{tarea_id}/comentarios", status_code=status.HTTP_201_CREATED)
def comentar_tarea(
    tarea_id: int,
    payload: ComentarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    tarea = _tarea_con_acceso(db, current_user, tarea_id)
    comentario = TareaComentario(
        tarea_id=tarea.id,
        usuario_id=current_user.id,
        comentario=payload.comentario,
    )
    db.add(comentario)
    notificar_usuarios(
        db,
        [tarea.creador_id, tarea.responsable_id],
        "tarea",
        "Nuevo comentario en tarea",
        f"{tarea.titulo}: {payload.comentario[:120]}",
        "info",
        f"../pages/tareas.html?id={tarea.id}",
        "tarea",
        tarea.id,
    )
    db.commit()
    db.refresh(comentario)
    return serializar_comentario(comentario)


@router.delete("/{tarea_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_tarea(
    tarea_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    tarea = db.query(Tarea).filter(Tarea.id == tarea_id).first()
    if not tarea:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    db.delete(tarea)
    db.commit()
    return None
