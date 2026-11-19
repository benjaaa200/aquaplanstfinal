# Contribuir a AquaPlants

## Entorno

1. Crea y activa un entorno virtual con Python 3.10 o superior.
2. Instala `requirements-dev.txt`.
3. Copia `.env.example` a `.env` y define `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SECRET_KEY` (mínimo 32 caracteres) y `CORS_ORIGINS`.
4. Para una base vacía, define `AQUAPLANTS_ADMIN_USERNAME`, `AQUAPLANTS_ADMIN_EMAIL` y `AQUAPLANTS_ADMIN_PASSWORD` y ejecuta `python scripts/setup_db.py`.

## Flujo de trabajo

- Mantén la API FastAPI (`main.py`) y el frontend estático (`pages/`, `js/`, `css/`) como única arquitectura oficial.
- No publiques credenciales, tokens ni archivos `.env`.
- No agregues datos de demostración ni mocks al frontend: todas las pantallas consumen la API.
- Autoriza en el backend; ocultar controles en el navegador es solo una mejora de experiencia.
- Respeta la prioridad de umbrales global < instalación < cultivo y el alcance de datos por rol.

## Verificación

```powershell
python -m pytest -q
python -m compileall backend main.py scripts
```

La suite usa SQLite en memoria y no modifica PostgreSQL. Documenta los cambios de comportamiento en `docs/plan-pruebas.md` y `CHANGELOG.md`.
