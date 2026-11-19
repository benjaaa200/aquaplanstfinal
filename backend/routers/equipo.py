"""Gestión de equipo, asignaciones y actividad de trabajadores."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import (
    Cultivo,
    Incidencia,
    Instalacion,
    Tarea,
    Usuario,
    UsuarioCultivo,
)
from backend.schemas_ops import EquipoSectoresUpdate
from backend.security import get_current_active_user
from backend.services import (
    is_admin,
    is_staff,
    notificar_usuarios,
    scoped_instalacion_ids,
)

router = APIRouter(prefix="/equipo", tags=["Equipo"])


def _usuarios_visibles(db: Session, user: Usuario) -> list[Usuario]:
    scope = scoped_instalacion_ids(db, user)
    if scope is None:
        return db.query(Usuario).order_by(Usuario.nombre_completo).all()
    if not scope:
        return [user]
    user_ids = {
        row[0]
        for row in db.query(Instalacion.responsable_id).filter(
            Instalacion.id.in_(scope),
            Instalacion.responsable_id.isnot(None),
        ).all()
    }
    user_ids.update(
        row[0]
        for row in db.query(UsuarioCultivo.usuario_id).join(
            Cultivo, UsuarioCultivo.cultivo_id == Cultivo.id
        ).filter(Cultivo.instalacion_id.in_(scope)).all()
    )
    user_ids.add(user.id)
    return db.query(Usuario).filter(Usuario.id.in_(user_ids)).order_by(
        Usuario.nombre_completo
    ).all()


ESTADOS_TAREA_ABIERTOS = ("pendiente", "en_progreso", "en_revision", "atrasada")
ESTADOS_INCIDENCIA_CERRADOS = ("resuelta", "cerrada")


def _serializar_muchos(db: Session, usuarios: list[Usuario]) -> list[dict]:
    """Serializa varios integrantes con agregados en lote."""
    if not usuarios:
        return []
    ids = [usuario.id for usuario in usuarios]
    sectores = db.query(Instalacion).filter(
        Instalacion.responsable_id.in_(ids)
    ).order_by(Instalacion.nombre).all()
    sectores_por_usuario: dict[int, list[dict]] = {
        usuario_id: [] for usuario_id in ids
    }
    for sector in sectores:
        sectores_por_usuario[sector.responsable_id].append(
            {"id": sector.id, "nombre": sector.nombre}
        )
    cultivos = dict(
        db.query(UsuarioCultivo.usuario_id, func.count(UsuarioCultivo.id))
        .filter(UsuarioCultivo.usuario_id.in_(ids))
        .group_by(UsuarioCultivo.usuario_id)
        .all()
    )
    tareas = dict(
        db.query(Tarea.responsable_id, func.count(Tarea.id))
        .filter(
            Tarea.responsable_id.in_(ids),
            Tarea.estado.in_(ESTADOS_TAREA_ABIERTOS),
        )
        .group_by(Tarea.responsable_id)
        .all()
    )
    incidencias = dict(
        db.query(Incidencia.asignado_a, func.count(Incidencia.id))
        .filter(
            Incidencia.asignado_a.in_(ids),
            Incidencia.estado.notin_(ESTADOS_INCIDENCIA_CERRADOS),
        )
        .group_by(Incidencia.asignado_a)
        .all()
    )
    return [
        {
            "id": usuario.id,
            "username": usuario.username,
            "email": usuario.email,
            "nombre_completo": usuario.nombre_completo,
            "rol": usuario.rol,
            "activo": usuario.activo,
            "ultimo_acceso": usuario.ultimo_acceso,
            "fecha_creacion": usuario.fecha_creacion,
            "sectores": sectores_por_usuario.get(usuario.id, []),
            "cultivos_count": int(cultivos.get(usuario.id, 0)),
            "tareas_pendientes": int(tareas.get(usuario.id, 0)),
            "incidencias_abiertas": int(incidencias.get(usuario.id, 0)),
        }
        for usuario in usuarios
    ]


def _serializar(db: Session, usuario: Usuario) -> dict:
    return _serializar_muchos(db, [usuario])[0]


@router.get("/")
def listar_equipo(
    rol: str | None = None,
    activo: bool | None = True,
    buscar: str | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    usuarios = _usuarios_visibles(db, current_user)
    if rol:
        usuarios = [user for user in usuarios if (user.rol or "").lower() == rol.lower()]
    if activo is not None:
        usuarios = [user for user in usuarios if user.activo is activo]
    if buscar:
        pattern = buscar.strip().lower()
        usuarios = [
            user for user in usuarios
            if pattern in (user.nombre_completo or "").lower()
            or pattern in user.username.lower()
            or pattern in (user.email or "").lower()
        ]
    return _serializar_muchos(db, usuarios)


ROLES_ADMIN = ("admin", "administrador")


def _contacto(usuario: Usuario, grupo: str | None = None) -> dict:
    return {
        "id": usuario.id,
        "username": usuario.username,
        "nombre_completo": usuario.nombre_completo,
        "email": usuario.email,
        "telefono": usuario.telefono_respaldo,
        "rol": usuario.rol,
        "grupo": grupo,
    }


@router.get("/contactos")
def contactos_escalamiento(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    """Devuelve los supervisores y administradores a los que puede escalar."""
    supervisores: dict[int, dict] = {}

    for grupo in current_user.grupos_trabajo:
        supervisor = grupo.supervisor
        if (
            supervisor
            and supervisor.activo
            and supervisor.id != current_user.id
            and supervisor.rol in ("supervisor", *ROLES_ADMIN)
        ):
            supervisores.setdefault(
                supervisor.id, _contacto(supervisor, grupo.nombre)
            )

    cultivo_ids = [
        row[0]
        for row in db.query(UsuarioCultivo.cultivo_id)
        .filter(UsuarioCultivo.usuario_id == current_user.id)
        .all()
    ]
    if cultivo_ids:
        instalacion_ids = [
            row[0]
            for row in db.query(Cultivo.instalacion_id)
            .filter(
                Cultivo.id.in_(cultivo_ids),
                Cultivo.instalacion_id.isnot(None),
            )
            .all()
        ]
        if instalacion_ids:
            responsables = (
                db.query(Usuario)
                .join(Instalacion, Instalacion.responsable_id == Usuario.id)
                .filter(
                    Instalacion.id.in_(instalacion_ids),
                    Usuario.activo.is_(True),
                    Usuario.rol == "supervisor",
                    Usuario.id != current_user.id,
                )
                .all()
            )
            for responsable in responsables:
                supervisores.setdefault(responsable.id, _contacto(responsable))

    administradores = (
        db.query(Usuario)
        .filter(
            Usuario.rol.in_(ROLES_ADMIN),
            Usuario.activo.is_(True),
            Usuario.id != current_user.id,
        )
        .order_by(Usuario.nombre_completo)
        .all()
    )

    return {
        "supervisores": list(supervisores.values()),
        "administradores": [_contacto(admin) for admin in administradores],
    }


@router.get("/{usuario_id}/actividad")
def actividad_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    visibles = {item.id for item in _usuarios_visibles(db, current_user)}
    if usuario.id not in visibles:
        raise HTTPException(status_code=403, detail="No tienes acceso a este usuario")

    tareas = db.query(Tarea).options(
        joinedload(Tarea.sector), joinedload(Tarea.cultivo)
    ).filter(
        Tarea.responsable_id == usuario.id
    ).order_by(Tarea.fecha_creacion.desc()).limit(30).all()
    incidencias = db.query(Incidencia).options(
        joinedload(Incidencia.sector), joinedload(Incidencia.cultivo)
    ).filter(
        (Incidencia.asignado_a == usuario.id) | (Incidencia.reportado_por == usuario.id)
    ).order_by(Incidencia.fecha_creacion.desc()).limit(30).all()
    return {
        "usuario": _serializar(db, usuario),
        "tareas": [
            {
                "id": tarea.id,
                "titulo": tarea.titulo,
                "estado": tarea.estado,
                "prioridad": tarea.prioridad,
                "sector_nombre": tarea.sector_nombre,
                "fecha_limite": tarea.fecha_limite,
                "fecha_creacion": tarea.fecha_creacion,
            }
            for tarea in tareas
        ],
        "incidencias": [
            {
                "id": incidencia.id,
                "titulo": incidencia.titulo,
                "estado": incidencia.estado,
                "prioridad": incidencia.prioridad,
                "sector_nombre": incidencia.sector_nombre,
                "fecha_creacion": incidencia.fecha_creacion,
            }
            for incidencia in incidencias
        ],
    }


@router.put("/{usuario_id}/sectores")
def asignar_sectores(
    usuario_id: int,
    payload: EquipoSectoresUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    if not is_staff(current_user):
        raise HTTPException(status_code=403, detail="No puedes gestionar asignaciones")
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if (usuario.rol or "").lower() not in ("encargado", "supervisor"):
        raise HTTPException(
            status_code=409, detail="Solo se asignan sectores a encargados o supervisores"
        )
    if not is_admin(current_user) and (usuario.rol or "").lower() != "encargado":
        raise HTTPException(
            status_code=403, detail="Solo puedes organizar encargados de tus sectores"
        )
    if len(payload.sector_ids) != len(set(payload.sector_ids)):
        raise HTTPException(status_code=422, detail="No repitas sectores")

    scope = scoped_instalacion_ids(db, current_user)
    if scope is not None:
        if not set(payload.sector_ids).issubset(scope):
            raise HTTPException(status_code=403, detail="Hay sectores fuera de tu alcance")
    if payload.sector_ids:
        existentes = {
            row[0] for row in db.query(Instalacion.id).filter(
                Instalacion.id.in_(payload.sector_ids)
            ).all()
        }
        if existentes != set(payload.sector_ids):
            raise HTTPException(status_code=404, detail="Uno o más sectores no existen")

    query = db.query(Instalacion).filter(Instalacion.responsable_id == usuario_id)
    if scope is not None:
        query = query.filter(Instalacion.id.in_(scope))
    query.update({Instalacion.responsable_id: None}, synchronize_session=False)
    if payload.sector_ids:
        db.query(Instalacion).filter(
            Instalacion.id.in_(payload.sector_ids)
        ).update({Instalacion.responsable_id: usuario_id}, synchronize_session=False)
    notificar_usuarios(
        db,
        [usuario.id],
        "equipo",
        "Sectores actualizados",
        f"Tus sectores asignados fueron actualizados ({len(payload.sector_ids)}).",
        "info",
        "../pages/equipo.html",
        "usuario",
        usuario.id,
    )
    db.commit()
    db.refresh(usuario)
    return _serializar(db, usuario)
