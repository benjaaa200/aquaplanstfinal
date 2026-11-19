"""
AquaPlants - Módulo de Seguridad
Manejo de contraseñas (bcrypt) y tokens JWT.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.config import ACCESS_TOKEN_EXPIRE_MINUTES, SECRET_KEY
from backend.models import Usuario, UsuarioCultivo

# ============================================
# CONFIGURACIÓN
# ============================================
ALGORITHM = "HS256"
ADMIN_ROLES = frozenset({"admin", "administrador"})
SUPERVISOR_ROLES = frozenset({"supervisor"})

# ============================================
# HASH DE CONTRASEÑAS (bcrypt)
# ============================================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si una contraseña en texto plano coincide con el hash."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Genera el hash bcrypt de una contraseña."""
    return pwd_context.hash(password)

# ============================================
# JWT - CREACIÓN Y VALIDACIÓN
# ============================================
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Crea un token JWT con los datos proporcionados.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)

    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """Decode a JWT and require the standard claims used across the API."""
    return jwt.decode(
        token,
        SECRET_KEY,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "sub"]},
    )


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas o sesión expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )


def resolve_user_from_payload(payload: dict, db: Session) -> Usuario:
    """Resolve and validate the user referenced by a decoded access token."""
    if payload.get("scope", "access") != "access":
        raise _credentials_exception()

    username = payload.get("sub")
    if not username:
        raise _credentials_exception()

    user = db.query(Usuario).filter(Usuario.username == username).first()
    if user is None:
        raise _credentials_exception()
    if not user.activo:
        raise HTTPException(status_code=403, detail="Usuario desactivado")
    if int(payload.get("ver", 0)) != int(user.token_version or 0):
        raise _credentials_exception()

    return user


def get_current_active_user(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_db)
) -> Usuario:
    """
    Dependencia de FastAPI que valida el token JWT y retorna el usuario activo.
    """
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise _credentials_exception()

    return resolve_user_from_payload(payload, db)


def get_current_user_from_query_token(
    token: str = Query(...),
    db: Session = Depends(get_db),
) -> Usuario:
    """Authenticate EventSource clients, which cannot send custom headers."""
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise _credentials_exception()

    return resolve_user_from_payload(payload, db)


def is_admin(user: Usuario) -> bool:
    """Return whether a user has an administrator role."""
    return (user.rol or "").lower() in ADMIN_ROLES


def require_admin(
    current_user: Usuario = Depends(get_current_active_user)
) -> Usuario:
    """Dependency for endpoints restricted to administrators."""
    if not is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden realizar esta acción"
        )
    return current_user


def visible_cultivo_ids(db: Session, user: Usuario):
    """Return assigned crop IDs for encargados, or None for global readers."""
    if (user.rol or "").lower() in ADMIN_ROLES | SUPERVISOR_ROLES:
        return None

    return db.query(UsuarioCultivo.cultivo_id).filter(
        UsuarioCultivo.usuario_id == user.id
    )


def require_cultivo_access(db: Session, user: Usuario, cultivo_id: int) -> None:
    """Reject access to crops not assigned to an encargado."""
    visible_ids = visible_cultivo_ids(db, user)
    if visible_ids is not None and not db.query(UsuarioCultivo.id).filter(
        UsuarioCultivo.usuario_id == user.id,
        UsuarioCultivo.cultivo_id == cultivo_id
    ).first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a este cultivo"
        )