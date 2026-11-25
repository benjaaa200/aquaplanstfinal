"""
AquaPlants - Esquemas de Pydantic para validación de datos
Define la estructura de los datos que entran y salen de la API.
"""
import ipaddress
import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Literal
from typing import Optional
from datetime import datetime

from backend.config import LOGIN_MAX_ATTEMPTS

_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$"
)


def _normalizar_direccion_ip(value: Optional[str]) -> Optional[str]:
    """Accept an IPv4/IPv6 address or a simple hostname, or None."""
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    try:
        ipaddress.ip_address(value)
        return value
    except ValueError:
        pass
    if _HOSTNAME_RE.match(value):
        return value.lower()
    raise ValueError("Debe ser una dirección IP o un host válido")

# ==========================================
# USUARIOS
# ==========================================
class UsuarioBase(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    nombre_completo: Optional[str] = Field(default=None, max_length=255)
    email_respaldo: Optional[EmailStr] = None
    telefono_respaldo: Optional[str] = Field(default=None, max_length=32)
    rol: str = "encargado"
    activo: bool = True
    intentos_login_maximos: int = Field(
        default=LOGIN_MAX_ATTEMPTS, ge=1, le=100
    )

class UsuarioCreate(UsuarioBase):
    password: str = Field(min_length=12, max_length=128)
    nombre_completo: str = Field(min_length=1, max_length=255)
    rol: Literal["admin", "administrador", "supervisor", "encargado"] = "encargado"

class UsuarioUpdate(BaseModel):
    email: Optional[EmailStr] = None
    email_respaldo: Optional[EmailStr] = None
    telefono_respaldo: Optional[str] = Field(default=None, max_length=32)
    username: Optional[str] = Field(default=None, min_length=3, max_length=100)
    nombre_completo: Optional[str] = Field(default=None, min_length=1, max_length=255)
    rol: Optional[Literal["admin", "administrador", "supervisor", "encargado"]] = None
    activo: Optional[bool] = None
    intentos_login_maximos: Optional[int] = Field(default=None, ge=1, le=100)
    password: Optional[str] = Field(default=None, min_length=12, max_length=128)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class ProfileUpdate(BaseModel):
    nombre_completo: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    email_respaldo: Optional[EmailStr] = None
    telefono_respaldo: Optional[str] = Field(default=None, max_length=32)


class ForgotPasswordRequest(BaseModel):
    identificador: str = Field(min_length=3, max_length=255)
    metodo: Literal["codigo", "link"] = "codigo"


class VerifyResetCodeRequest(BaseModel):
    identificador: str = Field(min_length=3, max_length=255)
    codigo: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyResetLinkRequest(BaseModel):
    reset_token: str = Field(min_length=20, max_length=512)


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(min_length=20)
    new_password: str = Field(min_length=12, max_length=128)


class UsuarioResponse(UsuarioBase):
    id: int
    email_respaldo: Optional[EmailStr] = None
    telefono_respaldo: Optional[str] = None
    activo: bool
    fecha_creacion: datetime

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# CULTIVOS
# ==========================================
class CultivoBase(BaseModel):
    nombre: str
    ubicacion: Optional[str] = None
    tipo_planta: Optional[str] = None
    estado: str = "activo"
    area_m2: Optional[float] = None
    instalacion_id: Optional[int] = Field(default=None, gt=0)

class CultivoCreate(CultivoBase):
    fecha_inicio: datetime

class CultivoUpdate(BaseModel):
    nombre: Optional[str] = None
    ubicacion: Optional[str] = None
    tipo_planta: Optional[str] = None
    estado: Optional[str] = None
    area_m2: Optional[float] = None
    instalacion_id: Optional[int] = Field(default=None, gt=0)

class CultivoResponse(CultivoBase):
    id: int
    fecha_inicio: Optional[datetime] = None
    fecha_creacion: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# MEDICIONES
# ==========================================
class MedicionBase(BaseModel):
    temperatura: float = Field(ge=-50, le=100)
    humedad: float = Field(ge=0, le=100)
    nivel_agua: float = Field(ge=0, le=100)
    ph: Optional[float] = Field(default=None, ge=0, le=14)
    conductividad: Optional[float] = Field(default=None, ge=0, le=100000)

class MedicionCreate(MedicionBase):
    cultivo_id: int
    fecha_hora: Optional[datetime] = None

class MedicionResponse(MedicionBase):
    id: int
    cultivo_id: int
    fecha_hora: datetime
    cultivo_nombre: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# ALERTAS
# ==========================================
class AlertaBase(BaseModel):
    tipo: str
    severidad: str
    mensaje: str
    valor_detectado: Optional[float] = None
    umbral: Optional[float] = None

class AlertaCreate(AlertaBase):
    cultivo_id: int

class AlertaUpdate(BaseModel):
    leida: Optional[bool] = None
    fecha_lectura: Optional[datetime] = None

class AlertaResponse(AlertaBase):
    id: int
    cultivo_id: int
    cultivo_nombre: Optional[str] = None
    leida: bool
    resuelta: bool
    fecha_hora: datetime
    fecha_lectura: Optional[datetime] = None
    fecha_resolucion: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class InstalacionCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=2000)
    ubicacion: Optional[str] = Field(default=None, max_length=255)
    area_m2: Optional[float] = Field(default=None, gt=0)
    responsable_id: Optional[int] = Field(default=None, gt=0)


class InstalacionUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=2000)
    ubicacion: Optional[str] = Field(default=None, max_length=255)
    area_m2: Optional[float] = Field(default=None, gt=0)
    responsable_id: Optional[int] = Field(default=None, gt=0)


class InstalacionStatusUpdate(BaseModel):
    activa: bool


class DispositivoCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=255)
    tipo: Literal["sensor", "actuador", "controlador"]
    modelo: Optional[str] = Field(default=None, max_length=150)
    direccion_mac: Optional[str] = Field(
        default=None, pattern=r"(?i)^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$"
    )
    direccion_ip: Optional[str] = Field(default=None, max_length=253)
    puerto: Optional[int] = Field(default=None, ge=1, le=65535)
    descripcion: Optional[str] = Field(default=None, max_length=2000)
    instalacion_id: Optional[int] = Field(default=None, gt=0)

    @field_validator("direccion_ip")
    @classmethod
    def validar_direccion_ip(cls, value: Optional[str]) -> Optional[str]:
        return _normalizar_direccion_ip(value)


class DispositivoUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=255)
    tipo: Optional[Literal["sensor", "actuador", "controlador"]] = None
    modelo: Optional[str] = Field(default=None, max_length=150)
    direccion_mac: Optional[str] = Field(
        default=None, pattern=r"(?i)^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$"
    )
    direccion_ip: Optional[str] = Field(default=None, max_length=253)
    puerto: Optional[int] = Field(default=None, ge=1, le=65535)
    descripcion: Optional[str] = Field(default=None, max_length=2000)
    instalacion_id: Optional[int] = Field(default=None, gt=0)

    @field_validator("direccion_ip")
    @classmethod
    def validar_direccion_ip(cls, value: Optional[str]) -> Optional[str]:
        return _normalizar_direccion_ip(value)


class DispositivoStatusUpdate(BaseModel):
    estado: str = Field(pattern=r"^(activo|inactivo)$")

# ==========================================
# RIEGOS
# ==========================================
class RiegoBase(BaseModel):
    zona: Optional[str] = None
    tipo: str
    duracion_minutos: Optional[int] = None
    consumo_litros: Optional[float] = None
    estado: str = "completado"

class RiegoCreate(RiegoBase):
    cultivo_id: int
    fecha_inicio: datetime
    fecha_fin: Optional[datetime] = None

class RiegoUpdate(BaseModel):
    estado: Optional[str] = None
    fecha_fin: Optional[datetime] = None

class RiegoResponse(RiegoBase):
    id: int
    cultivo_id: int
    fecha_inicio: datetime
    fecha_fin: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

# ==========================================
# DASHBOARD
# ==========================================
class DashboardKPIsResponse(BaseModel):
    avg_temp: float
    avg_humidity: float
    avg_water: float
    active_alerts: int


# ==========================================
# UMBRALES
# ==========================================
UMBRAL_VARIABLES = (
    "temperatura",
    "humedad",
    "nivel_agua",
    "ph",
    "conductividad",
)


class UmbralBase(BaseModel):
    variable: Literal["temperatura", "humedad", "nivel_agua", "ph", "conductividad"]
    nombre: str = Field(min_length=2, max_length=150)
    unidad: Optional[str] = Field(default=None, max_length=20)
    valor_minimo: Optional[float] = None
    valor_maximo: Optional[float] = None
    valor_alerta: Optional[float] = None
    instalacion_id: Optional[int] = Field(default=None, gt=0)
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    activo: bool = True
    descripcion: Optional[str] = Field(default=None, max_length=2000)


class UmbralCreate(UmbralBase):
    pass


class UmbralUpdate(BaseModel):
    variable: Optional[
        Literal["temperatura", "humedad", "nivel_agua", "ph", "conductividad"]
    ] = None
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=150)
    unidad: Optional[str] = Field(default=None, max_length=20)
    valor_minimo: Optional[float] = None
    valor_maximo: Optional[float] = None
    valor_alerta: Optional[float] = None
    instalacion_id: Optional[int] = Field(default=None, gt=0)
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    activo: Optional[bool] = None
    descripcion: Optional[str] = Field(default=None, max_length=2000)


class UmbralStatusUpdate(BaseModel):
    activo: bool


class UmbralResponse(UmbralBase):
    id: int
    instalacion_nombre: Optional[str] = None
    cultivo_nombre: Optional[str] = None
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# REPORTES
# ==========================================
REPORTE_TIPOS = ("mediciones", "alertas", "riego", "cultivos", "dispositivos")


class ReporteCreate(BaseModel):
    tipo: Literal["mediciones", "alertas", "riego", "cultivos", "dispositivos"]
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    fecha_inicio: datetime
    fecha_fin: datetime
    formato: Literal["csv", "pdf", "excel"] = "csv"
    total_registros: int = Field(default=0, ge=0)
    tamano_bytes: int = Field(default=0, ge=0)


class ReporteUpdate(BaseModel):
    tipo: Optional[
        Literal["mediciones", "alertas", "riego", "cultivos", "dispositivos"]
    ] = None
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    formato: Optional[Literal["csv", "pdf", "excel"]] = None
    total_registros: Optional[int] = Field(default=None, ge=0)
    tamano_bytes: Optional[int] = Field(default=None, ge=0)


class ReporteResponse(ReporteCreate):
    id: int
    usuario_id: int
    usuario_nombre: Optional[str] = None
    cultivo_nombre: Optional[str] = None
    fecha_generacion: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)