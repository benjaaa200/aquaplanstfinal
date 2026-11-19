"""Esquemas de validación para los módulos operativos de AquaPlants."""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

CATEGORIAS_INCIDENCIA = (
    "riego",
    "equipos",
    "infraestructura",
    "ambiental",
    "plantas",
    "sensores",
    "otros",
)
ESTADOS_INCIDENCIA = (
    "nueva",
    "pendiente_revision",
    "asignada",
    "en_proceso",
    "resuelta",
    "cerrada",
)
PRIORIDADES = ("baja", "media", "alta", "critica")

CATEGORIAS_TAREA = (
    "mantenimiento",
    "inspeccion",
    "limpieza",
    "riego",
    "control_cultivos",
    "inventario",
    "reparaciones",
    "general",
)
ESTADOS_TAREA = ("pendiente", "en_progreso", "en_revision", "completada", "atrasada", "cancelada")

CATEGORIAS_INVENTARIO = (
    "semillas",
    "nutrientes",
    "fertilizantes",
    "herramientas",
    "repuestos",
    "limpieza",
    "materiales",
    "otros",
)
TIPOS_MOVIMIENTO = ("entrada", "salida", "ajuste")

TIPOS_EVENTO = ("evento", "mantenimiento", "inspeccion")
CATEGORIAS_EVENTO = (
    "siembra",
    "trasplante",
    "inspeccion",
    "mantenimiento_preventivo",
    "mantenimiento_correctivo",
    "limpieza_depositos",
    "revision_bombas",
    "revision_sensores",
    "fertilizacion",
    "riego",
    "cosecha",
    "otras",
)
ESTADOS_EVENTO = ("programado", "en_ejecucion", "completado", "atrasado", "cancelado")


class IncidenciaCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=255)
    descripcion: str = Field(min_length=5, max_length=5000)
    categoria: Literal[
        "riego", "equipos", "infraestructura", "ambiental", "plantas", "sensores", "otros"
    ]
    prioridad: Literal["baja", "media", "alta", "critica"] = "media"
    sector_id: Optional[int] = Field(default=None, gt=0)
    cultivo_id: Optional[int] = Field(default=None, gt=0)


class IncidenciaUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=3, max_length=255)
    descripcion: Optional[str] = Field(default=None, min_length=5, max_length=5000)
    categoria: Optional[
        Literal["riego", "equipos", "infraestructura", "ambiental", "plantas", "sensores", "otros"]
    ] = None
    prioridad: Optional[Literal["baja", "media", "alta", "critica"]] = None
    asignado_a: Optional[int] = Field(default=None, gt=0)
    sector_id: Optional[int] = Field(default=None, gt=0)
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    resolucion: Optional[str] = Field(default=None, max_length=5000)


class IncidenciaEstadoUpdate(BaseModel):
    estado: Literal[
        "nueva", "pendiente_revision", "asignada", "en_proceso", "resuelta", "cerrada"
    ]
    comentario: Optional[str] = Field(default=None, max_length=2000)
    resolucion: Optional[str] = Field(default=None, max_length=5000)


class ComentarioCreate(BaseModel):
    comentario: str = Field(min_length=1, max_length=2000)


class IncidenciaEscalar(BaseModel):
    motivo: Optional[str] = Field(default=None, max_length=1000)


class TareaCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=5000)
    categoria: Literal[
        "mantenimiento", "inspeccion", "limpieza", "riego",
        "control_cultivos", "inventario", "reparaciones", "general"
    ] = "general"
    prioridad: Literal["baja", "media", "alta", "critica"] = "media"
    responsable_id: Optional[int] = Field(default=None, gt=0)
    sector_id: Optional[int] = Field(default=None, gt=0)
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    fecha_limite: Optional[datetime] = None
    observaciones: Optional[str] = Field(default=None, max_length=5000)


class TareaUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=3, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=5000)
    categoria: Optional[
        Literal[
            "mantenimiento", "inspeccion", "limpieza", "riego",
            "control_cultivos", "inventario", "reparaciones", "general"
        ]
    ] = None
    prioridad: Optional[Literal["baja", "media", "alta", "critica"]] = None
    responsable_id: Optional[int] = Field(default=None, gt=0)
    sector_id: Optional[int] = Field(default=None, gt=0)
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    fecha_limite: Optional[datetime] = None
    observaciones: Optional[str] = Field(default=None, max_length=5000)


class TareaEstadoUpdate(BaseModel):
    estado: Literal[
        "pendiente", "en_progreso", "en_revision", "completada", "atrasada", "cancelada"
    ]
    comentario: Optional[str] = Field(default=None, max_length=2000)


class ProductoCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=255)
    codigo: str = Field(min_length=1, max_length=100)
    categoria: Literal[
        "semillas", "nutrientes", "fertilizantes", "herramientas",
        "repuestos", "limpieza", "materiales", "otros"
    ] = "otros"
    descripcion: Optional[str] = Field(default=None, max_length=3000)
    unidad: str = Field(min_length=1, max_length=30)
    stock: float = Field(default=0, ge=0)
    stock_minimo: float = Field(default=0, ge=0)
    ubicacion: Optional[str] = Field(default=None, max_length=255)


class ProductoUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=255)
    codigo: Optional[str] = Field(default=None, min_length=1, max_length=100)
    categoria: Optional[
        Literal[
            "semillas", "nutrientes", "fertilizantes", "herramientas",
            "repuestos", "limpieza", "materiales", "otros"
        ]
    ] = None
    descripcion: Optional[str] = Field(default=None, max_length=3000)
    unidad: Optional[str] = Field(default=None, min_length=1, max_length=30)
    stock_minimo: Optional[float] = Field(default=None, ge=0)
    ubicacion: Optional[str] = Field(default=None, max_length=255)
    activo: Optional[bool] = None


class MovimientoCreate(BaseModel):
    producto_id: int = Field(gt=0)
    tipo: Literal["entrada", "salida", "ajuste"]
    cantidad: float = Field(gt=0)
    motivo: Optional[str] = Field(default=None, max_length=2000)
    sector_id: Optional[int] = Field(default=None, gt=0)


class SolicitudCreate(BaseModel):
    producto_id: int = Field(gt=0)
    cantidad: float = Field(gt=0)
    motivo: Optional[str] = Field(default=None, max_length=2000)
    sector_id: Optional[int] = Field(default=None, gt=0)


class SolicitudResolucion(BaseModel):
    estado: Literal["aprobada", "rechazada"]
    comentario: Optional[str] = Field(default=None, max_length=2000)


class EventoCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=255)
    tipo: Literal["evento", "mantenimiento", "inspeccion"] = "evento"
    categoria: Literal[
        "siembra", "trasplante", "inspeccion", "mantenimiento_preventivo",
        "mantenimiento_correctivo", "limpieza_depositos", "revision_bombas",
        "revision_sensores", "fertilizacion", "riego", "cosecha", "otras"
    ] = "otras"
    descripcion: Optional[str] = Field(default=None, max_length=5000)
    fecha_inicio: datetime
    fecha_fin: Optional[datetime] = None
    sector_id: Optional[int] = Field(default=None, gt=0)
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    responsable_id: Optional[int] = Field(default=None, gt=0)
    estado: Literal[
        "programado", "en_ejecucion", "completado", "atrasado", "cancelado"
    ] = "programado"


class EventoUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=3, max_length=255)
    tipo: Optional[Literal["evento", "mantenimiento", "inspeccion"]] = None
    categoria: Optional[
        Literal[
            "siembra", "trasplante", "inspeccion", "mantenimiento_preventivo",
            "mantenimiento_correctivo", "limpieza_depositos", "revision_bombas",
            "revision_sensores", "fertilizacion", "riego", "cosecha", "otras"
        ]
    ] = None
    descripcion: Optional[str] = Field(default=None, max_length=5000)
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    sector_id: Optional[int] = Field(default=None, gt=0)
    cultivo_id: Optional[int] = Field(default=None, gt=0)
    responsable_id: Optional[int] = Field(default=None, gt=0)
    estado: Optional[
        Literal["programado", "en_ejecucion", "completado", "atrasado", "cancelado"]
    ] = None


class EventoCompletar(BaseModel):
    fecha_realizacion: Optional[datetime] = None
    resultado: Optional[str] = Field(default=None, max_length=50)
    observaciones: Optional[str] = Field(default=None, max_length=5000)
    recomendaciones: Optional[str] = Field(default=None, max_length=5000)
    crear_incidencia: bool = False
    incidencia_titulo: Optional[str] = Field(default=None, max_length=255)
    incidencia_descripcion: Optional[str] = Field(default=None, max_length=5000)


class EquipoSectoresUpdate(BaseModel):
    sector_ids: list[int] = Field(default_factory=list)


class GrupoCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=3000)
    supervisor_id: int = Field(gt=0)
    color: str = Field(default="#5E7A55", pattern=r"^#[0-9a-fA-F]{6}$")
    activo: bool = True
    miembros: list[int] = Field(default_factory=list)


class GrupoUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=255)
    descripcion: Optional[str] = Field(default=None, max_length=3000)
    supervisor_id: Optional[int] = Field(default=None, gt=0)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    activo: Optional[bool] = None
    miembros: Optional[list[int]] = None


class MapaConfigUpdate(BaseModel):
    posicion_x: int = Field(default=0, ge=0, le=50)
    posicion_y: int = Field(default=0, ge=0, le=50)
    ancho: int = Field(default=2, ge=1, le=12)
    alto: int = Field(default=1, ge=1, le=12)
    tipo_sector: Literal[
        "cultivo", "deposito", "bomba", "trabajo", "almacen", "otro"
    ] = "cultivo"
    color: str = Field(default="#0E7490", pattern=r"^#[0-9a-fA-F]{6}$")


class NotificacionAdminCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=255)
    mensaje: str = Field(min_length=1, max_length=5000)
    prioridad: Literal["info", "importante", "urgente"] = "info"
    categoria: str = Field(default="sistema", min_length=2, max_length=50)
    url: Optional[str] = Field(default=None, max_length=255)
    usuario_ids: list[int] = Field(default_factory=list)
    roles: list[Literal["admin", "administrador", "supervisor", "encargado"]] = Field(
        default_factory=list
    )
