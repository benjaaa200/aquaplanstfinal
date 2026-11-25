"""Servicios compartidos de permisos, alcance y notificaciones."""
from datetime import datetime, timedelta
from typing import Iterable, Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    Alerta,
    Cultivo,
    EventoCalendario,
    Incidencia,
    Instalacion,
    Notificacion,
    Tarea,
    Usuario,
    UsuarioCultivo,
)
from backend.security import get_current_active_user, is_admin
from backend.cache import alert_throttle, sensor_notification_throttle
from backend.utils import naive_utc, utcnow


SUPERVISOR_ROLES = frozenset({"supervisor"})
ENCARGADO_ROLES = frozenset({"encargado"})
ADMIN_ROLES = frozenset({"admin", "administrador"})


def role_of(user: Usuario) -> str:
    return (user.rol or "").lower()


def is_supervisor(user: Usuario) -> bool:
    return role_of(user) in SUPERVISOR_ROLES


def is_encargado(user: Usuario) -> bool:
    return role_of(user) in ENCARGADO_ROLES


def is_staff(user: Usuario) -> bool:
    return is_admin(user) or is_supervisor(user)


def require_roles(*roles: str):
    """Dependency factory that restricts access to the given roles."""
    allowed = {role.lower() for role in roles}

    def dependency(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
        if role_of(current_user) not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta acción",
            )
        return current_user

    return dependency


require_staff = require_roles("admin", "administrador", "supervisor")


def scoped_instalacion_ids(db: Session, user: Usuario) -> Optional[set[int]]:
    """Return the installation IDs a user may access, or None for global access.

    Supervisors are scoped to installations where they are responsible. To keep
    legacy installations usable, a supervisor without assignments falls back to
    the global view. Encargados only see installations linked to assigned crops
    or where they are directly responsible.
    """
    if is_admin(user):
        return None

    responsible = {
        row[0]
        for row in db.query(Instalacion.id).filter(
            Instalacion.responsable_id == user.id
        ).all()
    }

    if is_supervisor(user):
        return responsible or None

    crop_installations = {
        row[0]
        for row in db.query(Cultivo.instalacion_id).join(
            UsuarioCultivo, UsuarioCultivo.cultivo_id == Cultivo.id
        ).filter(
            UsuarioCultivo.usuario_id == user.id,
            Cultivo.instalacion_id.isnot(None),
        ).all()
    }
    return responsible | crop_installations


def require_instalacion_access(
    db: Session, user: Usuario, instalacion_id: Optional[int]
) -> None:
    scope = scoped_instalacion_ids(db, user)
    if scope is None:
        return
    if instalacion_id is None or instalacion_id not in scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a este sector",
        )


def visible_incidencias_query(db: Session, user: Usuario, query):
    scope = scoped_instalacion_ids(db, user)
    if scope is None:
        return query
    return query.filter(Incidencia.sector_id.in_(scope))


def crear_notificacion(
    db: Session,
    usuario_id: Optional[int],
    categoria: str,
    titulo: str,
    mensaje: str = "",
    prioridad: str = "info",
    url: Optional[str] = None,
    entidad_tipo: Optional[str] = None,
    entidad_id: Optional[int] = None,
) -> Optional[Notificacion]:
    """Queue a notification for a user. The caller owns the transaction commit."""
    if not usuario_id:
        return None
    notificacion = Notificacion(
        usuario_id=usuario_id,
        categoria=categoria,
        titulo=titulo,
        mensaje=mensaje,
        prioridad=prioridad,
        url=url,
        entidad_tipo=entidad_tipo,
        entidad_id=entidad_id,
    )
    db.add(notificacion)
    return notificacion


def notificar_usuarios(
    db: Session,
    usuarios: Iterable[int],
    categoria: str,
    titulo: str,
    mensaje: str = "",
    prioridad: str = "info",
    url: Optional[str] = None,
    entidad_tipo: Optional[str] = None,
    entidad_id: Optional[int] = None,
) -> None:
    for usuario_id in {uid for uid in usuarios if uid}:
        crear_notificacion(
            db,
            usuario_id,
            categoria,
            titulo,
            mensaje,
            prioridad,
            url,
            entidad_tipo,
            entidad_id,
        )


def notificar_sector(
    db: Session,
    sector_id: Optional[int],
    categoria: str,
    titulo: str,
    mensaje: str = "",
    prioridad: str = "info",
    url: Optional[str] = None,
    entidad_tipo: Optional[str] = None,
    entidad_id: Optional[int] = None,
) -> None:
    """Notify the sector supervisor, falling back to administrators."""
    targets: list[int] = []
    if sector_id:
        instalacion = db.query(Instalacion).filter(Instalacion.id == sector_id).first()
        if instalacion and instalacion.responsable_id:
            targets.append(instalacion.responsable_id)
    if not targets:
        targets = [
            row[0]
            for row in db.query(Usuario.id).filter(
                Usuario.rol.in_(("admin", "administrador")),
                Usuario.activo.is_(True),
            ).all()
        ]
    notificar_usuarios(
        db, targets, categoria, titulo, mensaje, prioridad, url, entidad_tipo, entidad_id
    )


def usuario_nombre(user: Optional[Usuario]) -> Optional[str]:
    if not user:
        return None
    return user.nombre_completo or user.username


def notificar_alerta_sensor(
    db: Session, alerta: Alerta, cultivo: Cultivo
) -> None:
    """Notify the people responsible for a crop about a new sensor alert."""
    throttle_key = (db.get_bind(), cultivo.id, alerta.tipo)

    targets = [
        row[0]
        for row in db.query(UsuarioCultivo.usuario_id).filter(
            UsuarioCultivo.cultivo_id == cultivo.id
        ).all()
    ]
    if not targets and cultivo.instalacion_id:
        instalacion = db.query(Instalacion).filter(
            Instalacion.id == cultivo.instalacion_id
        ).first()
        if instalacion and instalacion.responsable_id:
            targets.append(instalacion.responsable_id)
    if not targets:
        targets = [
            row[0]
            for row in db.query(Usuario.id).filter(
                Usuario.rol.in_(tuple(ADMIN_ROLES)),
                Usuario.activo.is_(True),
            ).all()
        ]
    if not targets or not sensor_notification_throttle.get_or_set(throttle_key, True):
        return

    notificar_usuarios(
        db,
        targets,
        "alerta",
        f"Alerta en {cultivo.nombre}",
        alerta.mensaje,
        "urgente" if alerta.severidad == "critical" else "importante",
        "/pages/alertas.html",
        "alerta",
        alerta.id,
    )


def ahora() -> datetime:
    return utcnow()



def generar_alertas_pendientes(db: Session, user: Usuario) -> int:
    """Create at most one due/overdue alert per task or inspection per day."""
    throttle_key = (db.get_bind(), user.id)
    if not alert_throttle.get_or_set(throttle_key, True):
        return 0

    now = utcnow()
    day_start = datetime(now.year, now.month, now.day)
    created = 0

    tareas = db.query(Tarea).filter(
        Tarea.responsable_id == user.id,
        Tarea.fecha_limite.isnot(None),
        Tarea.estado.notin_(("completada", "cancelada")),
    ).all()
    for tarea in tareas:
        limite = naive_utc(tarea.fecha_limite)
        if not limite:
            continue
        atrasada = limite < now
        if not atrasada and limite > now + timedelta(hours=24):
            continue
        existe = db.query(Notificacion.id).filter(
            Notificacion.usuario_id == user.id,
            Notificacion.entidad_tipo == "tarea_alerta",
            Notificacion.entidad_id == tarea.id,
            Notificacion.fecha_creacion >= day_start,
        ).first()
        if existe:
            continue
        crear_notificacion(
            db,
            user.id,
            "tarea",
            "Tarea atrasada" if atrasada else "Tarea próxima a vencer",
            f"{tarea.titulo} · vence {limite:%d-%m-%Y %H:%M}",
            "urgente" if atrasada else "importante",
            "/pages/tareas.html",
            "tarea_alerta",
            tarea.id,
        )
        created += 1

    inspecciones = db.query(EventoCalendario).filter(
        EventoCalendario.responsable_id == user.id,
        EventoCalendario.tipo == "inspeccion",
        EventoCalendario.estado == "programado",
        EventoCalendario.fecha_inicio >= now,
        EventoCalendario.fecha_inicio <= now + timedelta(hours=48),
    ).all()
    for evento in inspecciones:
        existe = db.query(Notificacion.id).filter(
            Notificacion.usuario_id == user.id,
            Notificacion.entidad_tipo == "inspeccion_alerta",
            Notificacion.entidad_id == evento.id,
            Notificacion.fecha_creacion >= day_start,
        ).first()
        if existe:
            continue
        crear_notificacion(
            db,
            user.id,
            "inspeccion",
            "Inspección próxima",
            f"{evento.titulo} · {naive_utc(evento.fecha_inicio):%d-%m-%Y %H:%M}",
            "importante",
            "/pages/calendario.html",
            "inspeccion_alerta",
            evento.id,
        )
        created += 1

    if created:
        db.commit()
    return created
