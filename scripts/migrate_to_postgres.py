"""Copia datos desde otra base (MySQL/MariaDB, SQLite o PostgreSQL) a AquaPlants.

El destino es siempre la base PostgreSQL configurada en `.env` / `backend.config`.
Las tablas se copian en orden de dependencias y los choques de clave primaria se
ignoran, de modo que el script se puede volver a ejecutar sin duplicar filas.

Ejemplos:
  python scripts/migrate_to_postgres.py --source-url "sqlite:///C:/ruta/vieja.db"
  python scripts/migrate_to_postgres.py --source-url "mysql+pymysql://user:clave@host:3306/aquaplants"
  python scripts/migrate_to_postgres.py --source-url "postgresql+psycopg://user:clave@host:5432/aquaplants"
  python scripts/migrate_to_postgres.py --source-url "..." --dry-run
  python scripts/migrate_to_postgres.py --source-url "..." --truncate

También se puede definir SOURCE_DATABASE_URL en el entorno. Con --truncate se
vacían primero las tablas de destino (operación destructiva).
"""
import argparse
import json
import os
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    Integer,
    MetaData,
    Numeric,
    Table,
    Time,
    create_engine,
    func,
    inspect,
    select,
    text,
)
from sqlalchemy.engine import make_url
from sqlalchemy.dialects.postgresql import insert as pg_insert

import backend.models  # noqa: F401  (registra las tablas del destino)
from backend.database import Base, engine as destino_engine, init_db

BATCH_SIZE = 1000


def _url_segura(url) -> str:
    return make_url(url).render_as_string(hide_password=True)


def _convertir(valor, columna):
    """Adapta valores de otros motores a los tipos del destino."""
    if valor is None:
        return None

    tipo = columna.type
    if isinstance(tipo, Boolean):
        if isinstance(valor, str):
            return valor.strip().lower() in {"1", "true", "t", "yes", "y", "si", "sí"}
        return bool(valor)
    if isinstance(tipo, DateTime) and isinstance(valor, str):
        return datetime.fromisoformat(valor.replace("Z", "+00:00"))
    if isinstance(tipo, Date) and isinstance(valor, str):
        return date.fromisoformat(valor[:10])
    if isinstance(tipo, Time) and isinstance(valor, str):
        return time.fromisoformat(valor)
    if isinstance(tipo, JSON) and isinstance(valor, str):
        return json.loads(valor)
    if isinstance(tipo, Integer) and not isinstance(valor, bool) and isinstance(valor, str):
        return int(valor)
    if isinstance(tipo, Float) and isinstance(valor, str):
        return float(valor)
    if isinstance(tipo, Numeric) and isinstance(valor, str):
        return Decimal(valor)
    return valor


def _tablas_destino():
    return Base.metadata.sorted_tables


def _preparar_origen(source_engine):
    """Refleja las tablas de origen y devuelve {nombre: Table}."""
    inspector = inspect(source_engine)
    metadata = MetaData()
    tablas = {}
    for nombre in inspector.get_table_names():
        tablas[nombre] = Table(nombre, metadata, autoload_with=source_engine)
    return tablas


def _truncar(connection, tablas):
    print("Vaciando tablas de destino (--truncate)...")
    for tabla in reversed(tablas):
        connection.execute(tabla.delete())
        print(f"  {tabla.name}: vaciada")


def _copiar_tabla(connection, source_engine, origen, destino):
    if origen is None:
        print(f"  {destino.name}: no existe en origen, se omite")
        return 0

    columnas = [
        columna for columna in destino.columns if columna.name in origen.c
    ]
    if not columnas:
        print(f"  {destino.name}: sin columnas en común, se omite")
        return 0

    nombres = [columna.name for columna in columnas]
    if connection.dialect.name == "postgresql":
        sentencia = pg_insert(destino).on_conflict_do_nothing()
    else:  # pragma: no cover - el destino oficial es PostgreSQL
        sentencia = destino.insert()

    leidas = 0
    escritas = 0
    lote = []

    with source_engine.connect() as source_connection:
        filas = source_connection.execute(
            select(*[origen.c[nombre] for nombre in nombres])
        ).mappings()
        for fila in filas:
            leidas += 1
            lote.append(
                {
                    columna.name: _convertir(fila[columna.name], columna)
                    for columna in columnas
                }
            )
            if len(lote) >= BATCH_SIZE:
                escritas += _insertar(connection, sentencia, lote)
                lote = []

    if lote:
        escritas += _insertar(connection, sentencia, lote)

    print(f"  {destino.name}: {escritas} filas copiadas de {leidas} leídas")
    return escritas


def _insertar(connection, sentencia, lote):
    resultado = connection.execute(sentencia, lote)
    return resultado.rowcount if resultado.rowcount is not None else len(lote)


def _reiniciar_secuencias(connection, tablas):
    if connection.dialect.name != "postgresql":
        return
    for tabla in tablas:
        if "id" not in tabla.c:
            continue
        connection.execute(
            text(
                "SELECT setval("
                "pg_get_serial_sequence(:tabla, 'id'), "
                f'COALESCE((SELECT MAX(id) FROM "{tabla.name}"), 1), '
                f'(SELECT MAX(id) FROM "{tabla.name}") IS NOT NULL'
                ")"
            ),
            {"tabla": tabla.name},
        )


def main():
    parser = argparse.ArgumentParser(
        description="Migra datos de otra base hacia el PostgreSQL de AquaPlants."
    )
    parser.add_argument(
        "--source-url",
        default=os.getenv("SOURCE_DATABASE_URL", ""),
        help="URL SQLAlchemy de origen (o variable SOURCE_DATABASE_URL).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Cuenta filas y valida la conexión sin escribir en el destino.",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Vacía las tablas de destino antes de copiar (destructivo).",
    )
    parser.add_argument(
        "--no-init",
        action="store_true",
        help="No crea/actualiza el esquema del destino antes de migrar.",
    )
    args = parser.parse_args()

    if not args.source_url:
        parser.error(
            "Indica --source-url o define SOURCE_DATABASE_URL. "
            "Ej: mysql+pymysql://usuario:clave@host:3306/base"
        )

    print(f"Origen : {_url_segura(args.source_url)}")
    print(f"Destino: {_url_segura(destino_engine.url)}")

    if not args.no_init and not args.dry_run:
        print("Preparando esquema de destino...")
        init_db()

    source_engine = create_engine(args.source_url, pool_pre_ping=True)
    try:
        with source_engine.connect() as source_connection:
            source_connection.execute(select(1))
    except Exception as exc:
        print(f"No se pudo conectar al origen: {exc}")
        sys.exit(1)

    origen_tablas = _preparar_origen(source_engine)
    destino_tablas = [t for t in _tablas_destino() if t.name in origen_tablas]

    if not destino_tablas:
        print("No hay tablas en común entre origen y destino.")
        sys.exit(1)

    print("Tablas a migrar:", ", ".join(t.name for t in destino_tablas))

    if args.dry_run:
        with source_engine.connect() as source_connection:
            for tabla in destino_tablas:
                cantidad = source_connection.execute(
                    select(func.count()).select_from(origen_tablas[tabla.name])
                ).scalar_one()
                print(f"  {tabla.name}: {cantidad} filas en origen")
        print("Dry-run completado; no se escribió nada.")
        return

    with destino_engine.begin() as connection:
        if args.truncate:
            _truncar(connection, destino_tablas)
        total = 0
        for tabla in destino_tablas:
            total += _copiar_tabla(
                connection, source_engine, origen_tablas.get(tabla.name), tabla
            )
        _reiniciar_secuencias(connection, destino_tablas)

    print(f"Migración completada: {total} filas procesadas.")
    source_engine.dispose()


if __name__ == "__main__":
    main()
