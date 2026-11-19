import logging
import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.config import DATABASE_URL

logger = logging.getLogger(__name__)

# El pool se puede ajustar según el número de usuarios concurrentes. Con más
# hilos de trabajo, un pool mayor evita que las peticiones esperen por conexión.
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))

# Crear engine de PostgreSQL
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=30,
    pool_use_lifo=True,
    echo=False
)

# Índices que aceleran los listados y dashboards más consultados. Se crean
# solo si faltan, de modo que bases de datos antiguas también se beneficien.
PERFORMANCE_INDEXES = (
    ("mediciones", "idx_mediciones_fecha_hora", ("fecha_hora",)),
    ("mediciones", "idx_mediciones_cultivo_fecha", ("cultivo_id", "fecha_hora")),
    ("alertas", "idx_alertas_fecha_hora", ("fecha_hora",)),
    ("alertas", "idx_alertas_resuelta_fecha", ("resuelta", "fecha_hora")),
    ("notificaciones", "idx_notificaciones_usuario_leida", ("usuario_id", "leida")),
    ("incidencias", "idx_incidencias_estado_fecha", ("estado", "fecha_creacion")),
    ("tareas", "idx_tareas_responsable_estado", ("responsable_id", "estado")),
    ("calendario_eventos", "idx_eventos_fecha_inicio", ("fecha_inicio",)),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Inicializa la base de datos creando todas las tablas.

    Los bloqueos asesores serializan la inicialización con varios workers.
    """
    if engine.dialect.name == "mysql":
        with engine.connect() as lock_connection:
            lock_connection.execute(
                text("SELECT GET_LOCK('aquaplants_init', 60)")
            )
            try:
                _initialize_schema()
            finally:
                lock_connection.execute(
                    text("SELECT RELEASE_LOCK('aquaplants_init')")
                )
    elif engine.dialect.name == "postgresql":
        with engine.connect() as lock_connection:
            lock_connection.execute(text("SELECT pg_advisory_lock(724193028)"))
            try:
                _initialize_schema()
            finally:
                lock_connection.execute(
                    text("SELECT pg_advisory_unlock(724193028)")
                )
    else:
        _initialize_schema()


def _initialize_schema():
    from backend.models import (
        Alerta,
        ConfiguracionMapa,
        Cultivo,
        Dispositivo,
        EventoCalendario,
        GrupoMiembro,
        GrupoTrabajo,
        Incidencia,
        IncidenciaComentario,
        Instalacion,
        Medicion,
        MovimientoInventario,
        Notificacion,
        PasswordResetToken,
        ProductoInventario,
        ProgramacionRiego,
        ReporteGenerado,
        Riego,
        SolicitudInsumo,
        Tarea,
        TareaComentario,
        Umbral,
        Usuario,
        UsuarioCultivo,
        ZonaRiego,
    )
    Base.metadata.create_all(bind=engine)
    ensure_dispositivo_ip_columns(engine)
    ensure_crop_installation_column(engine)
    ensure_alert_resolution_columns(engine)
    ensure_usuario_cultivo_unique(engine)
    ensure_usuario_reset_columns(engine)
    ensure_password_reset_token_columns(engine)
    ensure_performance_indexes(engine)
    logger.info("Base de datos inicializada correctamente")


def ensure_dispositivo_ip_columns(bind=engine):
    """Add the IP address and TCP port used to check device connectivity."""
    inspector = inspect(bind)
    if not inspector.has_table("dispositivos"):
        return

    columns = {column["name"] for column in inspector.get_columns("dispositivos")}
    statements = []
    if "direccion_ip" not in columns:
        statements.append(
            "ALTER TABLE dispositivos ADD COLUMN direccion_ip VARCHAR(253) NULL"
        )
    if "puerto" not in columns:
        statements.append(
            "ALTER TABLE dispositivos ADD COLUMN puerto INTEGER NOT NULL DEFAULT 80"
        )

    if statements:
        with bind.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))
        logger.info("Columnas de conexión agregadas a dispositivos")

    indexes = inspect(bind).get_indexes("dispositivos")
    if not any(
        "direccion_ip" in (index.get("column_names") or []) for index in indexes
    ):
        with bind.begin() as connection:
            connection.execute(text(
                "CREATE INDEX idx_dispositivos_direccion_ip "
                "ON dispositivos (direccion_ip)"
            ))


def ensure_usuario_reset_columns(bind=engine):
    """Add backup-contact and token-version columns used by password recovery."""
    inspector = inspect(bind)
    if not inspector.has_table("usuarios"):
        return

    columns = {column["name"] for column in inspector.get_columns("usuarios")}
    statements = []
    if "email_respaldo" not in columns:
        statements.append("ALTER TABLE usuarios ADD COLUMN email_respaldo VARCHAR(255) NULL")
    if "telefono_respaldo" not in columns:
        statements.append("ALTER TABLE usuarios ADD COLUMN telefono_respaldo VARCHAR(32) NULL")
    if "token_version" not in columns:
        statements.append(
            "ALTER TABLE usuarios ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"
        )

    if statements:
        with bind.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))
        logger.info("Columnas de recuperación agregadas a usuarios")

    indexes = inspect(bind).get_indexes("usuarios")
    unique_constraints = inspect(bind).get_unique_constraints("usuarios")
    tiene_unico = any(
        index.get("unique")
        and tuple(index.get("column_names") or ()) == ("email_respaldo",)
        for index in indexes
    ) or any(
        set(constraint.get("column_names") or ()) == {"email_respaldo"}
        for constraint in unique_constraints
    )
    if not tiene_unico:
        try:
            with bind.begin() as connection:
                connection.execute(text(
                    "CREATE UNIQUE INDEX uq_usuarios_email_respaldo "
                    "ON usuarios (email_respaldo)"
                ))
        except Exception as exc:  # pragma: no cover - depende de datos existentes
            logger.warning("No se pudo crear el índice de email de respaldo: %s", exc)


def ensure_password_reset_token_columns(bind=engine):
    """Add the token type column used by the magic-link recovery flow."""
    inspector = inspect(bind)
    if not inspector.has_table("password_reset_tokens"):
        return

    columns = {
        column["name"]
        for column in inspector.get_columns("password_reset_tokens")
    }
    if "tipo" not in columns:
        with bind.begin() as connection:
            connection.execute(text(
                "ALTER TABLE password_reset_tokens "
                "ADD COLUMN tipo VARCHAR(16) NOT NULL DEFAULT 'codigo'"
            ))
        logger.info("Columna tipo agregada a password_reset_tokens")


def ensure_performance_indexes(bind=engine):
    """Create missing indexes used by frequent filters and dashboards."""
    inspector = inspect(bind)
    for table, name, columns in PERFORMANCE_INDEXES:
        if not inspector.has_table(table):
            continue

        indexes = inspector.get_indexes(table)
        if any(index["name"] == name for index in indexes):
            continue
        if any(
            tuple(index.get("column_names") or ())[:len(columns)] == columns
            for index in indexes
        ):
            continue

        column_sql = ", ".join(columns)
        with bind.begin() as connection:
            connection.execute(text(
                f"CREATE INDEX {name} ON {table} ({column_sql})"
            ))
        logger.info("Índice creado: %s(%s)", name, column_sql)


def ensure_alert_resolution_columns(bind=engine):
    """Apply additive alert-state columns to databases created by older versions."""
    inspector = inspect(bind)
    if not inspector.has_table("alertas"):
        return

    columns = {column["name"] for column in inspector.get_columns("alertas")}
    statements = []
    if "resuelta" not in columns:
        statements.append(
            "ALTER TABLE alertas ADD COLUMN resuelta BOOLEAN NOT NULL DEFAULT FALSE"
        )
    if "fecha_resolucion" not in columns:
        datetime_type = (
            "TIMESTAMP WITH TIME ZONE"
            if bind.dialect.name == "postgresql"
            else "DATETIME"
        )
        statements.append(
            "ALTER TABLE alertas ADD COLUMN "
            f"fecha_resolucion {datetime_type} NULL"
        )

    if statements:
        with bind.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))


def ensure_usuario_cultivo_unique(bind=engine):
    """Deduplicate assignments and enforce one row per user-crop pair."""
    inspector = inspect(bind)
    if not inspector.has_table("usuario_cultivo"):
        return

    expected_columns = {"usuario_id", "cultivo_id"}
    unique_constraints = inspector.get_unique_constraints("usuario_cultivo")
    if any(
        set(constraint["column_names"]) == expected_columns
        for constraint in unique_constraints
    ):
        return
    indexes = inspector.get_indexes("usuario_cultivo")
    if any(
        index.get("unique") and set(index["column_names"]) == expected_columns
        for index in indexes
    ):
        return

    with bind.begin() as connection:
        connection.execute(text(
            "DELETE FROM usuario_cultivo WHERE id NOT IN ("
            "SELECT min_id FROM ("
            "SELECT MIN(id) AS min_id FROM usuario_cultivo "
            "GROUP BY usuario_id, cultivo_id"
            ") AS kept_rows)"
        ))
        connection.execute(text(
            "CREATE UNIQUE INDEX uq_usuario_cultivo "
            "ON usuario_cultivo (usuario_id, cultivo_id)"
        ))


def ensure_crop_installation_column(bind=engine):
    """Add the optional crop-to-installation relationship to existing databases."""
    inspector = inspect(bind)
    if not inspector.has_table("cultivos"):
        return

    columns = {column["name"] for column in inspector.get_columns("cultivos")}
    if "instalacion_id" not in columns:
        with bind.begin() as connection:
            connection.execute(text(
                "ALTER TABLE cultivos ADD COLUMN instalacion_id INTEGER NULL"
            ))
    indexes = inspector.get_indexes("cultivos")
    if not any(
        "instalacion_id" in index["column_names"] for index in indexes
    ):
        with bind.begin() as connection:
            connection.execute(text(
                "CREATE INDEX idx_cultivos_instalacion_id "
                "ON cultivos (instalacion_id)"
            ))
    if bind.dialect.name in ("mysql", "postgresql"):
        foreign_keys = inspector.get_foreign_keys("cultivos")
        if not any(
            "instalacion_id" in key["constrained_columns"] for key in foreign_keys
        ):
            with bind.begin() as connection:
                connection.execute(text(
                    "ALTER TABLE cultivos ADD CONSTRAINT fk_cultivos_instalacion "
                    "FOREIGN KEY (instalacion_id) REFERENCES instalaciones(id) "
                    "ON DELETE SET NULL"
                ))