"""
AquaPlants - Router de Autenticación
Endpoint de login con validación de credenciales y generación de JWT.
"""
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta
from urllib.parse import quote

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.cache import (
    login_identifier_limiter,
    login_ip_limiter,
    reset_identifier_limiter,
    reset_ip_limiter,
    reset_link_ip_limiter,
)
from backend.config import (
    FRONTEND_URL,
    LOGIN_WINDOW_SECONDS,
    PASSWORD_RESET_CODE_MINUTES,
    PASSWORD_RESET_LINK_MINUTES,
    PASSWORD_RESET_MAX_ATTEMPTS,
    PASSWORD_RESET_TOKEN_MINUTES,
    SECRET_KEY,
)
from backend.database import get_db
from backend.entrega import (
    elegir_canal,
    enviar_codigo,
    enviar_enlace,
    modo_desarrollo_activo,
)
from backend.models import PasswordResetToken, Usuario
from backend.schemas import (
    ForgotPasswordRequest,
    PasswordChange,
    ProfileUpdate,
    ResetPasswordRequest,
    VerifyResetCodeRequest,
    VerifyResetLinkRequest,
)
from backend.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    decode_token,
    get_current_active_user,
    get_password_hash,
    verify_password,
)
from backend.utils import utcnow

router = APIRouter(prefix="/auth", tags=["Autenticación"])
logger = logging.getLogger(__name__)

# Hash de referencia para igualar el tiempo de respuesta cuando el usuario no
# existe, evitando filtrar qué cuentas están registradas por temporización.
_DUMMY_PASSWORD_HASH = get_password_hash("aquaplants-dummy-password")

_RECOVERY_MESSAGE = (
    "Si los datos coinciden con una cuenta, enviamos un código a su "
    "cuenta de respaldo."
)
_RECOVERY_ERROR = "Código inválido o expirado"
_LINK_ERROR = "Enlace inválido o expirado"


def _buscar_usuario(db: Session, identificador: str) -> Usuario | None:
    ident = identificador.strip()
    return db.query(Usuario).filter(
        (Usuario.username == ident)
        | (Usuario.email == ident)
        | (Usuario.email_respaldo == ident)
    ).first()


def _hash_codigo(codigo: str) -> str:
    return hashlib.sha256(f"{SECRET_KEY}:{codigo}".encode("utf-8")).hexdigest()


def _nuevo_codigo() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


def _nuevo_enlace_token() -> str:
    return secrets.token_urlsafe(32)


def _construir_enlace(token_id: int, token: str) -> str:
    base = FRONTEND_URL
    if not base.lower().endswith((".html", ".htm")):
        base = f"{base}/index.html"
    return f"{base}?reset_token={token_id}.{quote(token, safe='')}"


def _emitir_reset_token(user: Usuario) -> str:
    return create_access_token(
        data={
            "sub": user.username,
            "scope": "password_reset",
            "ver": user.token_version or 0,
        },
        expires_delta=timedelta(minutes=PASSWORD_RESET_TOKEN_MINUTES),
    )


def _token_response(user: Usuario) -> dict:
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": user.username,
            "role": user.rol,
            "name": user.nombre_completo,
            "ver": user.token_version or 0,
        },
        expires_delta=access_token_expires,
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "role": user.rol,
            "name": user.nombre_completo,
        },
    }


@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    """
    HU-01: Endpoint de login que valida credenciales y retorna JWT.

    Los intentos fallidos se limitan por identificador (usuario/IP) y por IP
    para frenar ataques de fuerza bruta y pulverización de credenciales.
    """
    ip = request.client.host if request.client else "desconocida"
    identifier_key = f"{ip}:{form_data.username.strip().lower()}"

    if not login_ip_limiter.allow(ip) or not login_identifier_limiter.allow(
        identifier_key
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Demasiados intentos de inicio de sesión. "
                "Intenta nuevamente más tarde."
            ),
            headers={"Retry-After": str(LOGIN_WINDOW_SECONDS)},
        )

    # Buscar usuario por username O email
    user = db.query(Usuario).filter(
        (Usuario.username == form_data.username) | 
        (Usuario.email == form_data.username)
    ).first()

    # Validar credenciales (mensaje genérico por seguridad)
    if not user:
        verify_password(form_data.password, _DUMMY_PASSWORD_HASH)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verificar que el usuario esté activo
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado. Contacta al administrador."
        )

    # Un inicio de sesión correcto limpia el contador del identificador.
    login_identifier_limiter.reset(identifier_key)

    # Actualizar último acceso
    user.ultimo_acceso = utcnow()
    db.commit()

    return _token_response(user)


def _profile_payload(user: Usuario) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "email_respaldo": user.email_respaldo,
        "telefono_respaldo": user.telefono_respaldo,
        "nombre_completo": user.nombre_completo,
        "rol": user.rol,
        "activo": user.activo,
        "fecha_creacion": user.fecha_creacion,
        "ultimo_acceso": user.ultimo_acceso,
    }


@router.get("/me")
def read_current_user(
    current_user: Usuario = Depends(get_current_active_user),
):
    """Devuelve el perfil del usuario autenticado."""
    return _profile_payload(current_user)


@router.put("/me")
def update_current_user(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    """Permite que el usuario autenticado actualice sus datos personales."""
    provided = payload.model_fields_set

    if "nombre_completo" in provided and payload.nombre_completo is not None:
        current_user.nombre_completo = payload.nombre_completo.strip()

    if "email" in provided and payload.email is not None:
        email = str(payload.email)
        if email != current_user.email:
            if db.query(Usuario.id).filter(
                Usuario.email == email,
                Usuario.id != current_user.id,
            ).first():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="El email ya está registrado",
                )
            current_user.email = email

    if "email_respaldo" in provided:
        if payload.email_respaldo is None:
            current_user.email_respaldo = None
        else:
            respaldo = str(payload.email_respaldo)
            if respaldo != current_user.email_respaldo and db.query(Usuario.id).filter(
                Usuario.email_respaldo == respaldo,
                Usuario.id != current_user.id,
            ).first():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="El email de respaldo ya está registrado",
                )
            current_user.email_respaldo = respaldo

    if "telefono_respaldo" in provided:
        telefono = (payload.telefono_respaldo or "").strip()
        current_user.telefono_respaldo = telefono or None

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El email o el email de respaldo ya está registrado",
        )
    db.refresh(current_user)
    return _profile_payload(current_user)


@router.put("/change-password")
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user),
):
    """Permite que el usuario autenticado cambie su propia contraseña."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta",
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser diferente a la actual",
        )

    current_user.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    return {"message": "Contraseña actualizada correctamente"}


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Send a recovery code or a magic link to the user's backup contact.

    The response is always generic to avoid revealing whether an account exists.
    """
    identificador = payload.identificador.strip()
    ip = request.client.host if request.client else "desconocida"

    if not reset_ip_limiter.allow(ip):
        return {"message": _RECOVERY_MESSAGE}
    if not reset_identifier_limiter.allow(f"{ip}:{identificador.lower()}"):
        return {"message": _RECOVERY_MESSAGE}

    user = _buscar_usuario(db, identificador)
    if not user or not user.activo:
        return {"message": _RECOVERY_MESSAGE}

    if payload.metodo == "link":
        return _solicitar_enlace(db, user)

    canal = elegir_canal(user)
    if not canal:
        logger.warning("Usuario %s sin cuenta de respaldo configurada", user.id)
        return {"message": _RECOVERY_MESSAGE}

    codigo = _nuevo_codigo()
    expira = utcnow() + timedelta(minutes=PASSWORD_RESET_CODE_MINUTES)

    db.query(PasswordResetToken).filter(
        PasswordResetToken.usuario_id == user.id,
        PasswordResetToken.tipo == "codigo",
        PasswordResetToken.usado.is_(False),
    ).update({PasswordResetToken.usado: True}, synchronize_session=False)
    db.add(
        PasswordResetToken(
            usuario_id=user.id,
            codigo_hash=_hash_codigo(codigo),
            canal=canal,
            tipo="codigo",
            expira=expira,
        )
    )
    db.commit()

    enviado = False
    try:
        enviado = enviar_codigo(user, codigo, canal)
    except Exception:  # pragma: no cover - depende del proveedor externo
        logger.exception("Error enviando el código de recuperación")

    respuesta = {"message": _RECOVERY_MESSAGE}
    if modo_desarrollo_activo():
        logger.warning(
            "PASSWORD_RESET_DEV_MODE activo: código %s para %s (%s)",
            codigo,
            user.username,
            canal,
        )
        respuesta.update(
            {
                "dev_code": codigo,
                "canal": canal,
                "expires_in": PASSWORD_RESET_CODE_MINUTES * 60,
                "enviado": bool(enviado),
            }
        )
    return respuesta


def _solicitar_enlace(db: Session, user: Usuario) -> dict:
    """Generate and deliver a single-use magic link for password recovery."""
    email = user.email_respaldo or user.email
    if not email:
        logger.warning("Usuario %s sin correo de respaldo configurado", user.id)
        return {"message": _RECOVERY_MESSAGE}
    canal = "email"

    token = _nuevo_enlace_token()
    expira = utcnow() + timedelta(minutes=PASSWORD_RESET_LINK_MINUTES)

    db.query(PasswordResetToken).filter(
        PasswordResetToken.usuario_id == user.id,
        PasswordResetToken.tipo == "link",
        PasswordResetToken.usado.is_(False),
    ).update({PasswordResetToken.usado: True}, synchronize_session=False)
    registro = PasswordResetToken(
        usuario_id=user.id,
        codigo_hash=_hash_codigo(token),
        canal=canal,
        tipo="link",
        expira=expira,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    enlace = _construir_enlace(registro.id, token)
    enviado = False
    try:
        enviado = enviar_enlace(user, enlace, canal)
    except Exception:  # pragma: no cover - depende del proveedor externo
        logger.exception("Error enviando el enlace de recuperación")

    respuesta = {"message": _RECOVERY_MESSAGE}
    if modo_desarrollo_activo():
        logger.warning(
            "PASSWORD_RESET_DEV_MODE activo: enlace para %s: %s",
            user.username,
            enlace,
        )
        respuesta.update(
            {
                "dev_link": enlace,
                "canal": canal,
                "expires_in": PASSWORD_RESET_LINK_MINUTES * 60,
                "enviado": bool(enviado),
            }
        )
    return respuesta


@router.post("/verify-reset-code")
def verify_reset_code(
    payload: VerifyResetCodeRequest,
    db: Session = Depends(get_db),
):
    """Validate the 6-digit code and return a short-lived reset token."""
    error = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_RECOVERY_ERROR)
    user = _buscar_usuario(db, payload.identificador)
    if not user or not user.activo:
        raise error

    token = db.query(PasswordResetToken).filter(
        PasswordResetToken.usuario_id == user.id,
        PasswordResetToken.tipo == "codigo",
        PasswordResetToken.usado.is_(False),
    ).order_by(PasswordResetToken.id.desc()).first()

    if not token or token.expira <= utcnow():
        raise error
    if token.intentos >= PASSWORD_RESET_MAX_ATTEMPTS:
        raise error

    if not hmac.compare_digest(token.codigo_hash, _hash_codigo(payload.codigo)):
        token.intentos += 1
        db.commit()
        raise error

    token.usado = True
    db.commit()

    return {
        "reset_token": _emitir_reset_token(user),
        "expires_in": PASSWORD_RESET_TOKEN_MINUTES * 60,
    }


@router.post("/verify-reset-link")
def verify_reset_link(
    payload: VerifyResetLinkRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Exchange a valid magic-link token for a short-lived reset token."""
    error = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST, detail=_LINK_ERROR
    )
    ip = request.client.host if request.client else "desconocida"
    if not reset_link_ip_limiter.allow(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas solicitudes. Intenta más tarde.",
        )

    token_id, _, raw_token = payload.reset_token.partition(".")
    if not token_id.isdigit() or not raw_token:
        raise error

    token = db.query(PasswordResetToken).filter(
        PasswordResetToken.id == int(token_id),
        PasswordResetToken.tipo == "link",
        PasswordResetToken.usado.is_(False),
    ).first()
    if not token or token.expira <= utcnow():
        raise error

    user = db.query(Usuario).filter(Usuario.id == token.usuario_id).first()
    if not user or not user.activo:
        raise error
    if not hmac.compare_digest(token.codigo_hash, _hash_codigo(raw_token)):
        token.intentos += 1
        db.commit()
        raise error

    token.usado = True
    db.commit()

    return {
        "reset_token": _emitir_reset_token(user),
        "expires_in": PASSWORD_RESET_TOKEN_MINUTES * 60,
    }


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Set a new password using a previously verified reset token."""
    error = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Token de recuperación inválido o expirado",
    )
    try:
        data = decode_token(payload.reset_token)
    except jwt.PyJWTError:
        raise error

    if data.get("scope") != "password_reset":
        raise error

    user = db.query(Usuario).filter(Usuario.username == data.get("sub")).first()
    if not user or not user.activo:
        raise error
    if int(data.get("ver", 0)) != int(user.token_version or 0):
        raise error
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser diferente a la anterior",
        )

    user.hashed_password = get_password_hash(payload.new_password)
    user.token_version = (user.token_version or 0) + 1
    db.query(PasswordResetToken).filter(
        PasswordResetToken.usuario_id == user.id,
        PasswordResetToken.usado.is_(False),
    ).update({PasswordResetToken.usado: True}, synchronize_session=False)
    db.commit()

    return {
        "message": "Contraseña actualizada. Inicia sesión con tu nueva contraseña."
    }
