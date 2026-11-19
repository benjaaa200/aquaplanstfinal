from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database import Base

class Usuario(Base):
    __tablename__ = "usuarios"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    nombre_completo = Column(String(255))
    rol = Column(String(50), nullable=False, default="encargado")
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    ultimo_acceso = Column(DateTime(timezone=True))
    email_respaldo = Column(String(255), unique=True, index=True)
    telefono_respaldo = Column(String(32))
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    cultivos_asignados = relationship("Cultivo", secondary="usuario_cultivo", 
back_populates="encargados")
    instalaciones_responsable = relationship("Instalacion", back_populates="responsable")
    grupos_trabajo = relationship(
        "GrupoTrabajo", secondary="grupo_miembros", back_populates="miembros"
    )
    grupos_supervisados = relationship(
        "GrupoTrabajo",
        foreign_keys="GrupoTrabajo.supervisor_id",
        back_populates="supervisor",
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (
        Index("idx_reset_usuario_usado", "usuario_id", "usado"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    usuario_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    codigo_hash = Column(String(128), nullable=False)
    canal = Column(String(16), nullable=False, default="email")
    tipo = Column(
        String(16), nullable=False, default="codigo", server_default="codigo"
    )
    usado = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    intentos = Column(Integer, nullable=False, default=0, server_default="0")
    expira = Column(DateTime, nullable=False)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

class Cultivo(Base):
    __tablename__ = "cultivos"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nombre = Column(String(255), nullable=False)
    ubicacion = Column(String(255))
    tipo_planta = Column(String(100))
    fecha_inicio = Column(DateTime(timezone=True))
    fecha_fin = Column(DateTime(timezone=True))
    estado = Column(String(50), default="activo")
    area_m2 = Column(Float)
    instalacion_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="SET NULL")
    )
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    
    mediciones = relationship("Medicion", back_populates="cultivo", cascade="all, delete-orphan")
    alertas = relationship("Alerta", back_populates="cultivo", cascade="all, delete-orphan")
    riegos = relationship("Riego", back_populates="cultivo", cascade="all, delete-orphan")
    encargados = relationship("Usuario", secondary="usuario_cultivo", back_populates="cultivos_asignados")
    instalacion = relationship("Instalacion", back_populates="cultivos")


class Instalacion(Base):
    __tablename__ = "instalaciones"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nombre = Column(String(255), nullable=False, unique=True)
    ubicacion = Column(String(255))
    descripcion = Column(Text)
    area_m2 = Column(Float)
    responsable_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    activa = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    responsable = relationship("Usuario", back_populates="instalaciones_responsable")
    cultivos = relationship("Cultivo", back_populates="instalacion")
    dispositivos = relationship("Dispositivo", back_populates="instalacion")


class Dispositivo(Base):
    __tablename__ = "dispositivos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nombre = Column(String(255), nullable=False, unique=True)
    tipo = Column(String(50), nullable=False, default="sensor")
    modelo = Column(String(150))
    direccion_mac = Column(String(17), unique=True, index=True)
    direccion_ip = Column(String(253), index=True)
    puerto = Column(Integer, nullable=False, default=80, server_default="80")
    descripcion = Column(Text)
    instalacion_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="RESTRICT"), index=True
    )
    estado = Column(String(20), nullable=False, default="activo", server_default="activo")
    ultimaconexion = Column(DateTime(timezone=True))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    instalacion = relationship("Instalacion", back_populates="dispositivos")

class UsuarioCultivo(Base):
    __tablename__ = "usuario_cultivo"
    __table_args__ = (
        UniqueConstraint("usuario_id", "cultivo_id", name="uq_usuario_cultivo"),
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    cultivo_id = Column(Integer, ForeignKey("cultivos.id"), nullable=False, index=True)
    fecha_asignacion = Column(DateTime(timezone=True), server_default=func.now())

class GrupoTrabajo(Base):
    __tablename__ = "grupos_trabajo"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nombre = Column(String(255), nullable=False, unique=True, index=True)
    descripcion = Column(Text)
    supervisor_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    color = Column(String(20), nullable=False, default="#5E7A55", server_default="#5E7A55")
    activo = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    supervisor = relationship(
        "Usuario", foreign_keys=[supervisor_id], back_populates="grupos_supervisados"
    )
    miembros = relationship(
        "Usuario", secondary="grupo_miembros", back_populates="grupos_trabajo"
    )


class GrupoMiembro(Base):
    __tablename__ = "grupo_miembros"
    __table_args__ = (
        UniqueConstraint("grupo_id", "usuario_id", name="uq_grupo_miembro"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    grupo_id = Column(
        Integer, ForeignKey("grupos_trabajo.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    usuario_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    fecha_asignacion = Column(DateTime(timezone=True), server_default=func.now())


class Medicion(Base):
    __tablename__ = "mediciones"
    __table_args__ = (
        Index("idx_mediciones_cultivo_fecha", "cultivo_id", "fecha_hora"),
    )
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cultivo_id = Column(Integer, ForeignKey("cultivos.id"), nullable=False)
    temperatura = Column(Float, nullable=False)
    humedad = Column(Float, nullable=False)
    nivel_agua = Column(Float, nullable=False)
    ph = Column(Float)
    conductividad = Column(Float)
    fecha_hora = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    cultivo = relationship("Cultivo", back_populates="mediciones")

    @property
    def cultivo_nombre(self):
        return self.cultivo.nombre if self.cultivo else None

class Alerta(Base):
    __tablename__ = "alertas"
    __table_args__ = (
        Index("idx_alertas_cultivo_estado", "cultivo_id", "leida", "resuelta"),
    )
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cultivo_id = Column(Integer, ForeignKey("cultivos.id"), nullable=False)
    tipo = Column(String(100), nullable=False)
    severidad = Column(String(50), nullable=False)
    mensaje = Column(Text, nullable=False)
    valor_detectado = Column(Float)
    umbral = Column(Float)
    leida = Column(Boolean, default=False)
    resuelta = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    fecha_hora = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    fecha_lectura = Column(DateTime(timezone=True))
    fecha_resolucion = Column(DateTime(timezone=True))
    
    cultivo = relationship("Cultivo", back_populates="alertas")

    @property
    def cultivo_nombre(self):
        return self.cultivo.nombre if self.cultivo else None

class Riego(Base):
    __tablename__ = "riegos"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cultivo_id = Column(Integer, ForeignKey("cultivos.id"), nullable=False)
    zona = Column(String(100))
    tipo = Column(String(50))
    duracion_minutos = Column(Integer)
    consumo_litros = Column(Float)
    fecha_inicio = Column(DateTime(timezone=True))
    fecha_fin = Column(DateTime(timezone=True))
    estado = Column(String(50), default="completado")
    
    cultivo = relationship("Cultivo", back_populates="riegos")


class ZonaRiego(Base):
    __tablename__ = "zonas_riego"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cultivo_id = Column(
        Integer, ForeignKey("cultivos.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True
    )
    activa = Column(Boolean, nullable=False, default=True)
    duracion_programada = Column(Integer, nullable=False, default=15)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    cultivo = relationship("Cultivo")


class ProgramacionRiego(Base):
    __tablename__ = "programaciones_riego"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    zona_id = Column(
        Integer, ForeignKey("zonas_riego.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    hora_inicio = Column(String(5), nullable=False)
    duracion_minutos = Column(Integer, nullable=False)
    frecuencia = Column(String(12), nullable=False)
    activa = Column(Boolean, nullable=False, default=True, index=True)
    created_by = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    zona = relationship("ZonaRiego")
    usuario = relationship("Usuario")


class Umbral(Base):
    __tablename__ = "umbrales"
    __table_args__ = (
        UniqueConstraint(
            "variable", "instalacion_id", "cultivo_id", name="uq_umbral_scope"
        ),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    variable = Column(String(50), nullable=False, index=True)
    nombre = Column(String(150), nullable=False)
    unidad = Column(String(20))
    valor_minimo = Column(Float)
    valor_maximo = Column(Float)
    valor_alerta = Column(Float)
    instalacion_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="CASCADE"), index=True
    )
    cultivo_id = Column(
        Integer, ForeignKey("cultivos.id", ondelete="CASCADE"), index=True
    )
    activo = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    descripcion = Column(Text)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_actualizacion = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    instalacion = relationship("Instalacion")
    cultivo = relationship("Cultivo")

    @property
    def instalacion_nombre(self):
        return self.instalacion.nombre if self.instalacion else None

    @property
    def cultivo_nombre(self):
        return self.cultivo.nombre if self.cultivo else None


class ReporteGenerado(Base):
    __tablename__ = "reportes_generados"
    __table_args__ = (
        Index("idx_reportes_usuario_fecha", "usuario_id", "fecha_generacion"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    usuario_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False
    )
    tipo = Column(String(50), nullable=False)
    cultivo_id = Column(
        Integer, ForeignKey("cultivos.id", ondelete="SET NULL"), index=True
    )
    fecha_inicio = Column(DateTime(timezone=True), nullable=False)
    fecha_fin = Column(DateTime(timezone=True), nullable=False)
    formato = Column(String(20), nullable=False, default="csv")
    total_registros = Column(Integer, nullable=False, default=0)
    tamano_bytes = Column(Integer, nullable=False, default=0)
    fecha_generacion = Column(DateTime(timezone=True), server_default=func.now())

    usuario = relationship("Usuario")
    cultivo = relationship("Cultivo")

    @property
    def cultivo_nombre(self):
        return self.cultivo.nombre if self.cultivo else None

    @property
    def usuario_nombre(self):
        return self.usuario.username if self.usuario else None


# =========================================================
# OPERACIÓN AGRÍCOLA
# Tareas, incidencias, inventario, calendario y notificaciones.
# =========================================================

class Notificacion(Base):
    __tablename__ = "notificaciones"
    __table_args__ = (
        Index("idx_notificaciones_usuario_leida", "usuario_id", "leida"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    usuario_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    categoria = Column(String(50), nullable=False, default="sistema", index=True)
    titulo = Column(String(255), nullable=False)
    mensaje = Column(Text)
    prioridad = Column(String(20), nullable=False, default="info")
    leida = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    url = Column(String(255))
    entidad_tipo = Column(String(50))
    entidad_id = Column(Integer)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    usuario = relationship("Usuario")


class Incidencia(Base):
    __tablename__ = "incidencias"
    __table_args__ = (
        Index("idx_incidencias_estado_prioridad", "estado", "prioridad"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    titulo = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=False)
    categoria = Column(String(50), nullable=False, index=True)
    prioridad = Column(String(20), nullable=False, default="media", index=True)
    estado = Column(String(30), nullable=False, default="nueva", index=True)
    sector_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="SET NULL"), index=True
    )
    cultivo_id = Column(
        Integer, ForeignKey("cultivos.id", ondelete="SET NULL"), index=True
    )
    reportado_por = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    asignado_a = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    resolucion = Column(Text)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    fecha_actualizacion = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    fecha_resolucion = Column(DateTime(timezone=True))

    sector = relationship("Instalacion")
    cultivo = relationship("Cultivo")
    reportador = relationship("Usuario", foreign_keys=[reportado_por])
    asignado = relationship("Usuario", foreign_keys=[asignado_a])
    comentarios = relationship(
        "IncidenciaComentario", back_populates="incidencia",
        cascade="all, delete-orphan"
    )

    @property
    def sector_nombre(self):
        return self.sector.nombre if self.sector else None

    @property
    def cultivo_nombre(self):
        return self.cultivo.nombre if self.cultivo else None

    @property
    def reportador_nombre(self):
        return (
            (self.reportador.nombre_completo or self.reportador.username)
            if self.reportador else None
        )

    @property
    def asignado_nombre(self):
        return (
            (self.asignado.nombre_completo or self.asignado.username)
            if self.asignado else None
        )


class IncidenciaComentario(Base):
    __tablename__ = "incidencia_comentarios"
    __table_args__ = (
        Index("idx_incidencia_comentarios_incidencia", "incidencia_id", "fecha_creacion"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    incidencia_id = Column(
        Integer, ForeignKey("incidencias.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    usuario_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    comentario = Column(Text, nullable=False)
    estado_anterior = Column(String(30))
    estado_nuevo = Column(String(30))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    incidencia = relationship("Incidencia", back_populates="comentarios")
    usuario = relationship("Usuario")

    @property
    def usuario_nombre(self):
        return (
            (self.usuario.nombre_completo or self.usuario.username)
            if self.usuario else "Sistema"
        )


class Tarea(Base):
    __tablename__ = "tareas"
    __table_args__ = (
        Index("idx_tareas_estado_fecha", "estado", "fecha_limite"),
        Index("idx_tareas_responsable", "responsable_id", "estado"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    titulo = Column(String(255), nullable=False)
    descripcion = Column(Text)
    categoria = Column(String(50), nullable=False, default="general", index=True)
    prioridad = Column(String(20), nullable=False, default="media", index=True)
    estado = Column(String(30), nullable=False, default="pendiente", index=True)
    responsable_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    creador_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    sector_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="SET NULL"), index=True
    )
    cultivo_id = Column(
        Integer, ForeignKey("cultivos.id", ondelete="SET NULL"), index=True
    )
    observaciones = Column(Text)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    fecha_limite = Column(DateTime(timezone=True), index=True)
    fecha_completada = Column(DateTime(timezone=True))
    completada_por = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL")
    )

    responsable = relationship("Usuario", foreign_keys=[responsable_id])
    creador = relationship("Usuario", foreign_keys=[creador_id])
    completador = relationship("Usuario", foreign_keys=[completada_por])
    sector = relationship("Instalacion")
    cultivo = relationship("Cultivo")
    comentarios = relationship(
        "TareaComentario", back_populates="tarea", cascade="all, delete-orphan"
    )

    @property
    def responsable_nombre(self):
        return (
            (self.responsable.nombre_completo or self.responsable.username)
            if self.responsable else None
        )

    @property
    def creador_nombre(self):
        return (
            (self.creador.nombre_completo or self.creador.username)
            if self.creador else None
        )

    @property
    def sector_nombre(self):
        return self.sector.nombre if self.sector else None

    @property
    def cultivo_nombre(self):
        return self.cultivo.nombre if self.cultivo else None


class ConfiguracionMapa(Base):
    __tablename__ = "mapa_configuracion"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sector_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True
    )
    posicion_x = Column(Integer, nullable=False, default=0)
    posicion_y = Column(Integer, nullable=False, default=0)
    ancho = Column(Integer, nullable=False, default=2)
    alto = Column(Integer, nullable=False, default=1)
    tipo_sector = Column(String(30), nullable=False, default="cultivo")
    color = Column(String(20), nullable=False, default="#0E7490")

    sector = relationship("Instalacion")


class TareaComentario(Base):
    __tablename__ = "tarea_comentarios"
    __table_args__ = (
        Index("idx_tarea_comentarios_tarea", "tarea_id", "fecha_creacion"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tarea_id = Column(
        Integer, ForeignKey("tareas.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    usuario_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    comentario = Column(Text, nullable=False)
    estado_anterior = Column(String(30))
    estado_nuevo = Column(String(30))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    tarea = relationship("Tarea", back_populates="comentarios")
    usuario = relationship("Usuario")

    @property
    def usuario_nombre(self):
        return (
            (self.usuario.nombre_completo or self.usuario.username)
            if self.usuario else "Sistema"
        )


class ProductoInventario(Base):
    __tablename__ = "inventario_productos"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nombre = Column(String(255), nullable=False)
    codigo = Column(String(100), nullable=False, unique=True, index=True)
    categoria = Column(String(50), nullable=False, default="otros", index=True)
    descripcion = Column(Text)
    unidad = Column(String(30), nullable=False, default="unidad")
    stock = Column(Float, nullable=False, default=0)
    stock_minimo = Column(Float, nullable=False, default=0)
    ubicacion = Column(String(255))
    activo = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_actualizacion = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    movimientos = relationship(
        "MovimientoInventario", back_populates="producto",
        cascade="all, delete-orphan"
    )

    @property
    def stock_bajo(self):
        return self.stock <= self.stock_minimo

    @property
    def agotado(self):
        return self.stock <= 0


class MovimientoInventario(Base):
    __tablename__ = "inventario_movimientos"
    __table_args__ = (
        Index("idx_inventario_movimientos_producto", "producto_id", "fecha_creacion"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    producto_id = Column(
        Integer, ForeignKey("inventario_productos.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    usuario_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    tipo = Column(String(20), nullable=False, index=True)
    cantidad = Column(Float, nullable=False)
    motivo = Column(Text)
    sector_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="SET NULL"), index=True
    )
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    producto = relationship("ProductoInventario", back_populates="movimientos")
    usuario = relationship("Usuario")
    sector = relationship("Instalacion")

    @property
    def usuario_nombre(self):
        return (
            (self.usuario.nombre_completo or self.usuario.username)
            if self.usuario else "Sistema"
        )

    @property
    def producto_nombre(self):
        return self.producto.nombre if self.producto else None


class SolicitudInsumo(Base):
    __tablename__ = "inventario_solicitudes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    producto_id = Column(
        Integer, ForeignKey("inventario_productos.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    solicitante_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    sector_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="SET NULL"), index=True
    )
    cantidad = Column(Float, nullable=False)
    motivo = Column(Text)
    estado = Column(String(20), nullable=False, default="pendiente", index=True)
    resuelto_por = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_resolucion = Column(DateTime(timezone=True))

    producto = relationship("ProductoInventario")
    solicitante = relationship("Usuario", foreign_keys=[solicitante_id])
    sector = relationship("Instalacion")
    resolutor = relationship("Usuario", foreign_keys=[resuelto_por])

    @property
    def producto_nombre(self):
        return self.producto.nombre if self.producto else None

    @property
    def solicitante_nombre(self):
        return (
            (self.solicitante.nombre_completo or self.solicitante.username)
            if self.solicitante else None
        )


class EventoCalendario(Base):
    __tablename__ = "calendario_eventos"
    __table_args__ = (
        Index("idx_calendario_fecha", "fecha_inicio", "estado"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    titulo = Column(String(255), nullable=False)
    tipo = Column(String(30), nullable=False, default="evento", index=True)
    categoria = Column(String(50), nullable=False, default="otras", index=True)
    descripcion = Column(Text)
    fecha_inicio = Column(DateTime(timezone=True), nullable=False, index=True)
    fecha_fin = Column(DateTime(timezone=True))
    sector_id = Column(
        Integer, ForeignKey("instalaciones.id", ondelete="SET NULL"), index=True
    )
    cultivo_id = Column(
        Integer, ForeignKey("cultivos.id", ondelete="SET NULL"), index=True
    )
    responsable_id = Column(
        Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True
    )
    estado = Column(String(30), nullable=False, default="programado", index=True)
    fecha_realizacion = Column(DateTime(timezone=True))
    resultado = Column(String(50))
    observaciones = Column(Text)
    recomendaciones = Column(Text)
    incidencia_id = Column(
        Integer, ForeignKey("incidencias.id", ondelete="SET NULL"), index=True
    )
    creador_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"))
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    sector = relationship("Instalacion")
    cultivo = relationship("Cultivo")
    responsable = relationship("Usuario", foreign_keys=[responsable_id])
    creador = relationship("Usuario", foreign_keys=[creador_id])
    incidencia = relationship("Incidencia")

    @property
    def sector_nombre(self):
        return self.sector.nombre if self.sector else None

    @property
    def cultivo_nombre(self):
        return self.cultivo.nombre if self.cultivo else None

    @property
    def responsable_nombre(self):
        return (
            (self.responsable.nombre_completo or self.responsable.username)
            if self.responsable else None
        )