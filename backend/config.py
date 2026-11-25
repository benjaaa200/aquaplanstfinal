"""Configuration for the canonical FastAPI and PostgreSQL backend."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", 5432)),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "postgres")
}

DATABASE_URL_ENV = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL_ENV and (not DB_CONFIG["user"] or not DB_CONFIG["password"]):
    raise RuntimeError(
        "Configura DATABASE_URL o DB_USER y DB_PASSWORD en el entorno/.env."
    )

# TLS hacia PostgreSQL. RDS exige al menos "require"; en local/Docker sin TLS
# usa "disable". Valores válidos: disable, allow, prefer, require, verify-ca,
# verify-full.
DB_SSLMODE = (os.getenv("DB_SSLMODE", "require").strip().lower() or "require")
if DB_SSLMODE not in {
    "disable", "allow", "prefer", "require", "verify-ca", "verify-full"
}:
    raise RuntimeError(
        "DB_SSLMODE debe ser disable, allow, prefer, require, verify-ca o "
        "verify-full."
    )
# Ruta al certificado de la CA (por ejemplo, el bundle de RDS) para verify-ca
# o verify-full. Opcional.
DB_SSLROOTCERT = os.getenv("DB_SSLROOTCERT", "").strip()

# Evita ejecutar DDL automático al arrancar cuando la base ya está gestionada.
SKIP_INIT_DB = os.getenv("SKIP_INIT_DB", "0").lower() in (
    "1", "true", "yes", "on"
)

SECRET_KEY = os.getenv("SECRET_KEY", "")
if len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY debe configurarse y contener al menos 32 caracteres."
    )

try:
    ACCESS_TOKEN_EXPIRE_MINUTES = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    )
except ValueError as exc:
    raise RuntimeError(
        "ACCESS_TOKEN_EXPIRE_MINUTES debe ser un número entero."
    ) from exc

if not 5 <= ACCESS_TOKEN_EXPIRE_MINUTES <= 60 * 24:
    raise RuntimeError(
        "ACCESS_TOKEN_EXPIRE_MINUTES debe estar entre 5 y 1440 minutos."
    )

# ============================================
# LÍMITE DE INTENTOS DE INICIO DE SESIÓN
# ============================================
LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_IP_MAX_ATTEMPTS = int(os.getenv("LOGIN_IP_MAX_ATTEMPTS", "100"))
LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "300"))

if LOGIN_MAX_ATTEMPTS < 1 or LOGIN_IP_MAX_ATTEMPTS < 1 or LOGIN_WINDOW_SECONDS < 1:
    raise RuntimeError(
        "LOGIN_MAX_ATTEMPTS, LOGIN_IP_MAX_ATTEMPTS y LOGIN_WINDOW_SECONDS "
        "deben ser enteros positivos."
    )

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500"
    ).split(",")
    if origin.strip()
]

if not CORS_ORIGINS or "*" in CORS_ORIGINS:
    raise RuntimeError("CORS_ORIGINS debe incluir orígenes explícitos, no '*'.")

# Segundos de espera al comprobar la conexión TCP de un dispositivo IoT.
try:
    DEVICE_CONNECT_TIMEOUT = float(os.getenv("DEVICE_CONNECT_TIMEOUT", "2.0"))
except ValueError as exc:
    raise RuntimeError(
        "DEVICE_CONNECT_TIMEOUT debe ser un número (segundos)."
    ) from exc

if not 0.2 <= DEVICE_CONNECT_TIMEOUT <= 10:
    raise RuntimeError(
        "DEVICE_CONNECT_TIMEOUT debe estar entre 0.2 y 10 segundos."
    )

DATABASE_QUERY = {
    "sslmode": DB_SSLMODE,
    "options": "-c timezone=UTC",
}
if DB_SSLROOTCERT:
    DATABASE_QUERY["sslrootcert"] = DB_SSLROOTCERT

if DATABASE_URL_ENV:
    parsed_url = make_url(DATABASE_URL_ENV)
    if not all((
        parsed_url.host,
        parsed_url.username,
        parsed_url.password,
        parsed_url.database,
    )):
        raise RuntimeError(
            "DATABASE_URL debe incluir host, usuario, contraseña y base de datos."
        )
    render_query = dict(parsed_url.query or {})
    render_query.update(DATABASE_QUERY)
    if DB_SSLROOTCERT:
        render_query["sslrootcert"] = DB_SSLROOTCERT
    DATABASE_URL = parsed_url.set(
        drivername="postgresql+psycopg", query=render_query
    )
else:
    DATABASE_URL = URL.create(
        "postgresql+psycopg",
        username=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        host=DB_CONFIG["host"],
        port=DB_CONFIG["port"],
        database=DB_CONFIG["database"],
        query=DATABASE_QUERY,
    )

# ============================================
# RECUPERACIÓN DE CONTRASEÑA
# ============================================
PASSWORD_RESET_CODE_MINUTES = int(os.getenv("PASSWORD_RESET_CODE_MINUTES", "10"))
PASSWORD_RESET_TOKEN_MINUTES = int(os.getenv("PASSWORD_RESET_TOKEN_MINUTES", "15"))
PASSWORD_RESET_LINK_MINUTES = int(os.getenv("PASSWORD_RESET_LINK_MINUTES", "15"))
PASSWORD_RESET_MAX_ATTEMPTS = int(os.getenv("PASSWORD_RESET_MAX_ATTEMPTS", "5"))
# Base del frontend usada para construir el enlace mágico de recuperación.
FRONTEND_URL = os.getenv("FRONTEND_URL", CORS_ORIGINS[0]).rstrip("/")
# Solo para desarrollo: devuelve el código en la respuesta si no hay SMTP/Twilio.
PASSWORD_RESET_DEV_MODE = os.getenv("PASSWORD_RESET_DEV_MODE", "0").lower() in (
    "1", "true", "yes", "on"
)

# SMTP (correo saliente). Si falta configuración, el código se escribe en el log.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_TLS = os.getenv("SMTP_TLS", "1").lower() in ("1", "true", "yes", "on")

# Twilio (SMS). Si falta configuración, se usa el correo o el log.
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.getenv("TWILIO_FROM", "")