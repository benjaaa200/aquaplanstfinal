# Acceso y credenciales

No existen credenciales de demostración publicadas en el repositorio.

Para una base nueva, configura un usuario administrador mediante las variables `AQUAPLANTS_ADMIN_USERNAME`, `AQUAPLANTS_ADMIN_EMAIL` y `AQUAPLANTS_ADMIN_PASSWORD` en `.env` antes de ejecutar `python scripts\setup_db.py`. Usa una contraseña única de al menos 12 caracteres y elimina esas variables de cualquier historial o entorno compartido después de inicializar.

En bases ya inicializadas, crea y administra cuentas autenticándote con un usuario administrador. Si una contraseña o secreto estuvo guardado en un archivo compartido, rótalo antes de desplegar.
