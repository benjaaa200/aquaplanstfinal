"""Grupos de trabajo: supervisores y encargados asignados."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import (
    ConfiguracionMapa,
    Cultivo,
    GrupoMiembro,
    GrupoTrabajo,
    Incidencia,
    Instalacion,
    Tarea,
    Usuario,
    UsuarioCultivo,
)
from backend.schemas_ops import GrupoCreate, GrupoUpdate
from backend.security import get_current_active_user, require_admin
from backend.services import (
    is_admin,
    is_encargado,
    is_supervisor,
    notificar_usuarios,
)

router = APIRouter(prefix="/grupos", tags=["Grupos de trabajo"])

ESTADOS_ABIERTOS = ("pendiente", "en_progreso", "en_revision", "atrasada")
ESTADOS_INCIDENCIA_CERRADOS = ("resuelta", "cerrada")


def _cargar_grupo(db: Session, grupo_id: int) -> GrupoTrabajo | None:
    return db.query(GrupoTrabajo).options(
        joinedload(GrupoTrabajo.supervisor),
        joinedload(GrupoTrabajo.miembros),
    ).filter(GrupoTrabajo.id == grupo_id).first()


def _stats_por_usuario(db: Session, usuario_ids: set[int]) -> dict[int, dict]:
    """Tareas, incidencias y cultivos por usuario en tres consultas."""
    if not usuario_ids:
        return {}
    ids = list(usuario_ids)
    tareas = dict(
        db.query(Tarea.responsable_id, func.count(Tarea.id))
        .filter(
            Tarea.responsable_id.in_(ids),
            Tarea.estado.in_(ESTADOS_ABIERTOS),
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
    cultivos = dict(
        db.query(UsuarioCultivo.usuario_id, func.count(UsuarioCultivo.id))
        .filter(UsuarioCultivo.usuario_id.in_(ids))
        .group_by(UsuarioCultivo.usuario_id)
        .all()
    )
    return {
        usuario_id: {
            "tareas_pendientes": int(tareas.get(usuario_id, 0)),
            "incidencias_abiertas": int(incidencias.get(usuario_id, 0)),
            "cultivos_count": int(cultivos.get(usuario_id, 0)),
        }
        for usuario_id in ids
    }


def _sectores_por_supervisor(
    db: Session, supervisor_ids: set[int]
) -> dict[int, list[dict]]:
    """Sectores y configuración de mapa para todos los supervisores en dos consultas."""
    ids = [supervisor_id for supervisor_id in supervisor_ids if supervisor_id]
    if not ids:
        return {}
    sectores = db.query(Instalacion).filter(
        Instalacion.responsable_id.in_(ids)
    ).order_by(Instalacion.nombre).all()
    if not sectores:
        return {}
    configs = {
        config.sector_id: config
        for config in db.query(ConfiguracionMapa).filter(
            ConfiguracionMapa.sector_id.in_([sector.id for sector in sectores])
        ).all()
    }
    resultado: dict[int, list[dict]] = {}
    for sector in sectores:
        config = configs.get(sector.id)
        resultado.setdefault(sector.responsable_id, []).append({
            "id": sector.id,
            "nombre": sector.nombre,
            "tipo_sector": config.tipo_sector if config else "cultivo",
            "color": config.color if config else "#0E7490",
        })
    return resultado


def _serializar_muchos(db: Session, grupos: list[GrupoTrabajo]) -> list[dict]:
    usuario_ids = {miembro.id for grupo in grupos for miembro in grupo.miembros}
    supervisor_ids = {grupo.supervisor_id for grupo in grupos if grupo.supervisor_id}
    stats = _stats_por_usuario(db, usuario_ids)
    sectores_por_supervisor = _sectores_por_supervisor(db, supervisor_ids)

    resultado = []
    for grupo in grupos:
        supervisor = grupo.supervisor
        miembros = sorted(
            grupo.miembros,
            key=lambda item: (item.nombre_completo or item.username or "").lower(),
        )
        miembros_data = []
        tareas_abiertas = 0
        incidencias_abiertas = 0
        for miembro in miembros:
            datos = stats.get(miembro.id) or {
                "tareas_pendientes": 0,
                "incidencias_abiertas": 0,
                "cultivos_count": 0,
            }
            miembros_data.append({
                "id": miembro.id,
                "username": miembro.username,
                "nombre_completo": miembro.nombre_completo,
                "email": miembro.email,
                "rol": miembro.rol,
                "activo": miembro.activo,
                **datos,
            })
            tareas_abiertas += datos["tareas_pendientes"]
            incidencias_abiertas += datos["incidencias_abiertas"]
        sectores = sectores_por_supervisor.get(grupo.supervisor_id, [])
        resultado.append({
            "id": grupo.id,
            "nombre": grupo.nombre,
            "descripcion": grupo.descripcion,
            "color": grupo.color,
            "activo": grupo.activo,
            "fecha_creacion": grupo.fecha_creacion,
            "supervisor_id": grupo.supervisor_id,
            "supervisor_nombre": (
                (supervisor.nombre_completo or supervisor.username)
                if supervisor else None
            ),
            "supervisor": (
                {
                    "id": supervisor.id,
                    "username": supervisor.username,
                    "nombre_completo": supervisor.nombre_completo,
                    "email": supervisor.email,
                    "activo": supervisor.activo,
                }
                if supervisor else None
            ),
            "miembros": miembros_data,
            "total_miembros": len(miembros_data),
            "sectores": sectores,
            "total_sectores": len(sectores),
            "tareas_abiertas": tareas_abiertas,
            "incidencias_abiertas": incidencias_abiertas,
        })
    return resultado


def _serializar(db: Session, grupo: GrupoTrabajo) -> dict:
    return _serializar_muchos(db, [grupo])[0]


def _puede_ver(db: Session, user: Usuario, grupo: GrupoTrabajo) -> bool:
    if is_admin(user):
        return True
    if is_supervisor(user) and grupo.supervisor_id == user.id:
        return True
    return any(miembro.id == user.id for miembro in grupo.miembros)


def _validar_supervisor(db: Session, supervisor_id: int) -> Usuario:
    supervisor = db.query(Usuario).filter(Usuario.id == supervisor_id).first()
    if not supervisor or not is_supervisor(supervisor) or not supervisor.activo:
        raise HTTPException(
            status_code=422,
            detail="Selecciona un supervisor activo para el grupo",
        )
    return supervisor


def _validar_miembros(db: Session, miembro_ids: list[int]) -> list[Usuario]:
    if len(miembro_ids) != len(set(miembro_ids)):
        raise HTTPException(status_code=422, detail="No repitas encargados en el grupo")
    if not miembro_ids:
        return []
    usuarios = db.query(Usuario).filter(Usuario.id.in_(miembro_ids)).all()
    por_id = {usuario.id: usuario for usuario in usuarios}
    faltantes = set(miembro_ids) - set(por_id)
    if faltantes:
        raise HTTPException(status_code=404, detail="Uno o más encargados no existen")
    for usuario in usuarios:
        if not is_encargado(usuario) or not usuario.activo:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Solo se pueden agregar encargados activos al grupo: "
                    f"{usuario.nombre_completo or usuario.username}"
                ),
            )
    return [por_id[miembro_id] for miembro_id in miembro_ids]


def _nombre_disponible(
    db: Session, nombre: str, excluir_id: int | None = None
) -> None:
    query = db.query(GrupoTrabajo).filter(
        func.lower(GrupoTrabajo.nombre) == nombre.strip().lower()
    )
    if excluir_id is not None:
        query = query.filter(GrupoTrabajo.id != excluir_id)
    if query.first():
        raise HTTPException(
            status_code=409, detail="Ya existe un grupo de trabajo con ese nombre"
        )


def _guardar_miembros(
    db: Session, grupo: GrupoTrabajo, miembros: list[Usuario]
) -> None:
    db.query(GrupoMiembro).filter(
        GrupoMiembro.grupo_id == grupo.id
    ).delete(synchronize_session=False)
    db.add_all(
        GrupoMiembro(grupo_id=grupo.id, usuario_id=miembro.id)
        for miembro in miembros
    )


@router.get("/")
def listar_grupos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    query = db.query(GrupoTrabajo).options(
        joinedload(GrupoTrabajo.supervisor),
        joinedload(GrupoTrabajo.miembros),
    )
    if not is_admin(current_user):
        if is_supervisor(current_user):
            query = query.filter(GrupoTrabajo.supervisor_id == current_user.id)
        else:
            query = query.filter(
                GrupoTrabajo.miembros.any(Usuario.id == current_user.id)
            )
    grupos = query.order_by(
        GrupoTrabajo.activo.desc(), GrupoTrabajo.nombre
    ).all()
    return _serializar_muchos(db, grupos)


@router.get("/{grupo_id}")
def obtener_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    grupo = _cargar_grupo(db, grupo_id)
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if not _puede_ver(db, current_user, grupo):
        raise HTTPException(status_code=403, detail="No tienes acceso a este grupo")
    return _serializar(db, grupo)


@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_grupo(
    payload: GrupoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    nombre = payload.nombre.strip()
    if not nombre:
        raise HTTPException(
            status_code=422, detail="El nombre del grupo es obligatorio"
        )
    _nombre_disponible(db, nombre)
    _validar_supervisor(db, payload.supervisor_id)
    miembros = _validar_miembros(db, payload.miembros)

    grupo = GrupoTrabajo(
        nombre=nombre,
        descripcion=(payload.descripcion or "").strip() or None,
        supervisor_id=payload.supervisor_id,
        color=payload.color,
        activo=payload.activo,
    )
    db.add(grupo)
    db.flush()
    _guardar_miembros(db, grupo, miembros)

    notificar_usuarios(
        db,
        [payload.supervisor_id] + [miembro.id for miembro in miembros],
        "equipo",
        "Nuevo grupo de trabajo",
        f"Fuiste asignado al grupo {nombre}.",
        "importante",
        "../pages/equipo.html",
        "grupo",
        grupo.id,
    )
    db.commit()
    grupo = _cargar_grupo(db, grupo.id)
    return _serializar(db, grupo)


@router.put("/{grupo_id}")
def actualizar_grupo(
    grupo_id: int,
    payload: GrupoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    grupo = _cargar_grupo(db, grupo_id)
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")

    cambios = payload.model_dump(exclude_unset=True)
    supervisor_anterior = grupo.supervisor_id
    miembros_anteriores = {miembro.id for miembro in grupo.miembros}

    if "nombre" in cambios and cambios["nombre"] is not None:
        nombre = cambios["nombre"].strip()
        if not nombre:
            raise HTTPException(
                status_code=422, detail="El nombre del grupo es obligatorio"
            )
        _nombre_disponible(db, nombre, excluir_id=grupo.id)
        grupo.nombre = nombre
    if "descripcion" in cambios:
        grupo.descripcion = (cambios["descripcion"] or "").strip() or None
    if "supervisor_id" in cambios and cambios["supervisor_id"] is not None:
        _validar_supervisor(db, cambios["supervisor_id"])
        grupo.supervisor_id = cambios["supervisor_id"]
    if "color" in cambios and cambios["color"] is not None:
        grupo.color = cambios["color"]
    if "activo" in cambios and cambios["activo"] is not None:
        grupo.activo = cambios["activo"]

    miembros = None
    if cambios.get("miembros") is not None:
        miembros = _validar_miembros(db, cambios["miembros"])
        _guardar_miembros(db, grupo, miembros)

    nuevos_miembros = (
        {miembro.id for miembro in miembros} - miembros_anteriores
        if miembros is not None else set()
    )
    retirados = (
        miembros_anteriores - {miembro.id for miembro in miembros}
        if miembros is not None else set()
    )
    if nuevos_miembros:
        notificar_usuarios(
            db,
            nuevos_miembros,
            "equipo",
            "Nuevo grupo de trabajo",
            f"Fuiste agregado al grupo {grupo.nombre}.",
            "importante",
            "../pages/equipo.html",
            "grupo",
            grupo.id,
        )
    if retirados:
        notificar_usuarios(
            db,
            retirados,
            "equipo",
            "Grupo de trabajo actualizado",
            f"Fuiste retirado del grupo {grupo.nombre}.",
            "info",
            "../pages/equipo.html",
            "grupo",
            grupo.id,
        )
    if (
        nuevos_miembros
        or retirados
        or grupo.supervisor_id != supervisor_anterior
    ):
        notificar_usuarios(
            db,
            [grupo.supervisor_id],
            "equipo",
            "Grupo de trabajo actualizado",
            f"El grupo {grupo.nombre} fue actualizado.",
            "info",
            "../pages/equipo.html",
            "grupo",
            grupo.id,
        )

    db.commit()
    grupo = _cargar_grupo(db, grupo.id)
    return _serializar(db, grupo)


@router.delete("/{grupo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    grupo = _cargar_grupo(db, grupo_id)
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    destinos = [grupo.supervisor_id] + [miembro.id for miembro in grupo.miembros]
    nombre = grupo.nombre
    notificar_usuarios(
        db,
        destinos,
        "equipo",
        "Grupo de trabajo eliminado",
        f"El grupo {nombre} fue eliminado por un administrador.",
        "info",
        "../pages/equipo.html",
        "grupo",
        grupo.id,
    )
    db.delete(grupo)
    db.commit()
    return None
