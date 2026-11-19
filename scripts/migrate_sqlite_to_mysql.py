"""
Script para migrar datos de SQLite a MySQL
Ejecutar: python scripts/migrate_sqlite_to_mysql.py
"""
import sqlite3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.config import DATABASE_URL
from backend.models import Base, Usuario, Cultivo, Medicion, Alerta
from backend.security import get_password_hash

def migrate_data():
    print(" Iniciando migración de SQLite a MySQL...")
    
    # Conectar a SQLite
    sqlite_conn = sqlite3.connect('aquaplants.db')
    sqlite_cursor = sqlite_conn.cursor()
    
    # Conectar a MySQL
    mysql_engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=mysql_engine)
    MySQLSession = sessionmaker(bind=mysql_engine)
    mysql_session = MySQLSession()
    
    try:
        # Migrar usuarios
        print(" Migrando usuarios...")
        sqlite_cursor.execute("SELECT * FROM usuarios")
        for row in sqlite_cursor.fetchall():
            user = Usuario(
                email=row[1],
                username=row[2],
                hashed_password=row[3],
                nombre_completo=row[4],
                rol=row[5],
                activo=row[6]
            )
            mysql_session.add(user)
        
        # Migrar cultivos
        print(" Migrando cultivos...")
        sqlite_cursor.execute("SELECT * FROM cultivos")
        for row in sqlite_cursor.fetchall():
            cultivo = Cultivo(
                nombre=row[1],
                ubicacion=row[2],
                tipo_planta=row[3],
                fecha_inicio=row[4],
                estado=row[5]
            )
            mysql_session.add(cultivo)
        
        # Migrar mediciones
        print("Migrando mediciones...")
        sqlite_cursor.execute("SELECT * FROM mediciones")
        for row in sqlite_cursor.fetchall():
            medicion = Medicion(
                cultivo_id=row[1],
                temperatura=row[2],
                humedad=row[3],
                nivel_agua=row[4],
                fecha_hora=row[5]
            )
            mysql_session.add(medicion)
        
        # Migrar alertas
        print(" Migrando alertas...")
        sqlite_cursor.execute("SELECT * FROM alertas")
        for row in sqlite_cursor.fetchall():
            alerta = Alerta(
                cultivo_id=row[1],
                tipo=row[2],
                severidad=row[3],
                mensaje=row[4],
                leida=row[5],
                fecha_hora=row[6]
            )
            mysql_session.add(alerta)
        
        mysql_session.commit()
        print("Migración completada exitosamente!")
        
    except Exception as e:
        mysql_session.rollback()
        print(f"❌ Error durante la migración: {e}")
    finally:
        sqlite_conn.close()
        mysql_session.close()

if __name__ == "__main__":
    migrate_data()