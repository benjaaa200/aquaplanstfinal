"""Centro de incidencias con seguimiento, comentarios y notificaciones."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import (
    Cultivo,
    Incidencia,
    IncidenciaComentario,
    Instalacion,
    Usuario,
)
from backend.schemas_ops import (
    ComentarioCreate,
    IncidenciaCreate,
    IncidenciaEscalar,
    IncidenciaEstadoUpdate,
    IncidenciaUpdate,
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

router = APIRouter(prefix="/incidencias", tags=["Incidencias"])

PRIORIDADES = ("baja", "media", "alta", "critica")
ROLES_ADMIN = ("admin", "administrador")


def serializar(incidencia: Incidencia, detalle: bool = False) -> dict:
    data = {
        "id": incidencia.id,
        "titulo": incidencia.titulo,
        "descripcion": incidencia.descripcion,
        "categoria": incidencia.categoria,
        "prioridad": incidencia.prioridad,
        "estado": incidencia.estado,
        "sector_id": incidencia.sector_id,
        "sector_nombre": incidencia.sector_nombre,
        "cultivo_id": incidencia.cultivo_id,
        "cultivo_nombre": incidencia.cultivo_nombre,
        "reportado_por": incidencia.reportado_por,
        "reportador_nombre": incidencia.reportador_nombre,
        "asignado_a": incidencia.asignado_a,
        "asignado_nombre": incidencia.asignado_nombre,
        "resolucion": incidencia.resolucion,
        "fecha_creacion": incidencia.fecha_creacion,
        "fecha_actualizacion": incidencia.fecha_actualizacion,
        "fecha_resolucion": incidencia.fecha_resolucion,
    }
    if detalle:
        data["comentarios"] = [
            serializar_comentario(item)
            for item in sorted(incidencia.comentarios, key=lambda row: row.id)
        ]
    return data


def serializar_comentario(comentario: IncidenciaComentario) -> dict:
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
    scope = scoped_instalacion_ids(db, user)
    if is_staff(user):
        if scope is not None:
            query = query.filter(Incidencia.sector_id.in_(scope))
        return query
    return query.filter(
        Incidencia.sector_id.in_(scope or set())
        | (Incidencia.reportado_por == user.id)
        | (Incidencia.asignado_a == user.id)
    )


def _validar_sector_cultivo(
    db: Session, user: Usuario, sector_id: int | None, cultivo_id: int | None
) -> tuple[int | None, int | None]:
    if cultivo_id:
        cultivo = db.query(Cultivo).filter(Cultivo.id == cultivo_id).first()
        if not cultivo:
            raise HTTPException(status_code=422, detail="Cultivo no encontrado")
        require_cultivo_access(db, user, cultivo_id)
        if sector_id is None:
            sector_id = cultivo.instalacion_id
    if sector_id:
        if not db.query(Instalacion.id).filter(Instalacion.id == sector_id).first():
            raise HTTPException(status_code=422, detail="Sector no encontrado")
        require_instalacion_access(db, user, sector_id)
    return sector_id, cultivo_id


def _incidencia_con_acceso(
    db: Session, user: Usuario, incidencia_id: int
) -> Incidencia:
    incidencia = db.query(Incidencia).options(
        joinedload(Incidencia.cultivo),
        joinedload(Incidencia.sector),
        joinedload(Incidencia.reportador),
        joinedload(Incidencia.asignado),
        joinedload(Incidencia.comentarios),
    ).populate_existing().filter(Incidencia.id == incidencia_id).first()
    if not incidencia:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    if is_staff(user):
        scope = scoped_instalacion_ids(db, user)
        if scope is not None and incidencia.sector_id not in scope:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta incidencia")
    elif incidencia.reportado_por != user.id and incidencia.asignado_a != user.id:
        scope = scoped_instalacion_ids(db, user)
        if scope is None or incidencia.sector_id not in scope:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta incidencia")
    return incidencia


@router.get("/")
def listar_incidencias(
    estado: str | None = None,
    categoria: str | None = None,
    prioridad: str | None = None,
    sector_id: int | None = None,
    cultivo_id: int | None = None,
    asignado_a: int | None = None,
    buscar: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(Incidencia).options(
        joinedload(Incidencia.cultivo),
        joinedload(Incidencia.sector),
        joinedload(Incidencia.reportador),
        joinedload(Incidencia.asignado),
    )
    query = _scope_query(db, current_user, query)
    if estado:
        query = query.filter(Incidencia.estado == estado)
    if categoria:
        query = query.filter(Incidencia.categoria == categoria)
    if prioridad:
        query = query.filter(Incidencia.prioridad == prioridad)
    if sector_id:
        query = query.filter(Incidencia.sector_id == sector_id)
    if cultivo_id:
        query = query.filter(Incidencia.cultivo_id == cultivo_id)
    if asignado_a:
        query = query.filter(Incidencia.asignado_a == asignado_a)
    if buscar:
        pattern = f"%{buscar.strip()}%"
        query = query.filter(
            Incidencia.titulo.like(pattern) | Incidencia.descripcion.like(pattern)
        )
    rows = query.order_by(
        Incidencia.estado.in_(("resuelta", "cerrada")),
        Incidencia.fecha_creacion.desc(),
    ).limit(limit).all()
    return [serializar(item) for item in rows]


@router.get("/estadisticas")
def estadisticas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = _scope_query(db, current_user, db.query(Incidencia))
    rows = query.all()
    por_estado = {}
    por_categoria = {}
    por_prioridad = {}
    for row in rows:
        por_estado[row.estado] = por_estado.get(row.estado, 0) + 1
        por_categoria[row.categoria] = por_categoria.get(row.categoria, 0) + 1
        por_prioridad[row.prioridad] = por_prioridad.get(row.prioridad, 0) + 1
    return {
        "total": len(rows),
        "abiertas": sum(
            1 for row in rows if row.estado not in ("resuelta", "cerrada")
        ),
        "resueltas": sum(1 for row in rows if row.estado == "resuelta"),
        "cerradas": sum(1 for row in rows if row.estado == "cerrada"),
        "por_estado": por_estado,
        "por_categoria": por_categoria,
        "por_prioridad": por_prioridad,
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_incidencia(
    payload: IncidenciaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    sector_id, cultivo_id = _validar_sector_cultivo(
        db, current_user, payload.sector_id, payload.cultivo_id
    )
    if sector_id is None and cultivo_id is None and not is_staff(current_user):
        raise HTTPException(
            status_code=422, detail="Selecciona el sector o cultivo afectado"
        )
    incidencia = Incidencia(
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        categoria=payload.categoria,
        prioridad=payload.prioridad,
        estado="nueva",
        sector_id=sector_id,
        cultivo_id=cultivo_id,
        reportado_por=current_user.id,
    )
    db.add(incidencia)
    db.flush()
    db.add(
        IncidenciaComentario(
            incidencia_id=incidencia.id,
            usuario_id=current_user.id,
            comentario="Incidencia registrada.",
            estado_nuevo="nueva",
        )
    )
    notificar_sector(
        db,
        sector_id,
        "incidencia",
        "Nueva incidencia registrada",
        f"{payload.titulo} · prioridad {payload.prioridad}",
        "urgente" if payload.prioridad == "critica" else "importante",
        f"../pages/incidencias.html?id={incidencia.id}",
        "incidencia",
        incidencia.id,
    )
    db.commit()
    db.refresh(incidencia)
    return serializar(incidencia, detalle=True)


@router.get("/{incidencia_id}")
def obtener_incidencia(
    incidencia_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    return serializar(_incidencia_con_acceso(db, current_user, incidencia_id), detalle=True)


@router.put("/{incidencia_id}")
def actualizar_incidencia(
    incidencia_id: int,
    payload: IncidenciaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    incidencia = _incidencia_con_acceso(db, current_user, incidencia_id)
    staff = is_staff(current_user)
    if not staff:
        if incidencia.reportado_por != current_user.id:
            raise HTTPException(status_code=403, detail="No puedes editar esta incidencia")
        if incidencia.estado not in ("nueva", "pendiente_revision"):
            raise HTTPException(
                status_code=409,
                detail="La incidencia ya está en gestión y no puede editarse",
            )

    cambios = payload.model_dump(exclude_unset=True)
    if not staff:
        cambios.pop("asignado_a", None)
        cambios.pop("resolucion", None)

    estado_anterior = incidencia.estado
    if "asignado_a" in cambios and cambios["asignado_a"]:
        asignado = db.query(Usuario).filter(
            Usuario.id == cambios["asignado_a"], Usuario.activo.is_(True)
        ).first()
        if not asignado:
            raise HTTPException(status_code=422, detail="Responsable inválido")
        if incidencia.estado in ("nueva", "pendiente_revision"):
            incidencia.estado = "asignada"
    if "sector_id" in cambios:
        require_instalacion_access(db, current_user, cambios["sector_id"])
        if cambios["sector_id"] and not db.query(Instalacion.id).filter(
            Instalacion.id == cambios["sector_id"]
        ).first():
            raise HTTPException(status_code=422, detail="Sector no encontrado")
    if "cultivo_id" in cambios and cambios["cultivo_id"]:
        if not db.query(Cultivo.id).filter(Cultivo.id == cambios["cultivo_id"]).first():
            raise HTTPException(status_code=422, detail="Cultivo no encontrado")
        require_cultivo_access(db, current_user, cambios["cultivo_id"])

    for campo, valor in cambios.items():
        setattr(incidencia, campo, valor)

    if incidencia.estado != estado_anterior:
        db.add(
            IncidenciaComentario(
                incidencia_id=incidencia.id,
                usuario_id=current_user.id,
                comentario="Estado actualizado desde la edición.",
                estado_anterior=estado_anterior,
                estado_nuevo=incidencia.estado,
            )
        )
        notificar_usuarios(
            db,
            [incidencia.reportado_por, incidencia.asignado_a],
            "incidencia",
            "Incidencia actualizada",
            f"{incidencia.titulo} pasó a {incidencia.estado.replace('_', ' ')}",
            "info",
            f"../pages/incidencias.html?id={incidencia.id}",
            "incidencia",
            incidencia.id,
        )

    if "asignado_a" in cambios and cambios["asignado_a"]:
        notificar_usuarios(
            db,
            [cambios["asignado_a"]],
            "incidencia",
            "Incidencia asignada",
            f"Se te asignó: {incidencia.titulo}",
            "importante",
            f"../pages/incidencias.html?id={incidencia.id}",
            "incidencia",
            incidencia.id,
        )

    db.commit()
    db.refresh(incidencia)
    return serializar(_incidencia_con_acceso(db, current_user, incidencia_id), detalle=True)


@router.post("/{incidencia_id}/escalar")
def escalar_incidencia(
    incidencia_id: int,
    payload: IncidenciaEscalar | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    """Asigna la incidencia a un administrador y sube su prioridad."""
    incidencia = _incidencia_con_acceso(db, current_user, incidencia_id)
    if incidencia.estado in ("resuelta", "cerrada"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede escalar una incidencia resuelta o cerrada",
        )

    admin = (
        db.query(Usuario)
        .filter(Usuario.rol.in_(ROLES_ADMIN), Usuario.activo.is_(True))
        .order_by(Usuario.id)
        .first()
    )
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No hay administradores activos disponibles",
        )

    try:
        posicion = PRIORIDADES.index(incidencia.prioridad)
    except ValueError:
        posicion = 1
    incidencia.prioridad = PRIORIDADES[min(posicion + 1, len(PRIORIDADES) - 1)]
    incidencia.asignado_a = admin.id

    motivo = (payload.motivo or "").strip() if payload else ""
    comentario = "Incidencia escalada a administración."
    if motivo:
        comentario = f"{comentario} Motivo: {motivo}"
    db.add(
        IncidenciaComentario(
            incidencia_id=incidencia.id,
            usuario_id=current_user.id,
            comentario=comentario,
        )
    )

    destinatarios = {
        row[0]
        for row in db.query(Usuario.id).filter(
            Usuario.rol.in_(ROLES_ADMIN), Usuario.activo.is_(True)
        ).all()
    }
    if incidencia.reportado_por:
        destinatarios.add(incidencia.reportado_por)
    notificar_usuarios(
        db,
        destinatarios,
        "incidencia",
        "Incidencia escalada",
        f"{incidencia.titulo} · prioridad {incidencia.prioridad}",
        "urgente" if incidencia.prioridad == "critica" else "importante",
        f"../pages/incidencias.html?id={incidencia.id}",
        "incidencia",
        incidencia.id,
    )

    db.commit()
    return serializar(
        _incidencia_con_acceso(db, current_user, incidencia_id), detalle=True
    )


@router.put("/{incidencia_id}/estado")
def cambiar_estado(
    incidencia_id: int,
    payload: IncidenciaEstadoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    incidencia = _incidencia_con_acceso(db, current_user, incidencia_id)
    if not is_staff(current_user) and incidencia.asignado_a != current_user.id:
        raise HTTPException(
            status_code=403, detail="Solo el responsable asignado puede actualizar el estado"
        )
    estado_anterior = incidencia.estado
    if estado_anterior == payload.estado and not payload.comentario:
        return serializar(incidencia, detalle=True)
    incidencia.estado = payload.estado
    if payload.resolucion:
        incidencia.resolucion = payload.resolucion
    if payload.estado in ("resuelta", "cerrada"):
        incidencia.fecha_resolucion = datetime.utcnow()
    elif estado_anterior in ("resuelta", "cerrada"):
        incidencia.fecha_resolucion = None
    db.add(
        IncidenciaComentario(
            incidencia_id=incidencia.id,
            usuario_id=current_user.id,
            comentario=payload.comentario or "Cambio de estado.",
            estado_anterior=estado_anterior,
            estado_nuevo=payload.estado,
        )
    )
    notificar_usuarios(
        db,
        [incidencia.reportado_por, incidencia.asignado_a],
        "incidencia",
        "Incidencia actualizada",
        f"{incidencia.titulo}: {payload.estado.replace('_', ' ')}",
        "importante" if payload.estado in ("resuelta", "cerrada") else "info",
        f"../pages/incidencias.html?id={incidencia.id}",
        "incidencia",
        incidencia.id,
    )
    db.commit()
    db.refresh(incidencia)
    return serializar(_incidencia_con_acceso(db, current_user, incidencia_id), detalle=True)


@router.post("/{incidencia_id}/comentarios", status_code=status.HTTP_201_CREATED)
def agregar_comentario(
    incidencia_id: int,
    payload: ComentarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    incidencia = _incidencia_con_acceso(db, current_user, incidencia_id)
    comentario = IncidenciaComentario(
        incidencia_id=incidencia.id,
        usuario_id=current_user.id,
        comentario=payload.comentario,
    )
    db.add(comentario)
    notificar_usuarios(
        db,
        [
            incidencia.reportado_por,
            incidencia.asignado_a,
            incidencia.sector.responsable_id if incidencia.sector else None,
        ],
        "incidencia",
        "Nuevo comentario en incidencia",
        f"{incidencia.titulo}: {payload.comentario[:120]}",
        "info",
        f"../pages/incidencias.html?id={incidencia.id}",
        "incidencia",
        incidencia.id,
    )
    db.commit()
    db.refresh(comentario)
    return serializar_comentario(comentario)


@router.get("/{incidencia_id}/historial")
def historial(
    incidencia_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    incidencia = _incidencia_con_acceso(db, current_user, incidencia_id)
    return [
        serializar_comentario(item)
        for item in db.query(IncidenciaComentario).filter(
            IncidenciaComentario.incidencia_id == incidencia.id
        ).order_by(IncidenciaComentario.id).all()
    ]


@router.delete("/{incidencia_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_incidencia(
    incidencia_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    incidencia = db.query(Incidencia).filter(Incidencia.id == incidencia_id).first()
    if not incidencia:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    db.delete(incidencia)
    db.commit()
    return None
