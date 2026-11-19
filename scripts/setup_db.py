"""
AquaPlants - Script de Inicialización de Base de Datos PostgreSQL
Ejecutar: python scripts/setup_db.py
"""
import argparse
import os
import random
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from backend.database import engine, init_db
from backend.models import (
    Alerta,
    Cultivo,
    Dispositivo,
    Instalacion,
    Medicion,
    Umbral,
    Usuario,
)
from backend.security import get_password_hash

DEFAULT_UMBRALES = [
    {
        "variable": "temperatura",
        "nombre": "Temperatura",
        "unidad": "°C",
        "valor_maximo": 30.0,
        "descripcion": "Temperatura máxima del aire para cultivos hidropónicos.",
    },
    {
        "variable": "humedad",
        "nombre": "Humedad relativa",
        "unidad": "%",
        "valor_minimo": 40.0,
        "descripcion": "Humedad relativa mínima recomendada.",
    },
    {
        "variable": "nivel_agua",
        "nombre": "Nivel de agua",
        "unidad": "%",
        "valor_minimo": 20.0,
        "descripcion": "Nivel mínimo del depósito antes de reponer agua.",
    },
    {
        "variable": "ph",
        "nombre": "pH de la solución",
        "unidad": "pH",
        "valor_minimo": 5.5,
        "valor_maximo": 7.5,
        "descripcion": "Rango de pH aceptable para absorción de nutrientes.",
    },
    {
        "variable": "conductividad",
        "nombre": "Conductividad eléctrica",
        "unidad": "µS/cm",
        "valor_maximo": 2000.0,
        "descripcion": "Conductividad máxima de la solución nutritiva.",
    },
]


def verify_database_connection():
    """Verify that the configured PostgreSQL database is reachable."""
    print("Conectando a PostgreSQL...")
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    print("Conexión a PostgreSQL verificada")


def create_tables():
    """Crea las tablas y aplica migraciones aditivas."""
    print("Creando tablas...")
    init_db()
    print("Tablas creadas correctamente")


def seed_data():
    """Inserta datos de demostración sin credenciales embebidas."""
    print("Insertando datos de demostración...")

    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        if db.query(Usuario).count() > 0:
            print("Ya existen datos en la base de datos. Saltando inserción.")
            return

        admin_username = os.getenv("AQUAPLANTS_ADMIN_USERNAME", "").strip()
        admin_email = os.getenv("AQUAPLANTS_ADMIN_EMAIL", "").strip()
        admin_password = os.getenv("AQUAPLANTS_ADMIN_PASSWORD", "")
        if not admin_username or not admin_email or len(admin_password) < 12:
            raise RuntimeError(
                "Configura AQUAPLANTS_ADMIN_USERNAME, AQUAPLANTS_ADMIN_EMAIL y "
                "AQUAPLANTS_ADMIN_PASSWORD (mínimo 12 caracteres) en .env."
            )

        admin = Usuario(
            email=admin_email,
            username=admin_username,
            hashed_password=get_password_hash(admin_password),
            nombre_completo="Administrador Principal",
            rol="administrador",
            activo=True,
        )
        db.add(admin)
        db.flush()
        print("1 usuario administrador creado")

        instalaciones = [
            Instalacion(
                nombre="Invernadero A",
                ubicacion="Sector norte",
                descripcion="Nave principal de cultivo hidropónico.",
                area_m2=120.0,
            ),
            Instalacion(
                nombre="Invernadero B",
                ubicacion="Sector sur",
                descripcion="Nave de experimentación y cosecha.",
                area_m2=80.0,
            ),
        ]
        db.add_all(instalaciones)
        db.flush()
        print(f"{len(instalaciones)} instalaciones creadas")

        cultivos = [
            Cultivo(
                nombre="Lechuga Romana",
                ubicacion="Invernadero A",
                tipo_planta="Lechuga",
                estado="activo",
                area_m2=25.0,
                instalacion_id=instalaciones[0].id,
            ),
            Cultivo(
                nombre="Albahaca Genovesa",
                ubicacion="Módulo 3",
                tipo_planta="Hierba",
                estado="activo",
                area_m2=10.0,
                instalacion_id=instalaciones[0].id,
            ),
            Cultivo(
                nombre="Tomate Cherry",
                ubicacion="Invernadero B",
                tipo_planta="Tomate",
                estado="cosecha",
                area_m2=30.0,
                instalacion_id=instalaciones[1].id,
            ),
            Cultivo(
                nombre="Espinaca Baby",
                ubicacion="Módulo 1",
                tipo_planta="Espinaca",
                estado="activo",
                area_m2=15.0,
                instalacion_id=instalaciones[1].id,
            ),
            Cultivo(
                nombre="Pepino Holandés",
                ubicacion="Invernadero B",
                tipo_planta="Pepino",
                estado="activo",
                area_m2=20.0,
                instalacion_id=instalaciones[1].id,
            ),
        ]
        db.add_all(cultivos)
        db.flush()
        print(f"{len(cultivos)} cultivos creados")

        dispositivos = [
            Dispositivo(
                nombre="Sensor temperatura A",
                tipo="sensor",
                modelo="TH-100",
                direccion_mac="02:00:00:00:00:01",
                instalacion_id=instalaciones[0].id,
                estado="activo",
            ),
            Dispositivo(
                nombre="Sensor humedad A",
                tipo="sensor",
                modelo="HM-200",
                direccion_mac="02:00:00:00:00:02",
                instalacion_id=instalaciones[0].id,
                estado="activo",
            ),
            Dispositivo(
                nombre="Controlador de riego B",
                tipo="controlador",
                modelo="IR-300",
                direccion_mac="02:00:00:00:00:03",
                instalacion_id=instalaciones[1].id,
                estado="activo",
            ),
        ]
        db.add_all(dispositivos)
        print(f"{len(dispositivos)} dispositivos creados")

        if db.query(Umbral).count() == 0:
            db.add_all(Umbral(**datos) for datos in DEFAULT_UMBRALES)
            print(f"{len(DEFAULT_UMBRALES)} umbrales globales creados")

        now = datetime.now()
        mediciones = []
        for cultivo in cultivos:
            for day in range(7):
                for hour in (6, 12, 18, 23):
                    fecha = now - timedelta(days=day, hours=abs(now.hour - hour))
                    mediciones.append(
                        Medicion(
                            cultivo_id=cultivo.id,
                            temperatura=round(random.uniform(18, 32), 1),
                            humedad=round(random.uniform(40, 80), 1),
                            nivel_agua=round(random.uniform(30, 95), 1),
                            ph=round(random.uniform(5.5, 7.0), 1),
                            conductividad=round(random.uniform(600, 1800), 1),
                            fecha_hora=fecha,
                        )
                    )
        db.add_all(mediciones)
        print(f"{len(mediciones)} mediciones creadas")

        alertas = [
            Alerta(
                cultivo_id=cultivos[0].id,
                tipo="temperatura",
                severidad="critical",
                mensaje="Temperatura crítica: 35.2°C",
                valor_detectado=35.2,
                umbral=30.0,
                leida=False,
                fecha_hora=now - timedelta(hours=2),
            ),
            Alerta(
                cultivo_id=cultivos[1].id,
                tipo="humedad",
                severidad="warning",
                mensaje="Humedad baja: 38%",
                valor_detectado=38.0,
                umbral=40.0,
                leida=False,
                fecha_hora=now - timedelta(hours=4),
            ),
            Alerta(
                cultivo_id=cultivos[2].id,
                tipo="nivel_agua",
                severidad="critical",
                mensaje="Nivel de agua crítico: 15%",
                valor_detectado=15.0,
                umbral=20.0,
                leida=False,
                fecha_hora=now - timedelta(hours=6),
            ),
            Alerta(
                cultivo_id=cultivos[3].id,
                tipo="temperatura",
                severidad="info",
                mensaje="Temperatura elevada: 28.5°C",
                valor_detectado=28.5,
                umbral=27.0,
                leida=True,
                fecha_hora=now - timedelta(days=1),
            ),
        ]
        db.add_all(alertas)
        print(f"{len(alertas)} alertas creadas")

        db.commit()
        print("Datos de demostración insertados correctamente")

    except Exception as exc:
        db.rollback()
        print(f"Error: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inicializa PostgreSQL para AquaPlants.")
    parser.add_argument(
        "--schema-only",
        action="store_true",
        help="Crea el esquema sin insertar datos de demostración.",
    )
    args = parser.parse_args()

    print("=" * 50)
    print("AquaPlants - Setup de Base de Datos PostgreSQL")
    print("=" * 50)

    verify_database_connection()
    create_tables()
    if not args.schema_only:
        seed_data()

    print("=" * 50)
    print("¡Setup completado! Ya puedes iniciar el servidor:")
    print("  uvicorn main:app --reload --port 8000")
    print("=" * 50)
