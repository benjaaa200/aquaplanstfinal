from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, EmailStr, Field
from typing import Literal, Optional
from backend.database import get_db
from backend.models import (
    Cultivo,
    Instalacion,
    ReporteGenerado,
    Usuario,
    UsuarioCultivo,
)
from backend.schemas import UsuarioUpdate
from backend.security import get_password_hash, is_admin, require_admin

router = APIRouter(prefix="/usuarios", tags=["Gestión de Usuarios"])


@router.get("/encargados")
def listar_encargados(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    users = db.query(Usuario).filter(
        Usuario.rol == "encargado",
        Usuario.activo.is_(True),
    ).order_by(Usuario.nombre_completo).all()
    return [
        {"id": user.id, "nombre_completo": user.nombre_completo or user.username}
        for user in users
    ]

class UsuarioCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: EmailStr
    email_respaldo: Optional[EmailStr] = None
    telefono_respaldo: Optional[str] = Field(default=None, max_length=32)
    nombre_completo: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=12, max_length=128)
    rol: Literal["admin", "administrador", "supervisor", "encargado"]


class UsuarioCultivosUpdate(BaseModel):
    cultivo_ids: list[int] = Field(default_factory=list)


@router.get("/")
def get_usuarios(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    usuarios = db.query(Usuario).order_by(Usuario.id).all()
    return [{
        "id": u.id, 
        "username": u.username, 
        "email": u.email, 
        "email_respaldo": u.email_respaldo,
        "telefono_respaldo": u.telefono_respaldo,
        "nombre_completo": u.nombre_completo, 
        "rol": u.rol, 
        "activo": u.activo
    } for u in usuarios]


@router.get("/{usuario_id}/cultivos")
def get_usuario_cultivos(
    usuario_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario.rol != "encargado":
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden asignar cultivos a encargados"
        )

    assigned_ids = db.query(UsuarioCultivo.cultivo_id).filter(
        UsuarioCultivo.usuario_id == usuario_id
    ).order_by(UsuarioCultivo.cultivo_id).all()
    return {"usuario_id": usuario_id, "cultivo_ids": [row[0] for row in assigned_ids]}


@router.put("/{usuario_id}/cultivos")
def update_usuario_cultivos(
    usuario_id: int,
    assignment: UsuarioCultivosUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario.rol != "encargado":
        raise HTTPException(
            status_code=409,
            detail="Solo se pueden asignar cultivos a encargados"
        )

    cultivo_ids = assignment.cultivo_ids
    if len(cultivo_ids) != len(set(cultivo_ids)):
        raise HTTPException(status_code=422, detail="No repitas IDs de cultivos")

    if cultivo_ids:
        existing_ids = {
            row[0] for row in db.query(Cultivo.id).filter(
                Cultivo.id.in_(cultivo_ids)
            ).all()
        }
        if existing_ids != set(cultivo_ids):
            raise HTTPException(status_code=404, detail="Uno o más cultivos no existen")

    db.query(UsuarioCultivo).filter(
        UsuarioCultivo.usuario_id == usuario_id
    ).delete(synchronize_session=False)
    db.add_all(
        UsuarioCultivo(usuario_id=usuario_id, cultivo_id=cultivo_id)
        for cultivo_id in cultivo_ids
    )
    db.commit()
    return {"usuario_id": usuario_id, "cultivo_ids": cultivo_ids}


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_usuario(
    usuario: UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    existing_user = db.query(Usuario).filter(
        (Usuario.username == usuario.username) |
        (Usuario.email == str(usuario.email))
    ).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="El usuario o email ya existe")

    if usuario.email_respaldo and db.query(Usuario.id).filter(
        Usuario.email_respaldo == str(usuario.email_respaldo)
    ).first():
        raise HTTPException(
            status_code=409, detail="El email de respaldo ya está registrado"
        )
    
    hashed_password = get_password_hash(usuario.password)
    
    nuevo_usuario = Usuario(
        username=usuario.username,
        email=usuario.email,
        email_respaldo=str(usuario.email_respaldo) if usuario.email_respaldo else None,
        telefono_respaldo=usuario.telefono_respaldo,
        nombre_completo=usuario.nombre_completo,
        hashed_password=hashed_password,
        rol="administrador" if usuario.rol == "admin" else usuario.rol,
        activo=True
    )
    db.add(nuevo_usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="El usuario o email ya existe")
    db.refresh(nuevo_usuario)
    return {"message": "Usuario creado exitosamente", "user_id": nuevo_usuario.id}


@router.put("/{usuario_id}")
def update_usuario(
    usuario_id: int,
    datos: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if usuario.id == current_user.id and datos.activo is False:
        raise HTTPException(
            status_code=422, detail="No puedes desactivar tu propio usuario"
        )

    if datos.username and datos.username != usuario.username:
        if db.query(Usuario.id).filter(Usuario.username == datos.username).first():
            raise HTTPException(status_code=409, detail="El nombre de usuario ya existe")
        usuario.username = datos.username

    if datos.email and str(datos.email) != usuario.email:
        if db.query(Usuario.id).filter(Usuario.email == str(datos.email)).first():
            raise HTTPException(status_code=409, detail="El email ya está registrado")
        usuario.email = str(datos.email)

    if datos.email_respaldo is not None:
        respaldo = str(datos.email_respaldo)
        if respaldo != usuario.email_respaldo and db.query(Usuario.id).filter(
            Usuario.email_respaldo == respaldo
        ).first():
            raise HTTPException(
                status_code=409, detail="El email de respaldo ya está registrado"
            )
        usuario.email_respaldo = respaldo
    if datos.telefono_respaldo is not None:
        usuario.telefono_respaldo = datos.telefono_respaldo.strip() or None

    nuevo_rol = "administrador" if datos.rol == "admin" else datos.rol
    rol_actual_admin = (usuario.rol or "").lower() in ("admin", "administrador")
    if (
        rol_actual_admin
        and usuario.activo
        and (
            (nuevo_rol is not None and nuevo_rol not in ("admin", "administrador"))
            or datos.activo is False
        )
    ):
        admins_activos = db.query(Usuario).filter(
            Usuario.rol.in_(("admin", "administrador")),
            Usuario.activo.is_(True),
        ).count()
        if admins_activos <= 1:
            raise HTTPException(
                status_code=422,
                detail="No se puede degradar o desactivar al último administrador activo",
            )

    if datos.nombre_completo is not None:
        usuario.nombre_completo = datos.nombre_completo
    if datos.rol is not None:
        usuario.rol = nuevo_rol
    if datos.activo is not None:
        usuario.activo = datos.activo
    if datos.password:
        usuario.hashed_password = get_password_hash(datos.password)
        usuario.token_version = (usuario.token_version or 0) + 1

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="El usuario o email ya existe")
    db.refresh(usuario)
    return {
        "id": usuario.id,
        "username": usuario.username,
        "email": usuario.email,
        "email_respaldo": usuario.email_respaldo,
        "telefono_respaldo": usuario.telefono_respaldo,
        "nombre_completo": usuario.nombre_completo,
        "rol": usuario.rol,
        "activo": usuario.activo,
    }


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario.id == current_user.id:
        raise HTTPException(status_code=422, detail="No puedes eliminar tu propio usuario")

    if is_admin(usuario):
        admin_count = db.query(Usuario).filter(
            Usuario.rol.in_(("admin", "administrador")),
            Usuario.activo.is_(True),
        ).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=422,
                detail="No se puede eliminar al último administrador activo",
            )

    db.query(UsuarioCultivo).filter(
        UsuarioCultivo.usuario_id == usuario_id
    ).delete(synchronize_session=False)
    db.query(ReporteGenerado).filter(
        ReporteGenerado.usuario_id == usuario_id
    ).delete(synchronize_session=False)
    db.query(Instalacion).filter(
        Instalacion.responsable_id == usuario_id
    ).update({Instalacion.responsable_id: None}, synchronize_session=False)
    db.delete(usuario)
    db.commit()
    return None