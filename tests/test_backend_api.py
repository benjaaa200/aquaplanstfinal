from datetime import datetime, time, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.cache import (
    login_identifier_limiter,
    login_ip_limiter,
    reset_identifier_limiter,
    reset_ip_limiter,
    reset_link_ip_limiter,
)
from backend.database import (
    Base,
    ensure_alert_resolution_columns,
    ensure_crop_installation_column,
    ensure_usuario_login_attempts_column,
    get_db,
)
from backend.models import (
    Alerta,
    Cultivo,
    Instalacion,
    Medicion,
    ProgramacionRiego,
    Riego,
    Usuario,
    UsuarioCultivo,
    ZonaRiego,
)
from backend.security import create_access_token, get_password_hash
from main import app


TEST_PASSWORD = "aqua-test-password-123"


@pytest.fixture
def api(monkeypatch):
    for limiter in (
        login_identifier_limiter,
        login_ip_limiter,
        reset_identifier_limiter,
        reset_ip_limiter,
        reset_link_ip_limiter,
    ):
        limiter.clear()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = test_session()

    users = [
        Usuario(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash(TEST_PASSWORD),
            nombre_completo="Test Admin",
            rol="admin",
            activo=True,
        ),
        Usuario(
            username="supervisor",
            email="supervisor@example.com",
            hashed_password=get_password_hash(TEST_PASSWORD),
            nombre_completo="Test Supervisor",
            rol="supervisor",
            activo=True,
        ),
        Usuario(
            username="encargado",
            email="encargado@example.com",
            hashed_password=get_password_hash(TEST_PASSWORD),
            nombre_completo="Test Encargado",
            rol="encargado",
            activo=True,
        ),
        Usuario(
            username="sin-asignacion",
            email="sin-asignacion@example.com",
            hashed_password=get_password_hash(TEST_PASSWORD),
            nombre_completo="Test Unassigned",
            rol="encargado",
            activo=True,
        ),
    ]
    crops = [
        Cultivo(nombre="Cultivo asignado", estado="activo"),
        Cultivo(nombre="Cultivo privado", estado="activo"),
    ]
    db.add_all(users + crops)
    db.flush()
    db.add(UsuarioCultivo(usuario_id=users[2].id, cultivo_id=crops[0].id))
    watering_time = datetime.now(timezone.utc).replace(tzinfo=None)
    for crop in crops:
        db.add(
            Medicion(
                cultivo_id=crop.id,
                temperatura=22,
                humedad=65,
                nivel_agua=40,
                fecha_hora=datetime(2026, 1, 1),
            )
        )
        db.add(
            Alerta(
                cultivo_id=crop.id,
                tipo="temperatura",
                severidad="warning",
                mensaje="Alerta de prueba",
                valor_detectado=31,
                umbral=30,
                leida=False,
                fecha_hora=datetime(2026, 1, 1),
            )
        )
        db.add(
            Riego(
                cultivo_id=crop.id,
                zona=f"Zona {crop.nombre}",
                tipo="manual",
                duracion_minutos=10,
                consumo_litros=2.5,
                fecha_inicio=watering_time,
                estado="completado",
            )
        )
    db.commit()
    db.close()

    def override_get_db():
        session = test_session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr("main.init_db", lambda: None)
    monkeypatch.setattr("main.engine", engine)
    try:
        with TestClient(app) as client:
            tokens = {}
            for username in ("admin", "supervisor", "encargado", "sin-asignacion"):
                response = client.post(
                    "/api/auth/login",
                    data={"username": username, "password": TEST_PASSWORD},
                )
                assert response.status_code == 200
                tokens[username] = response.json()["access_token"]
            yield client, tokens
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_root_is_available(api):
    client, _ = api
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["docs"] == "/docs"


def test_installation_device_crud_and_reference_protection(api):
    client, tokens = api
    auth = headers(tokens["admin"])
    installation = client.post(
        "/api/instalaciones/",
        headers=auth,
        json={
            "nombre": "Invernadero norte",
            "ubicacion": "Sector A",
            "area_m2": 25,
        },
    )
    assert installation.status_code == 201
    installation_id = installation.json()["id"]
    assert installation.json()["cultivos_count"] == 0
    assert client.patch(
        f"/api/instalaciones/{installation_id}/estado",
        headers=auth,
        json={"activa": False},
    ).json()["activa"] is False
    assert client.put(
        f"/api/instalaciones/{installation_id}",
        headers=auth,
        json={"ubicacion": "Sector B"},
    ).json()["ubicacion"] == "Sector B"

    crop = client.post(
        "/api/cultivos/",
        headers=auth,
        json={
            "nombre": "Lechuga",
            "ubicacion": "Sector A",
            "fecha_inicio": "2026-01-01T00:00:00",
            "instalacion_id": installation_id,
        },
    )
    assert crop.status_code == 201

    device = client.post(
        "/api/dispositivos/",
        headers=auth,
        json={
            "nombre": "Sensor de humedad",
            "tipo": "sensor",
            "direccion_mac": "aa-bb-cc-dd-ee-ff",
            "instalacion_id": installation_id,
        },
    )
    assert device.status_code == 201
    assert device.json()["instalacion_nombre"] == "Invernadero norte"
    assert device.json()["direccion_mac"] == "AA:BB:CC:DD:EE:FF"
    assert device.json()["ultimaconexion"] is None
    duplicate_mac = client.post(
        "/api/dispositivos/",
        headers=auth,
        json={
            "nombre": "Otro sensor",
            "tipo": "sensor",
            "direccion_mac": "AA:BB:CC:DD:EE:FF",
        },
    )
    assert duplicate_mac.status_code == 409

    updated = client.put(
        f"/api/dispositivos/{device.json()['id']}",
        headers=auth,
        json={"modelo": "S-01"},
    )
    assert updated.status_code == 200
    assert updated.json()["modelo"] == "S-01"
    assert client.patch(
        f"/api/dispositivos/{device.json()['id']}/estado",
        headers=auth,
        json={"estado": "inactivo"},
    ).json()["estado"] == "inactivo"

    listed_installation = client.get("/api/instalaciones/", headers=auth).json()[0]
    assert listed_installation["cultivos_count"] == 1
    assert listed_installation["dispositivos_count"] == 1
    stats = client.get("/api/admin/estadisticas", headers=auth)
    assert stats.status_code == 200
    assert stats.json()["total_dispositivos"] == 1

    blocked = client.delete(f"/api/instalaciones/{installation_id}", headers=auth)
    assert blocked.status_code == 409
    assert client.delete(
        f"/api/dispositivos/{device.json()['id']}", headers=auth
    ).status_code == 204
    assert client.delete(
        f"/api/cultivos/{crop.json()['id']}", headers=auth
    ).status_code == 204
    assert client.delete(
        f"/api/instalaciones/{installation_id}", headers=auth
    ).status_code == 204


def test_installation_and_device_endpoints_enforce_roles_and_validation(api):
    client, tokens = api
    assert client.get("/api/instalaciones/").status_code == 401
    assert client.get(
        "/api/instalaciones/",
        headers=headers(tokens["supervisor"]),
    ).status_code == 200
    assert client.get(
        "/api/dispositivos/",
        headers=headers(tokens["encargado"]),
    ).status_code == 200
    assert client.post(
        "/api/instalaciones/",
        headers=headers(tokens["supervisor"]),
        json={"nombre": "No autorizado"},
    ).status_code == 403

    auth = headers(tokens["admin"])
    assert client.post(
        "/api/dispositivos/",
        headers=auth,
        json={"nombre": "MAC inválida", "tipo": "sensor", "direccion_mac": "bad"},
    ).status_code == 422
    assert client.post(
        "/api/dispositivos/",
        headers=auth,
        json={
            "nombre": "Instalación inexistente",
            "tipo": "sensor",
            "instalacion_id": 9999,
        },
    ).status_code == 422


def test_crop_installation_migration_is_additive_and_idempotent():
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE cultivos (id INTEGER PRIMARY KEY, nombre VARCHAR(255))"
            )
            connection.exec_driver_sql(
                "INSERT INTO cultivos (id, nombre) VALUES (1, 'Existente')"
            )

        ensure_crop_installation_column(engine)
        ensure_crop_installation_column(engine)

        inspector = inspect(engine)
        assert "instalacion_id" in {
            column["name"] for column in inspector.get_columns("cultivos")
        }
        assert "idx_cultivos_instalacion_id" in {
            index["name"] for index in inspector.get_indexes("cultivos")
        }
        with engine.connect() as connection:
            assert connection.exec_driver_sql(
                "SELECT nombre FROM cultivos WHERE id = 1"
            ).scalar_one() == "Existente"
    finally:
        engine.dispose()


def test_usuario_login_attempts_migration_is_additive_and_idempotent():
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE usuarios (id INTEGER PRIMARY KEY, username VARCHAR(100))"
            )
            connection.exec_driver_sql(
                "INSERT INTO usuarios (id, username) VALUES (1, 'Existente')"
            )

        ensure_usuario_login_attempts_column(engine)
        ensure_usuario_login_attempts_column(engine)

        inspector = inspect(engine)
        assert "intentos_login_maximos" in {
            column["name"] for column in inspector.get_columns("usuarios")
        }
        with engine.connect() as connection:
            assert connection.exec_driver_sql(
                "SELECT intentos_login_maximos FROM usuarios WHERE id = 1"
            ).scalar_one() == 5
    finally:
        engine.dispose()


def test_health_checks_database(api):
    client, _ = api
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_rejects_invalid_password(api):
    client, _ = api
    response = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "incorrect-password"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales inválidas"


def test_users_endpoint_requires_admin(api):
    client, tokens = api
    assert client.get("/api/usuarios/").status_code == 401
    response = client.get(
        "/api/usuarios/",
        headers=headers(tokens["supervisor"]),
    )
    assert response.status_code == 403


def test_admin_can_list_users_without_password_hashes(api):
    client, tokens = api
    response = client.get(
        "/api/usuarios/",
        headers=headers(tokens["admin"]),
    )
    assert response.status_code == 200
    assert len(response.json()) == 4
    assert all("hashed_password" not in user for user in response.json())


def test_admin_user_creation_validates_password_and_normalizes_role(api):
    client, tokens = api
    endpoint = "/api/usuarios/"
    auth = headers(tokens["admin"])
    user = {
        "username": "new-admin",
        "email": "new-admin@example.com",
        "nombre_completo": "New Admin",
        "password": TEST_PASSWORD,
        "rol": "admin",
        "activo": False,
    }

    weak_user = {**user, "password": "short"}
    assert client.post(endpoint, json=weak_user, headers=auth).status_code == 422

    response = client.post(endpoint, json=user, headers=auth)
    assert response.status_code == 201, response.json()
    users = client.get(endpoint, headers=auth).json()
    created = next(record for record in users if record["username"] == "new-admin")
    assert created["rol"] == "administrador"
    assert created["activo"] is False
    assert "hashed_password" not in created


def test_encargado_only_sees_assigned_crops_and_measurements(api):
    client, tokens = api
    auth = headers(tokens["encargado"])
    crops = client.get("/api/cultivos/", headers=auth)
    measurements = client.get("/api/mediciones/", headers=auth)
    alerts = client.get("/api/alertas/", headers=auth)

    assert crops.status_code == 200
    assert [crop["nombre"] for crop in crops.json()] == ["Cultivo asignado"]
    assert measurements.status_code == 200
    assert len(measurements.json()) == 1
    assert alerts.status_code == 200
    assert len(alerts.json()) == 1
    assert alerts.json()[0]["cultivo_nombre"] == "Cultivo asignado"


def test_historical_measurements_are_registered_and_scoped(api):
    client, tokens = api
    response = client.get(
        "/api/historicos/",
        params={
            "start": "2025-01-01T00:00:00",
            "end": "2027-01-01T00:00:00",
        },
        headers=headers(tokens["encargado"]),
    )
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_irrigation_zones_only_include_accessible_crops(api):
    client, tokens = api
    response = client.get(
        "/api/riego/zonas",
        headers=headers(tokens["encargado"]),
    )
    assert response.status_code == 200
    assert len(response.json()) == 1
    zone = response.json()[0]
    assert zone["cultivo_nombre"] == "Cultivo asignado"
    assert zone["activa"] is True
    assert zone["consumo_hoy"] == 2.5
    assert zone["eficiencia"] is None


def test_irrigation_history_contains_real_records_for_assigned_crops(api):
    client, tokens = api
    response = client.get(
        "/api/riego/historial",
        headers=headers(tokens["encargado"]),
    )
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["zona"] == "Zona Cultivo asignado"
    assert response.json()[0]["consumo"] == 2.5


def test_irrigation_schedule_is_persisted_and_zone_disable_cancels_it(api):
    client, tokens = api
    auth = headers(tokens["encargado"])
    zone = client.get("/api/riego/zonas", headers=auth).json()[0]
    endpoint = "/api/riego/programar"
    payload = {
        "zona_id": zone["id"],
        "hora_inicio": "06:30",
        "duracion": 20,
        "frecuencia": "diario",
    }

    denied = client.post(
        endpoint,
        headers=headers(tokens["sin-asignacion"]),
        json=payload,
    )
    assert denied.status_code == 403

    invalid = client.post(endpoint, headers=auth, json={**payload, "duracion": 121})
    assert invalid.status_code == 422

    created = client.post(endpoint, headers=auth, json=payload)
    assert created.status_code == 201
    assert created.json()["hora_inicio"] == "06:30"
    assert "no se ejecutará físicamente" in created.json()["mensaje"]

    refreshed = client.get("/api/riego/zonas", headers=auth).json()[0]
    assert refreshed["duracion_programada"] == 20
    assert refreshed["ciclos_programados"] == 1
    db = next(app.dependency_overrides[get_db]())
    try:
        assert db.query(ProgramacionRiego).count() == 1
        assert db.query(ZonaRiego).count() == 1
        assert db.query(Riego).count() == 2
    finally:
        db.close()

    disabled = client.put(
        f"/api/riego/zonas/{zone['id']}",
        headers=auth,
        json={"activa": False},
    )
    assert disabled.status_code == 200
    inactive_schedule = client.post(endpoint, headers=auth, json=payload)
    assert inactive_schedule.status_code == 409
    refreshed = client.get("/api/riego/zonas", headers=auth).json()[0]
    assert refreshed["activa"] is False
    assert refreshed["ciclos_programados"] == 0


def test_supervisor_can_see_all_crops(api):
    client, tokens = api
    response = client.get(
        "/api/cultivos/",
        headers=headers(tokens["supervisor"]),
    )
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_encargado_without_assignments_sees_no_crops(api):
    client, tokens = api
    response = client.get(
        "/api/cultivos/",
        headers=headers(tokens["sin-asignacion"]),
    )
    assert response.status_code == 200
    assert response.json() == []


def test_admin_can_assign_crops_to_encargado(api):
    client, tokens = api
    admin_headers = headers(tokens["admin"])
    encargado_headers = headers(tokens["encargado"])
    users = client.get("/api/usuarios/", headers=admin_headers).json()
    encargado = next(user for user in users if user["username"] == "encargado")
    crops = client.get("/api/cultivos/", headers=admin_headers).json()
    assigned_crop_id = next(
        crop["id"] for crop in crops if crop["nombre"] == "Cultivo privado"
    )
    endpoint = f"/api/usuarios/{encargado['id']}/cultivos"

    assert client.get(endpoint, headers=headers(tokens["supervisor"])).status_code == 403
    response = client.put(
        endpoint,
        headers=admin_headers,
        json={"cultivo_ids": [assigned_crop_id, assigned_crop_id]},
    )
    assert response.status_code == 422

    response = client.put(
        endpoint,
        headers=admin_headers,
        json={"cultivo_ids": [assigned_crop_id]},
    )
    assert response.status_code == 200
    assert response.json()["cultivo_ids"] == [assigned_crop_id]

    visible_crops = client.get(
        "/api/cultivos/",
        headers=encargado_headers,
    ).json()
    assert [crop["id"] for crop in visible_crops] == [assigned_crop_id]


def test_encargado_cannot_access_unassigned_crop_or_alert(api):
    client, tokens = api
    auth = headers(tokens["encargado"])
    db = next(app.dependency_overrides[get_db]())
    try:
        private_crop = db.query(Cultivo).filter_by(nombre="Cultivo privado").one()
        private_alert = db.query(Alerta).filter_by(cultivo_id=private_crop.id).one()
        private_crop_id = private_crop.id
        private_alert_id = private_alert.id
    finally:
        db.close()

    response = client.post(
        "/api/mediciones/",
        headers=auth,
        json={
            "cultivo_id": private_crop_id,
            "temperatura": 22,
            "humedad": 60,
            "nivel_agua": 30,
        },
    )
    assert response.status_code == 403

    response = client.put(
        f"/api/alertas/{private_alert_id}/leer",
        headers=auth,
    )
    assert response.status_code == 403
    response = client.put(
        f"/api/alertas/{private_alert_id}/resolver",
        headers=auth,
    )
    assert response.status_code == 403


def test_alert_can_be_marked_read_without_being_resolved(api):
    client, tokens = api
    response = client.get(
        "/api/alertas/",
        headers=headers(tokens["encargado"]),
    )
    alert_id = response.json()[0]["id"]

    read_response = client.put(
        f"/api/alertas/{alert_id}/leer",
        headers=headers(tokens["encargado"]),
    )
    assert read_response.status_code == 200
    assert read_response.json()["leida"] is True
    assert read_response.json()["resuelta"] is False
    assert read_response.json()["fecha_lectura"] is not None
    assert read_response.json()["fecha_resolucion"] is None


def test_resolving_alert_sets_persisted_state_and_is_idempotent(api):
    client, tokens = api
    auth = headers(tokens["encargado"])
    alert_id = client.get("/api/alertas/", headers=auth).json()[0]["id"]
    endpoint = f"/api/alertas/{alert_id}/resolver"

    response = client.put(endpoint, headers=auth)
    assert response.status_code == 200
    resolved = response.json()
    assert resolved["leida"] is True
    assert resolved["resuelta"] is True
    assert resolved["fecha_lectura"] is not None
    assert resolved["fecha_resolucion"] is not None

    repeated = client.put(endpoint, headers=auth)
    assert repeated.status_code == 200
    assert repeated.json()["fecha_resolucion"] == resolved["fecha_resolucion"]


def test_mark_all_as_read_only_updates_alerts_for_assigned_crops(api):
    client, tokens = api
    response = client.put(
        "/api/alertas/marcar-todas",
        headers=headers(tokens["encargado"]),
    )
    assert response.status_code == 200
    assert response.json()["updated"] == 1
    assert response.json()["message"] == "1 alertas marcadas como leídas"

    visible = client.get(
        "/api/alertas/",
        headers=headers(tokens["encargado"]),
    ).json()
    assert len(visible) == 1
    assert visible[0]["leida"] is True


def test_alert_resolution_migration_adds_missing_columns_idempotently():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE alertas (id INTEGER PRIMARY KEY)"
            )
            connection.exec_driver_sql(
                "INSERT INTO alertas (id) VALUES (1)"
            )

        ensure_alert_resolution_columns(engine)
        ensure_alert_resolution_columns(engine)

        column_names = {
            column["name"] for column in inspect(engine).get_columns("alertas")
        }
        assert {"resuelta", "fecha_resolucion"} <= column_names
        with engine.connect() as connection:
            state = connection.exec_driver_sql(
                "SELECT resuelta, fecha_resolucion FROM alertas WHERE id = 1"
            ).fetchone()
            assert tuple(state) == (0, None)
    finally:
        engine.dispose()


def test_postgresql_boolean_server_defaults_use_boolean_literals():
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable

    dialect = postgresql.dialect()
    installation_ddl = str(
        CreateTable(Instalacion.__table__).compile(dialect=dialect)
    )
    alert_ddl = str(CreateTable(Alerta.__table__).compile(dialect=dialect))

    assert "activa BOOLEAN DEFAULT true NOT NULL" in installation_ddl
    assert "resuelta BOOLEAN DEFAULT false NOT NULL" in alert_ddl


def test_security_headers_are_present(api):
    client, _ = api
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"


def test_current_user_profile_and_password_change(api):
    client, tokens = api
    auth = headers(tokens["encargado"])
    profile = client.get("/api/auth/me", headers=auth)
    assert profile.status_code == 200
    assert profile.json()["username"] == "encargado"
    assert "hashed_password" not in profile.json()

    new_password = "nueva-clave-segura-123"
    changed = client.put(
        "/api/auth/change-password",
        headers=auth,
        json={
            "current_password": TEST_PASSWORD,
            "new_password": new_password,
        },
    )
    assert changed.status_code == 200
    nuevo_token = client.post(
        "/api/auth/login",
        data={"username": "encargado", "password": new_password},
    ).json()["access_token"]
    assert client.get("/api/auth/me", headers=auth).status_code == 401
    assert client.put(
        "/api/auth/change-password",
        headers=headers(nuevo_token),
        json={
            "current_password": "incorrecta",
            "new_password": "otra-clave-segura-123",
        },
    ).status_code == 400


def test_current_user_can_update_own_profile(api):
    client, tokens = api
    auth = headers(tokens["encargado"])

    updated = client.put(
        "/api/auth/me",
        headers=auth,
        json={
            "nombre_completo": "Encargado Actualizado",
            "email": "encargado.nuevo@example.com",
            "email_respaldo": "respaldo@example.com",
            "telefono_respaldo": "+56 9 1234 5678",
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["nombre_completo"] == "Encargado Actualizado"
    assert body["email"] == "encargado.nuevo@example.com"
    assert body["email_respaldo"] == "respaldo@example.com"
    assert body["telefono_respaldo"] == "+56 9 1234 5678"
    assert "hashed_password" not in body

    conflict = client.put(
        "/api/auth/me",
        headers=auth,
        json={"email": "admin@example.com"},
    )
    assert conflict.status_code == 409

    admin_auth = headers(tokens["admin"])
    admin_backup = client.put(
        "/api/auth/me",
        headers=admin_auth,
        json={"email_respaldo": "respaldo-admin@example.com"},
    )
    assert admin_backup.status_code == 200

    backup_conflict = client.put(
        "/api/auth/me",
        headers=auth,
        json={"email_respaldo": "respaldo-admin@example.com"},
    )
    assert backup_conflict.status_code == 409

    cleared = client.put(
        "/api/auth/me",
        headers=auth,
        json={"email_respaldo": None, "telefono_respaldo": "  "},
    )
    assert cleared.status_code == 200
    assert cleared.json()["email_respaldo"] is None
    assert cleared.json()["telefono_respaldo"] is None

    admin_update = client.put(
        "/api/auth/me",
        headers=admin_auth,
        json={"rol": "encargado", "activo": False},
    )
    assert admin_update.status_code == 200
    assert admin_update.json()["rol"] == "admin"
    assert admin_update.json()["activo"] is True


def test_password_recovery_flow(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(
        "backend.routers.auth._nuevo_codigo", lambda: "123456"
    )
    enviados = []
    monkeypatch.setattr(
        "backend.routers.auth.enviar_codigo",
        lambda usuario, codigo, canal: enviados.append(
            (usuario.username, codigo, canal)
        ) or True,
    )

    unknown = client.post(
        "/api/auth/forgot-password", json={"identificador": "no-existe"}
    )
    assert unknown.status_code == 200
    assert "Si los datos" in unknown.json()["message"]
    assert not enviados

    solicitud = client.post(
        "/api/auth/forgot-password", json={"identificador": "encargado"}
    )
    assert solicitud.status_code == 200
    assert enviados and enviados[-1][0] == "encargado"
    assert enviados[-1][1] == "123456"

    wrong = client.post(
        "/api/auth/verify-reset-code",
        json={"identificador": "encargado", "codigo": "000000"},
    )
    assert wrong.status_code == 400

    verified = client.post(
        "/api/auth/verify-reset-code",
        json={"identificador": "encargado", "codigo": "123456"},
    )
    assert verified.status_code == 200
    reset_token = verified.json()["reset_token"]

    reused = client.post(
        "/api/auth/verify-reset-code",
        json={"identificador": "encargado", "codigo": "123456"},
    )
    assert reused.status_code == 400

    new_password = "recuperada-segura-123"
    reset = client.post(
        "/api/auth/reset-password",
        json={"reset_token": reset_token, "new_password": new_password},
    )
    assert reset.status_code == 200

    assert client.post(
        "/api/auth/login",
        data={"username": "encargado", "password": TEST_PASSWORD},
    ).status_code == 401
    assert client.post(
        "/api/auth/login",
        data={"username": "encargado", "password": new_password},
    ).status_code == 200

    replay = client.post(
        "/api/auth/reset-password",
        json={
            "reset_token": reset_token,
            "new_password": "otra-clave-segura-123",
        },
    )
    assert replay.status_code == 400


def test_admin_can_update_and_delete_users_safely(api):
    client, tokens = api
    auth = headers(tokens["admin"])
    created = client.post(
        "/api/usuarios/",
        headers=auth,
        json={
            "username": "temporal",
            "email": "temporal@example.com",
            "nombre_completo": "Usuario Temporal",
            "password": TEST_PASSWORD,
            "rol": "encargado",
        },
    )
    assert created.status_code == 201
    user_id = created.json()["user_id"]

    updated = client.put(
        f"/api/usuarios/{user_id}",
        headers=auth,
        json={"nombre_completo": "Usuario Actualizado", "activo": False},
    )
    assert updated.status_code == 200
    assert updated.json()["nombre_completo"] == "Usuario Actualizado"
    assert updated.json()["activo"] is False

    admin_id = client.get("/api/auth/me", headers=auth).json()["id"]
    assert client.delete(f"/api/usuarios/{admin_id}", headers=auth).status_code == 422
    assert client.delete(f"/api/usuarios/{user_id}", headers=auth).status_code == 204
    assert client.delete(f"/api/usuarios/{user_id}", headers=auth).status_code == 404


def test_thresholds_crud_and_alert_generation(api):
    client, tokens = api
    admin_auth = headers(tokens["admin"])
    encargado_auth = headers(tokens["encargado"])
    crop = client.get("/api/cultivos/", headers=encargado_auth).json()[0]

    assert client.get("/api/umbrales/", headers=encargado_auth).status_code == 403

    created = client.post(
        "/api/umbrales/",
        headers=admin_auth,
        json={
            "variable": "temperatura",
            "nombre": "Temperatura máxima de prueba",
            "unidad": "°C",
            "valor_maximo": 25,
            "cultivo_id": crop["id"],
        },
    )
    assert created.status_code == 201, created.json()
    umbral_id = created.json()["id"]
    assert created.json()["cultivo_nombre"] == "Cultivo asignado"

    duplicate = client.post(
        "/api/umbrales/",
        headers=admin_auth,
        json={
            "variable": "temperatura",
            "nombre": "Duplicado",
            "valor_maximo": 28,
            "cultivo_id": crop["id"],
        },
    )
    assert duplicate.status_code == 409
    invalid = client.post(
        "/api/umbrales/",
        headers=admin_auth,
        json={
            "variable": "humedad",
            "nombre": "Rango inválido",
            "valor_minimo": 80,
            "valor_maximo": 20,
        },
    )
    assert invalid.status_code == 422

    measurement = client.post(
        "/api/mediciones/",
        headers=encargado_auth,
        json={
            "cultivo_id": crop["id"],
            "temperatura": 31,
            "humedad": 60,
            "nivel_agua": 50,
            "ph": 6.4,
            "conductividad": 900,
        },
    )
    assert measurement.status_code == 201, measurement.json()
    assert measurement.json()["ph"] == 6.4
    alerts = client.get("/api/alertas/", headers=encargado_auth).json()
    assert any(
        alert["tipo"] == "temperatura" and alert["umbral"] == 25
        for alert in alerts
    )
    notificaciones = client.get(
        "/api/notificaciones/", headers=encargado_auth
    ).json()
    assert any(
        item["categoria"] == "alerta"
        and item["entidad_tipo"] == "alerta"
        for item in notificaciones
    )

    critico = client.post(
        "/api/umbrales/",
        headers=admin_auth,
        json={
            "variable": "humedad",
            "nombre": "Humedad crítica de prueba",
            "unidad": "%",
            "valor_maximo": 65,
            "valor_alerta": 70,
            "cultivo_id": crop["id"],
        },
    )
    assert critico.status_code == 201, critico.json()
    client.post(
        "/api/mediciones/",
        headers=encargado_auth,
        json={
            "cultivo_id": crop["id"],
            "temperatura": 20,
            "humedad": 75,
            "nivel_agua": 50,
            "ph": 6.4,
            "conductividad": 900,
        },
    )
    assert any(
        alert["tipo"] == "humedad" and alert["severidad"] == "critical"
        for alert in client.get("/api/alertas/", headers=encargado_auth).json()
    )
    assert client.delete(
        f"/api/umbrales/{critico.json()['id']}", headers=admin_auth
    ).status_code == 204

    disabled = client.patch(
        f"/api/umbrales/{umbral_id}/estado",
        headers=admin_auth,
        json={"activo": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["activo"] is False
    assert client.delete(
        f"/api/umbrales/{umbral_id}", headers=admin_auth
    ).status_code == 204


def test_reports_summary_export_and_history(api):
    client, tokens = api
    auth = headers(tokens["encargado"])
    params = {
        "tipo": "mediciones",
        "fecha_inicio": "2025-01-01T00:00:00",
        "fecha_fin": "2027-01-01T00:00:00",
    }
    summary = client.get("/api/reportes/resumen", params=params, headers=auth)
    assert summary.status_code == 200, summary.json()
    assert summary.json()["resumen"]["total"] == 1
    assert summary.json()["resumen"]["promedio_temperatura"] == 22

    exported = client.get("/api/reportes/export", params=params, headers=auth)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert "cultivo_id" in exported.text

    invalid = client.get(
        "/api/reportes/resumen",
        params={**params, "tipo": "desconocido"},
        headers=auth,
    )
    assert invalid.status_code == 422

    history = client.post(
        "/api/reportes/historial",
        headers=auth,
        json={
            **params,
            "formato": "csv",
            "total_registros": 1,
            "tamano_bytes": 120,
        },
    )
    assert history.status_code == 201, history.json()
    report_id = history.json()["id"]
    assert history.json()["usuario_nombre"] == "encargado"

    listed = client.get("/api/reportes/historial", headers=auth)
    assert listed.status_code == 200
    assert any(item["id"] == report_id for item in listed.json())

    assert client.delete(
        f"/api/reportes/historial/{report_id}", headers=auth
    ).status_code == 204

def test_operations_modules_flow(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    supervisor = headers(tokens["supervisor"])
    encargado = headers(tokens["encargado"])

    equipo = client.get("/api/equipo/", headers=admin)
    assert equipo.status_code == 200
    encargado_id = next(
        usuario["id"] for usuario in equipo.json() if usuario["username"] == "encargado"
    )

    instalacion = client.post(
        "/api/instalaciones/",
        headers=admin,
        json={"nombre": "Sector Operaciones", "ubicacion": "Norte", "area_m2": 42},
    )
    assert instalacion.status_code == 201
    sector_id = instalacion.json()["id"]

    mapa = client.get("/api/mapa/", headers=admin)
    assert mapa.status_code == 200
    assert mapa.json()["total"] == 1
    config = client.put(
        f"/api/mapa/config/{sector_id}",
        headers=admin,
        json={
            "posicion_x": 1, "posicion_y": 1, "ancho": 3, "alto": 2,
            "tipo_sector": "cultivo", "color": "#123456",
        },
    )
    assert config.status_code == 200
    assert config.json()["ancho"] == 3
    mapa_actualizado = client.get("/api/mapa/", headers=admin)
    assert mapa_actualizado.status_code == 200
    sector = next(
        item for item in mapa_actualizado.json()["sectores"]
        if item["id"] == sector_id
    )
    assert sector["layout"]["ancho"] == 3
    assert sector["layout"]["color"] == "#123456"
    assert client.put(
        f"/api/mapa/config/{sector_id}",
        headers=encargado,
        json={"posicion_x": 0, "posicion_y": 0, "ancho": 1, "alto": 1},
    ).status_code == 403

    tarea = client.post(
        "/api/tareas/",
        headers=admin,
        json={
            "titulo": "Revisar bomba principal",
            "categoria": "mantenimiento",
            "prioridad": "alta",
            "responsable_id": encargado_id,
            "sector_id": sector_id,
            "fecha_limite": "2027-01-01T10:00:00",
        },
    )
    assert tarea.status_code == 201
    tarea_id = tarea.json()["id"]
    assert client.post(
        "/api/tareas/",
        headers=encargado,
        json={"titulo": "No permitida"},
    ).status_code == 403
    propia = client.get("/api/tareas/?mine=true", headers=encargado)
    assert propia.status_code == 200
    assert [item["id"] for item in propia.json()] == [tarea_id]
    estado = client.put(
        f"/api/tareas/{tarea_id}/estado",
        headers=encargado,
        json={"estado": "en_progreso", "comentario": "Iniciando revisión"},
    )
    assert estado.status_code == 200
    assert estado.json()["estado"] == "en_progreso"
    comentario = client.post(
        f"/api/tareas/{tarea_id}/comentarios",
        headers=encargado,
        json={"comentario": "Bomba revisada sin fugas"},
    )
    assert comentario.status_code == 201
    detalle_tarea = client.get(f"/api/tareas/{tarea_id}", headers=admin).json()
    assert len(detalle_tarea["comentarios"]) >= 2
    assert client.get("/api/tareas/resumen", headers=admin).status_code == 200

    incidencia = client.post(
        "/api/incidencias/",
        headers=admin,
        json={
            "titulo": "Humedad elevada",
            "descripcion": "El sensor marca humedad por sobre el umbral.",
            "categoria": "sensores",
            "prioridad": "media",
        },
    )
    assert incidencia.status_code == 201
    incidencia_id = incidencia.json()["id"]
    asignada = client.put(
        f"/api/incidencias/{incidencia_id}",
        headers=admin,
        json={"asignado_a": encargado_id},
    )
    assert asignada.status_code == 200
    assert asignada.json()["asignado_a"] == encargado_id
    visibles = client.get("/api/incidencias/", headers=encargado).json()
    assert any(item["id"] == incidencia_id for item in visibles)
    resuelta = client.put(
        f"/api/incidencias/{incidencia_id}/estado",
        headers=encargado,
        json={"estado": "resuelta", "resolucion": "Sensor recalibrado"},
    )
    assert resuelta.status_code == 200
    assert resuelta.json()["estado"] == "resuelta"
    assert client.get("/api/incidencias/estadisticas", headers=admin).status_code == 200

    producto = client.post(
        "/api/inventario/productos",
        headers=admin,
        json={
            "nombre": "Sustrato universal",
            "codigo": "SUS-001",
            "categoria": "materiales",
            "unidad": "saco",
            "stock": 10,
            "stock_minimo": 2,
        },
    )
    assert producto.status_code == 201
    producto_id = producto.json()["id"]
    assert client.post(
        "/api/inventario/productos",
        headers=encargado,
        json={"nombre": "No permitido", "codigo": "NO-1", "unidad": "kg"},
    ).status_code == 403
    assert client.post(
        "/api/inventario/movimientos",
        headers=encargado,
        json={"producto_id": producto_id, "tipo": "entrada", "cantidad": 1},
    ).status_code == 403

    movimiento = client.post(
        "/api/inventario/movimientos",
        headers=admin,
        json={
            "producto_id": producto_id,
            "tipo": "salida",
            "cantidad": 3,
            "motivo": "Uso en sector",
        },
    )
    assert movimiento.status_code == 201
    productos = client.get("/api/inventario/productos", headers=admin).json()
    assert next(item for item in productos if item["id"] == producto_id)["stock"] == 7

    solicitud = client.post(
        "/api/inventario/solicitudes",
        headers=encargado,
        json={"producto_id": producto_id, "cantidad": 2, "motivo": "Reposición"},
    )
    assert solicitud.status_code == 201
    solicitud_id = solicitud.json()["id"]
    aprobada = client.put(
        f"/api/inventario/solicitudes/{solicitud_id}",
        headers=admin,
        json={"estado": "aprobada", "comentario": "Aprobado"},
    )
    assert aprobada.status_code == 200
    assert aprobada.json()["estado"] == "aprobada"
    productos = client.get("/api/inventario/productos", headers=admin).json()
    assert next(item for item in productos if item["id"] == producto_id)["stock"] == 5
    assert client.get("/api/inventario/alertas", headers=admin).status_code == 200

    evento = client.post(
        "/api/calendario/eventos",
        headers=admin,
        json={
            "titulo": "Inspección de sector",
            "tipo": "inspeccion",
            "categoria": "inspeccion",
            "fecha_inicio": "2027-02-01T09:00:00",
            "sector_id": sector_id,
            "responsable_id": encargado_id,
        },
    )
    assert evento.status_code == 201
    evento_id = evento.json()["id"]
    completado = client.post(
        f"/api/calendario/eventos/{evento_id}/completar",
        headers=encargado,
        json={
            "resultado": "Sin novedades",
            "crear_incidencia": True,
            "incidencia_titulo": "Hallazgo en inspección",
            "incidencia_descripcion": "Se detectó una obstrucción menor.",
        },
    )
    assert completado.status_code == 200
    assert completado.json()["estado"] == "completado"
    assert completado.json()["incidencia_generada"]["id"] > 0
    assert client.patch(
        f"/api/calendario/eventos/{evento_id}/estado",
        headers=encargado,
        json={"estado": "estado-invalido"},
    ).status_code == 422
    estado_completado = client.patch(
        f"/api/calendario/eventos/{evento_id}/estado",
        headers=encargado,
        json={"estado": "completado"},
    )
    assert estado_completado.status_code == 200, estado_completado.json()
    assert estado_completado.json()["estado"] == "completado"
    assert client.get("/api/calendario/resumen", headers=admin).status_code == 200

    enviado = client.post(
        "/api/notificaciones/enviar",
        headers=admin,
        json={
            "titulo": "Nuevo procedimiento",
            "mensaje": "Revisa el calendario de mantenimiento.",
            "prioridad": "importante",
            "categoria": "sistema",
            "roles": ["encargado"],
        },
    )
    assert enviado.status_code == 201
    notificaciones = client.get("/api/notificaciones/", headers=encargado)
    assert notificaciones.status_code == 200
    assert len(notificaciones.json()) >= 1
    notif_id = notificaciones.json()[0]["id"]
    assert client.put(
        f"/api/notificaciones/{notif_id}/leer", headers=encargado
    ).status_code == 200
    assert client.put(
        "/api/notificaciones/marcar-todas", headers=encargado
    ).status_code == 200
    assert client.get(
        "/api/notificaciones/resumen", headers=encargado
    ).status_code == 200

    actividad = client.get(f"/api/equipo/{encargado_id}/actividad", headers=admin)
    assert actividad.status_code == 200
    assert "tareas" in actividad.json()
    assert client.put(
        f"/api/equipo/{encargado_id}/sectores",
        headers=admin,
        json={"sector_ids": [sector_id]},
    ).status_code == 200
    assert client.put(
        f"/api/equipo/{encargado_id}/sectores",
        headers=encargado,
        json={"sector_ids": [sector_id]},
    ).status_code == 403

    rendimiento = client.get("/api/rendimiento/", headers=admin)
    assert rendimiento.status_code == 200
    assert "indicadores" in rendimiento.json()
    assert "por_sector" in rendimiento.json()
    assert rendimiento.json()["indicadores"]["tareas_completadas"] >= 0

    assert client.get("/api/mapa/", headers=supervisor).status_code == 200


def test_rendimiento_accepts_aware_dates_and_filters_sector_period(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    sector = client.post(
        "/api/instalaciones/",
        headers=admin,
        json={"nombre": "Sector rendimiento"},
    ).json()
    tarea = client.post(
        "/api/tareas/",
        headers=admin,
        json={
            "titulo": "Tarea dentro del periodo",
            "categoria": "general",
            "prioridad": "media",
            "sector_id": sector["id"],
        },
    )
    assert tarea.status_code == 201

    actual = client.get(
        "/api/rendimiento/",
        headers=admin,
        params={
            "fecha_inicio": "2020-01-01T00:00:00Z",
            "fecha_fin": "2030-01-01T00:00:00Z",
        },
    )
    assert actual.status_code == 200
    sector_row = next(
        row for row in actual.json()["por_sector"] if row["sector_id"] == sector["id"]
    )
    assert sector_row["tareas_total"] == 1

    pasado = client.get(
        "/api/rendimiento/",
        headers=admin,
        params={
            "fecha_inicio": "2020-01-01T00:00:00Z",
            "fecha_fin": "2020-12-31T23:59:59Z",
        },
    )
    assert pasado.status_code == 200
    sector_row = next(
        row for row in pasado.json()["por_sector"] if row["sector_id"] == sector["id"]
    )
    assert sector_row["tareas_total"] == 0


def test_calendario_accepts_mixed_timezone_inputs(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    evento = client.post(
        "/api/calendario/eventos",
        headers=admin,
        json={
            "titulo": "Evento con zonas horarias",
            "tipo": "inspeccion",
            "categoria": "inspeccion",
            "fecha_inicio": "2030-01-10T09:00:00Z",
            "fecha_fin": "2030-01-10T10:00:00",
        },
    )
    assert evento.status_code == 201, evento.json()

    actualizado = client.put(
        f"/api/calendario/eventos/{evento.json()['id']}",
        headers=admin,
        json={"fecha_fin": "2030-01-10T11:00:00Z"},
    )
    assert actualizado.status_code == 200, actualizado.json()
    assert actualizado.json()["fecha_fin"].startswith("2030-01-10T11:00:00")


def test_encargado_cannot_link_event_to_unassigned_crop(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    crops = client.get("/api/cultivos/", headers=admin).json()
    private_crop = next(crop for crop in crops if crop["nombre"] == "Cultivo privado")
    response = client.post(
        "/api/calendario/eventos",
        headers=headers(tokens["encargado"]),
        json={
            "titulo": "Evento sin acceso",
            "tipo": "inspeccion",
            "categoria": "inspeccion",
            "fecha_inicio": "2030-02-01T09:00:00",
            "cultivo_id": private_crop["id"],
        },
    )
    assert response.status_code == 403


def test_incidencia_edit_persists_sector_and_crop(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    sector = client.post(
        "/api/instalaciones/",
        headers=admin,
        json={"nombre": "Sector incidencia"},
    ).json()
    crop = client.post(
        "/api/cultivos/",
        headers=admin,
        json={
            "nombre": "Cultivo incidencia",
            "fecha_inicio": "2026-01-01T00:00:00",
            "instalacion_id": sector["id"],
        },
    ).json()
    incidencia = client.post(
        "/api/incidencias/",
        headers=admin,
        json={
            "titulo": "Incidencia sin ubicacion",
            "descripcion": "Registrada para probar la edicion.",
            "categoria": "riego",
            "prioridad": "media",
        },
    ).json()
    actualizada = client.put(
        f"/api/incidencias/{incidencia['id']}",
        headers=admin,
        json={"sector_id": sector["id"], "cultivo_id": crop["id"]},
    )
    assert actualizada.status_code == 200, actualizada.json()
    assert actualizada.json()["sector_id"] == sector["id"]
    assert actualizada.json()["cultivo_id"] == crop["id"]


def test_supervisor_cannot_grant_sector_assignments_to_supervisors(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    supervisor = headers(tokens["supervisor"])
    equipo = client.get("/api/equipo/", headers=admin).json()
    supervisor_id = next(
        user["id"] for user in equipo if user["username"] == "supervisor"
    )
    encargado_id = next(
        user["id"] for user in equipo if user["username"] == "encargado"
    )
    sector = client.post(
        "/api/instalaciones/",
        headers=admin,
        json={"nombre": "Sector asignable"},
    ).json()

    propio = client.put(
        f"/api/equipo/{supervisor_id}/sectores",
        headers=supervisor,
        json={"sector_ids": []},
    )
    assert propio.status_code == 403

    encargado = client.put(
        f"/api/equipo/{encargado_id}/sectores",
        headers=supervisor,
        json={"sector_ids": [sector["id"]]},
    )
    assert encargado.status_code == 200, encargado.json()
    assert [item["nombre"] for item in encargado.json()["sectores"]] == [
        "Sector asignable"
    ]


def test_security_headers_include_permissions_policy(api):
    client, _ = api
    response = client.get("/api/health")
    assert response.headers["Permissions-Policy"] == (
        "geolocation=(), microphone=(), camera=()"
    )


def test_login_rate_limit_returns_429_with_retry_after(api):
    client, _ = api
    for _ in range(5):
        response = client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "clave-incorrecta"},
        )
        assert response.status_code == 401

    blocked = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "clave-incorrecta"},
    )
    assert blocked.status_code == 429
    assert blocked.headers["Retry-After"].isdigit()
    assert blocked.json()["detail"].startswith("Demasiados intentos")


def test_admin_configura_intentos_login_por_usuario(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    usuarios = client.get("/api/usuarios/", headers=admin).json()
    objetivo = next(u for u in usuarios if u["username"] == "encargado")
    assert objetivo["intentos_login_maximos"] == 5

    actualizado = client.put(
        f"/api/usuarios/{objetivo['id']}",
        headers=admin,
        json={"intentos_login_maximos": 2},
    )
    assert actualizado.status_code == 200, actualizado.json()
    assert actualizado.json()["intentos_login_maximos"] == 2

    for _ in range(2):
        assert client.post(
            "/api/auth/login",
            data={"username": "encargado", "password": "clave-incorrecta"},
        ).status_code == 401

    bloqueado = client.post(
        "/api/auth/login",
        data={"username": "encargado", "password": "clave-incorrecta"},
    )
    assert bloqueado.status_code == 429
    assert bloqueado.headers["Retry-After"].isdigit()

    reinicio = client.post(
        f"/api/usuarios/{objetivo['id']}/reset-intentos", headers=admin
    )
    assert reinicio.status_code == 200, reinicio.json()
    assert reinicio.json()["reiniciadas"] == 1
    assert client.post(
        "/api/auth/login",
        data={"username": "encargado", "password": TEST_PASSWORD},
    ).status_code == 200

    assert client.put(
        f"/api/usuarios/{objetivo['id']}",
        headers=admin,
        json={"intentos_login_maximos": 0},
    ).status_code == 422
    assert client.put(
        f"/api/usuarios/{objetivo['id']}",
        headers=headers(tokens["encargado"]),
        json={"intentos_login_maximos": 3},
    ).status_code == 403


def test_successful_login_clears_identifier_counter(api):
    client, _ = api
    for _ in range(4):
        assert client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "clave-incorrecta"},
        ).status_code == 401

    assert client.post(
        "/api/auth/login",
        data={"username": "admin", "password": TEST_PASSWORD},
    ).status_code == 200

    assert client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "clave-incorrecta"},
    ).status_code == 401


def test_tampered_expired_and_stale_tokens_are_rejected(api):
    client, tokens = api
    valid = tokens["admin"]
    header, payload, signature = valid.split(".")
    replacement = "A" if payload[0] != "A" else "B"
    tampered = ".".join([header, replacement + payload[1:], signature])
    assert client.get("/api/auth/me", headers=headers(tampered)).status_code == 401

    expired = create_access_token(
        data={"sub": "admin", "ver": 0},
        expires_delta=timedelta(seconds=-5),
    )
    assert client.get("/api/auth/me", headers=headers(expired)).status_code == 401

    stale_version = create_access_token(data={"sub": "admin", "ver": 99})
    assert client.get(
        "/api/auth/me", headers=headers(stale_version)
    ).status_code == 401


def test_measurement_boundaries_are_validated(api):
    client, tokens = api
    auth = headers(tokens["encargado"])
    crop = client.get("/api/cultivos/", headers=auth).json()[0]

    assert client.post(
        "/api/mediciones/",
        headers=auth,
        json={
            "cultivo_id": crop["id"],
            "temperatura": 200,
            "humedad": 50,
            "nivel_agua": 50,
        },
    ).status_code == 422
    assert client.post(
        "/api/mediciones/",
        headers=auth,
        json={
            "cultivo_id": crop["id"],
            "temperatura": 22,
            "humedad": 50,
            "nivel_agua": 50,
            "ph": 20,
        },
    ).status_code == 422

    boundary = client.post(
        "/api/mediciones/",
        headers=auth,
        json={
            "cultivo_id": crop["id"],
            "temperatura": 100,
            "humedad": 100,
            "nivel_agua": 0,
            "ph": 14,
            "conductividad": 100000,
        },
    )
    assert boundary.status_code == 201, boundary.json()


def test_duplicate_username_and_email_are_rejected(api):
    client, tokens = api
    auth = headers(tokens["admin"])
    base = {
        "username": "duplicado",
        "email": "duplicado@example.com",
        "nombre_completo": "Duplicado",
        "password": TEST_PASSWORD,
        "rol": "encargado",
    }
    assert client.post("/api/usuarios/", headers=auth, json=base).status_code == 201
    assert client.post("/api/usuarios/", headers=auth, json=base).status_code == 409

    same_email = {**base, "username": "otro-usuario"}
    assert client.post(
        "/api/usuarios/", headers=auth, json=same_email
    ).status_code == 409

    same_username = {**base, "email": "otro@example.com"}
    assert client.post(
        "/api/usuarios/", headers=auth, json=same_username
    ).status_code == 409


def test_grupos_trabajo_scope_y_asignacion_de_tareas(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    supervisor = headers(tokens["supervisor"])
    encargado = headers(tokens["encargado"])
    sin_asignacion = headers(tokens["sin-asignacion"])

    usuarios = client.get("/api/usuarios/", headers=admin).json()
    ids = {usuario["username"]: usuario["id"] for usuario in usuarios}
    payload = {
        "nombre": "Equipo de prueba",
        "descripcion": "Grupo para validar asignaciones",
        "supervisor_id": ids["supervisor"],
        "color": "#336699",
        "activo": True,
        "miembros": [ids["encargado"]],
    }

    creado = client.post("/api/grupos/", headers=admin, json=payload)
    assert creado.status_code == 201, creado.json()
    grupo = creado.json()
    assert grupo["supervisor_id"] == ids["supervisor"]
    assert grupo["supervisor_nombre"] == "Test Supervisor"
    assert [miembro["id"] for miembro in grupo["miembros"]] == [ids["encargado"]]
    assert grupo["total_miembros"] == 1

    assert client.post("/api/grupos/", headers=admin, json=payload).status_code == 409
    assert client.post("/api/grupos/", headers=supervisor, json=payload).status_code == 403

    visibles_supervisor = client.get("/api/grupos/", headers=supervisor)
    assert visibles_supervisor.status_code == 200
    assert [item["id"] for item in visibles_supervisor.json()] == [grupo["id"]]
    visibles_encargado = client.get("/api/grupos/", headers=encargado)
    assert visibles_encargado.status_code == 200
    assert [item["id"] for item in visibles_encargado.json()] == [grupo["id"]]
    assert client.get(
        f"/api/grupos/{grupo['id']}", headers=sin_asignacion
    ).status_code == 403

    asignada = client.post(
        "/api/tareas/",
        headers=supervisor,
        json={
            "titulo": "Tarea del grupo",
            "categoria": "general",
            "responsable_id": ids["encargado"],
        },
    )
    assert asignada.status_code == 201, asignada.json()
    fuera_grupo = client.post(
        "/api/tareas/",
        headers=supervisor,
        json={
            "titulo": "Tarea fuera del grupo",
            "categoria": "general",
            "responsable_id": ids["sin-asignacion"],
        },
    )
    assert fuera_grupo.status_code == 403
    a_supervisor = client.post(
        "/api/tareas/",
        headers=supervisor,
        json={
            "titulo": "Tarea para supervisor",
            "categoria": "general",
            "responsable_id": ids["supervisor"],
        },
    )
    assert a_supervisor.status_code == 422

    actualizado = client.put(
        f"/api/grupos/{grupo['id']}",
        headers=admin,
        json={
            "miembros": [ids["encargado"], ids["sin-asignacion"]],
            "activo": True,
        },
    )
    assert actualizado.status_code == 200, actualizado.json()
    assert {item["id"] for item in actualizado.json()["miembros"]} == {
        ids["encargado"], ids["sin-asignacion"]
    }
    reasignada = client.post(
        "/api/tareas/",
        headers=supervisor,
        json={
            "titulo": "Tarea para el nuevo integrante",
            "categoria": "general",
            "responsable_id": ids["sin-asignacion"],
        },
    )
    assert reasignada.status_code == 201, reasignada.json()

    assert client.delete(
        f"/api/grupos/{grupo['id']}", headers=supervisor
    ).status_code == 403
    assert client.delete(
        f"/api/grupos/{grupo['id']}", headers=admin
    ).status_code == 204
    assert client.get(f"/api/grupos/{grupo['id']}", headers=admin).status_code == 404


def test_escalar_incidencia_asigna_admin_y_sube_prioridad(api):
    client, tokens = api
    encargado = headers(tokens["encargado"])
    admin = headers(tokens["admin"])

    crops = client.get("/api/cultivos/", headers=encargado).json()
    assert crops
    creada = client.post(
        "/api/incidencias/",
        headers=encargado,
        json={
            "titulo": "Falta de nutrientes",
            "descripcion": "Las plantas muestran hojas amarillas en el sector asignado.",
            "categoria": "plantas",
            "prioridad": "baja",
            "cultivo_id": crops[0]["id"],
        },
    )
    assert creada.status_code == 201, creada.json()
    incidencia = creada.json()

    escalada = client.post(
        f"/api/incidencias/{incidencia['id']}/escalar",
        headers=encargado,
        json={"motivo": "Requiere decisión de compra"},
    )
    assert escalada.status_code == 200, escalada.json()
    detalle = escalada.json()

    usuarios = client.get("/api/usuarios/", headers=admin).json()
    admin_id = next(user["id"] for user in usuarios if user["username"] == "admin")
    assert detalle["asignado_a"] == admin_id
    assert detalle["asignado_nombre"] == "Test Admin"
    assert detalle["prioridad"] == "media"
    assert any(
        "escalada a administración" in comentario["comentario"]
        and "Requiere decisión de compra" in comentario["comentario"]
        for comentario in detalle["comentarios"]
    )

    notificaciones = client.get("/api/notificaciones/", headers=admin).json()
    assert any(
        item["titulo"] == "Incidencia escalada"
        and item["entidad_id"] == incidencia["id"]
        for item in notificaciones
    )

    cerrada = client.put(
        f"/api/incidencias/{incidencia['id']}/estado",
        headers=admin,
        json={"estado": "cerrada", "resolucion": "Resuelta por administración"},
    )
    assert cerrada.status_code == 200
    assert client.post(
        f"/api/incidencias/{incidencia['id']}/escalar",
        headers=encargado,
    ).status_code == 409


def test_contactos_de_escalamiento_incluyen_supervisor_y_admin(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    encargado = headers(tokens["encargado"])

    usuarios = client.get("/api/usuarios/", headers=admin).json()
    ids = {usuario["username"]: usuario["id"] for usuario in usuarios}
    grupo = client.post(
        "/api/grupos/",
        headers=admin,
        json={
            "nombre": "Equipo de contactos",
            "supervisor_id": ids["supervisor"],
            "activo": True,
            "miembros": [ids["encargado"]],
        },
    )
    assert grupo.status_code == 201, grupo.json()

    contactos = client.get("/api/equipo/contactos", headers=encargado)
    assert contactos.status_code == 200, contactos.json()
    body = contactos.json()
    assert any(
        supervisor["username"] == "supervisor"
        and supervisor["grupo"] == "Equipo de contactos"
        for supervisor in body["supervisores"]
    )
    assert any(
        administrador["username"] == "admin"
        for administrador in body["administradores"]
    )

    del_supervisor = client.get(
        "/api/equipo/contactos", headers=headers(tokens["supervisor"])
    ).json()
    assert any(
        administrador["username"] == "admin"
        for administrador in del_supervisor["administradores"]
    )


def test_forgot_password_dev_mode_returns_code_and_resets(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(
        "backend.routers.auth.modo_desarrollo_activo", lambda: True
    )

    missing = client.post(
        "/api/auth/forgot-password", json={"identificador": "no-existe"}
    )
    assert missing.status_code == 200
    assert "dev_code" not in missing.json()

    solicitado = client.post(
        "/api/auth/forgot-password", json={"identificador": "encargado"}
    )
    assert solicitado.status_code == 200, solicitado.json()
    body = solicitado.json()
    codigo = body.get("dev_code")
    assert codigo and len(codigo) == 6
    assert body["expires_in"] > 0

    verificado = client.post(
        "/api/auth/verify-reset-code",
        json={"identificador": "encargado", "codigo": codigo},
    )
    assert verificado.status_code == 200, verificado.json()
    reset_token = verificado.json()["reset_token"]

    nueva = "nueva-clave-segura-456"
    actualizado = client.post(
        "/api/auth/reset-password",
        json={"reset_token": reset_token, "new_password": nueva},
    )
    assert actualizado.status_code == 200, actualizado.json()

    login = client.post(
        "/api/auth/login", data={"username": "encargado", "password": nueva}
    )
    assert login.status_code == 200


def test_forgot_password_magic_link_flow(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(
        "backend.routers.auth.modo_desarrollo_activo", lambda: True
    )
    enviados = []
    monkeypatch.setattr(
        "backend.routers.auth.enviar_enlace",
        lambda usuario, enlace, canal: enviados.append(
            (usuario.username, enlace, canal)
        ) or True,
    )

    missing = client.post(
        "/api/auth/forgot-password",
        json={"identificador": "no-existe", "metodo": "link"},
    )
    assert missing.status_code == 200
    assert "dev_link" not in missing.json()

    solicitado = client.post(
        "/api/auth/forgot-password",
        json={"identificador": "encargado", "metodo": "link"},
    )
    assert solicitado.status_code == 200, solicitado.json()
    body = solicitado.json()
    enlace = body.get("dev_link")
    assert enlace and enviados and enviados[-1][1] == enlace
    assert body["expires_in"] > 0

    raw_token = parse_qs(urlparse(enlace).query)["reset_token"][0]
    assert "." in raw_token

    verificado = client.post(
        "/api/auth/verify-reset-link", json={"reset_token": raw_token}
    )
    assert verificado.status_code == 200, verificado.json()
    reset_token = verificado.json()["reset_token"]

    reused = client.post(
        "/api/auth/verify-reset-link", json={"reset_token": raw_token}
    )
    assert reused.status_code == 400

    nueva = "enlace-seguro-123456"
    actualizado = client.post(
        "/api/auth/reset-password",
        json={"reset_token": reset_token, "new_password": nueva},
    )
    assert actualizado.status_code == 200, actualizado.json()
    assert client.post(
        "/api/auth/login", data={"username": "encargado", "password": nueva}
    ).status_code == 200


def test_device_ip_fields_and_connection_check(api, monkeypatch):
    client, tokens = api
    auth = headers(tokens["admin"])
    llamadas = []

    def fake_probar(direccion_ip, puerto=None, timeout=None):
        llamadas.append((direccion_ip, puerto))
        return {
            "alcanzable": True,
            "latencia_ms": 4.2,
            "error": None,
            "puerto": puerto,
        }

    monkeypatch.setattr(
        "backend.routers.dispositivos.probar_conexion", fake_probar
    )

    creado = client.post(
        "/api/dispositivos/",
        headers=auth,
        json={
            "nombre": "Sensor con IP",
            "tipo": "sensor",
            "direccion_ip": "192.168.1.50",
            "puerto": 8080,
        },
    )
    assert creado.status_code == 201, creado.json()
    data = creado.json()
    assert data["direccion_ip"] == "192.168.1.50"
    assert data["puerto"] == 8080
    assert data["conexion"]["alcanzable"] is True
    assert data["ultimaconexion"] is not None
    assert llamadas[0] == ("192.168.1.50", 8080)

    probado = client.post(
        f"/api/dispositivos/{data['id']}/probar-conexion", headers=auth
    )
    assert probado.status_code == 200, probado.json()
    assert probado.json()["conexion"]["latencia_ms"] == 4.2

    por_defecto = client.post(
        "/api/dispositivos/",
        headers=auth,
        json={
            "nombre": "Sensor puerto por defecto",
            "tipo": "sensor",
            "direccion_ip": "10.0.0.7",
        },
    )
    assert por_defecto.status_code == 201, por_defecto.json()
    assert por_defecto.json()["puerto"] == 80
    assert llamadas[-1] == ("10.0.0.7", 80)


def test_device_connection_check_requires_ip_and_admin(api):
    client, tokens = api
    auth = headers(tokens["admin"])

    sin_ip = client.post(
        "/api/dispositivos/",
        headers=auth,
        json={"nombre": "Sensor sin IP", "tipo": "sensor"},
    )
    assert sin_ip.status_code == 201, sin_ip.json()
    assert sin_ip.json()["direccion_ip"] is None
    assert sin_ip.json()["puerto"] == 80

    device_id = sin_ip.json()["id"]
    assert client.post(
        f"/api/dispositivos/{device_id}/probar-conexion", headers=auth
    ).status_code == 422
    assert client.post(
        f"/api/dispositivos/{device_id}/probar-conexion",
        headers=headers(tokens["encargado"]),
    ).status_code == 403

    invalida = client.post(
        "/api/dispositivos/",
        headers=auth,
        json={
            "nombre": "Sensor IP inválida",
            "tipo": "sensor",
            "direccion_ip": "no es una ip",
        },
    )
    assert invalida.status_code == 422


def test_cultivo_detalle_y_actualizacion(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    encargado = headers(tokens["encargado"])

    creado = client.post(
        "/api/cultivos/",
        headers=admin,
        json={"nombre": "Cultivo CRUD", "fecha_inicio": "2026-01-01T00:00:00"},
    )
    assert creado.status_code == 201, creado.json()
    cultivo_id = creado.json()["id"]

    detalle = client.get(f"/api/cultivos/{cultivo_id}", headers=admin)
    assert detalle.status_code == 200
    assert detalle.json()["nombre"] == "Cultivo CRUD"
    assert client.get(f"/api/cultivos/{cultivo_id}", headers=encargado).status_code == 403
    assert client.get("/api/cultivos/99999", headers=admin).status_code == 404

    actualizado = client.put(
        f"/api/cultivos/{cultivo_id}",
        headers=admin,
        json={"nombre": "Cultivo editado", "tipo_planta": "Espinaca"},
    )
    assert actualizado.status_code == 200, actualizado.json()
    assert actualizado.json()["tipo_planta"] == "Espinaca"
    assert client.put(
        f"/api/cultivos/{cultivo_id}",
        headers=admin,
        json={"instalacion_id": 99999},
    ).status_code == 422
    assert client.put(
        f"/api/cultivos/{cultivo_id}", headers=encargado, json={"nombre": "No"}
    ).status_code == 403
    assert client.delete(f"/api/cultivos/{cultivo_id}", headers=admin).status_code == 204
    assert client.get(f"/api/cultivos/{cultivo_id}", headers=admin).status_code == 404


def test_usuario_detalle_y_id_en_creacion(api):
    client, tokens = api
    admin = headers(tokens["admin"])

    creado = client.post(
        "/api/usuarios/",
        headers=admin,
        json={
            "username": "detalle-usuario",
            "email": "detalle@ejemplo.com",
            "nombre_completo": "Detalle Usuario",
            "rol": "encargado",
            "password": "Clave-Segura-12345!",
        },
    )
    assert creado.status_code == 201, creado.json()
    usuario_id = creado.json()["id"]
    assert creado.json()["user_id"] == usuario_id

    detalle = client.get(f"/api/usuarios/{usuario_id}", headers=admin)
    assert detalle.status_code == 200
    assert "hashed_password" not in detalle.json()
    assert detalle.json()["intentos_login_maximos"] == 5
    assert client.get(
        f"/api/usuarios/{usuario_id}", headers=headers(tokens["encargado"])
    ).status_code == 403
    assert client.get("/api/usuarios/99999", headers=admin).status_code == 404
    assert client.delete(f"/api/usuarios/{usuario_id}", headers=admin).status_code == 204


def test_alerta_manual_y_detalle(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    encargado = headers(tokens["encargado"])
    sin_asignacion = headers(tokens["sin-asignacion"])

    creada = client.post(
        "/api/alertas/",
        headers=admin,
        json={
            "tipo": "ph",
            "severidad": "warning",
            "mensaje": "Alerta creada manualmente",
            "valor_detectado": 8.2,
            "umbral": 7.5,
            "cultivo_id": 1,
        },
    )
    assert creada.status_code == 201, creada.json()
    alerta_id = creada.json()["id"]
    assert creada.json()["resuelta"] is False

    detalle = client.get(f"/api/alertas/{alerta_id}", headers=encargado)
    assert detalle.status_code == 200
    assert detalle.json()["mensaje"] == "Alerta creada manualmente"
    assert client.get(f"/api/alertas/{alerta_id}", headers=sin_asignacion).status_code == 403
    assert client.get("/api/alertas/99999", headers=admin).status_code == 404
    assert client.post(
        "/api/alertas/", headers=encargado,
        json={"tipo": "ph", "severidad": "warning", "mensaje": "No", "cultivo_id": 1},
    ).status_code == 403
    assert client.delete(f"/api/alertas/{alerta_id}", headers=admin).status_code == 204


def test_notificacion_detalle_y_actualizacion(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    encargado = headers(tokens["encargado"])

    enviado = client.post(
        "/api/notificaciones/enviar",
        headers=admin,
        json={
            "titulo": "Aviso CRUD",
            "mensaje": "Revisa el módulo",
            "prioridad": "importante",
            "categoria": "sistema",
            "roles": ["encargado"],
        },
    )
    assert enviado.status_code == 201, enviado.json()
    notificaciones = client.get("/api/notificaciones/", headers=encargado).json()
    notificacion_id = next(
        item["id"] for item in notificaciones if item["titulo"] == "Aviso CRUD"
    )

    detalle = client.get(f"/api/notificaciones/{notificacion_id}", headers=encargado)
    assert detalle.status_code == 200
    assert detalle.json()["leida"] is False
    assert client.get(f"/api/notificaciones/{notificacion_id}", headers=admin).status_code == 404

    actualizada = client.put(
        f"/api/notificaciones/{notificacion_id}",
        headers=encargado,
        json={"titulo": "Aviso editado", "leida": True, "prioridad": "info"},
    )
    assert actualizada.status_code == 200, actualizada.json()
    assert actualizada.json()["leida"] is True
    assert actualizada.json()["titulo"] == "Aviso CRUD"
    assert actualizada.json()["prioridad"] == "importante"
    assert client.put(
        f"/api/notificaciones/{notificacion_id}",
        headers=encargado,
        json={"titulo": "x"},
    ).status_code == 422
    assert client.delete(
        f"/api/notificaciones/{notificacion_id}", headers=encargado
    ).status_code == 204
    assert client.get(f"/api/notificaciones/{notificacion_id}", headers=encargado).status_code == 404


def test_riego_programaciones_crud_y_borrado_de_zona(api):
    client, tokens = api
    encargado = headers(tokens["encargado"])
    zona = client.get("/api/riego/zonas", headers=encargado).json()[0]
    zona_id = zona["id"]

    creada = client.post(
        "/api/riego/programar",
        headers=encargado,
        json={
            "zona_id": zona_id,
            "hora_inicio": "06:30",
            "duracion": 20,
            "frecuencia": "diario",
        },
    )
    assert creada.status_code == 201, creada.json()
    programacion_id = creada.json()["id"]

    listado = client.get("/api/riego/programaciones", headers=encargado)
    assert listado.status_code == 200
    assert any(item["id"] == programacion_id for item in listado.json())

    detalle = client.get(f"/api/riego/programaciones/{programacion_id}", headers=encargado)
    assert detalle.status_code == 200
    assert detalle.json()["duracion"] == 20

    actualizada = client.put(
        f"/api/riego/programaciones/{programacion_id}",
        headers=encargado,
        json={"hora_inicio": "07:15", "duracion": 25, "activa": False},
    )
    assert actualizada.status_code == 200, actualizada.json()
    assert actualizada.json()["hora_inicio"] == "07:15"
    assert actualizada.json()["duracion"] == 25
    assert actualizada.json()["activa"] is False
    assert client.get(
        f"/api/riego/programaciones/{programacion_id}", headers=encargado
    ).json()["duracion"] == 25
    assert client.put(
        f"/api/riego/programaciones/{programacion_id}",
        headers=encargado,
        json={"duracion": 121},
    ).status_code == 422

    assert client.delete(
        f"/api/riego/programaciones/{programacion_id}", headers=encargado
    ).status_code == 204
    assert client.delete(f"/api/riego/zonas/{zona_id}", headers=encargado).status_code == 204
    assert client.delete(f"/api/riego/zonas/{zona_id}", headers=encargado).status_code == 404


def test_inventario_movimientos_y_solicitudes_crud(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    encargado = headers(tokens["encargado"])

    producto = client.post(
        "/api/inventario/productos",
        headers=admin,
        json={
            "nombre": "Producto CRUD", "codigo": "CRUD-001",
            "unidad": "kg", "stock": 10, "stock_minimo": 1,
        },
    )
    assert producto.status_code == 201, producto.json()
    producto_id = producto.json()["id"]

    entrada = client.post(
        "/api/inventario/movimientos",
        headers=admin,
        json={"producto_id": producto_id, "tipo": "entrada", "cantidad": 5},
    )
    assert entrada.status_code == 201, entrada.json()
    movimiento_id = entrada.json()["id"]

    detalle = client.get(f"/api/inventario/movimientos/{movimiento_id}", headers=admin)
    assert detalle.status_code == 200
    editado = client.put(
        f"/api/inventario/movimientos/{movimiento_id}",
        headers=admin,
        json={"motivo": "Corrección"},
    )
    assert editado.status_code == 200
    assert editado.json()["motivo"] == "Corrección"
    borrado = client.delete(f"/api/inventario/movimientos/{movimiento_id}", headers=admin)
    assert borrado.status_code == 200
    assert borrado.json()["stock_actual"] == 10
    assert client.get(f"/api/inventario/movimientos/{movimiento_id}", headers=admin).status_code == 404

    solicitud = client.post(
        "/api/inventario/solicitudes",
        headers=encargado,
        json={"producto_id": producto_id, "cantidad": 2, "motivo": "Reposición"},
    )
    assert solicitud.status_code == 201, solicitud.json()
    solicitud_id = solicitud.json()["id"]
    assert client.get(f"/api/inventario/solicitudes/{solicitud_id}", headers=encargado).status_code == 200
    assert client.delete(f"/api/inventario/solicitudes/{solicitud_id}", headers=encargado).status_code == 200

    aprobada = client.post(
        "/api/inventario/solicitudes",
        headers=encargado,
        json={"producto_id": producto_id, "cantidad": 1, "motivo": "Reposición"},
    )
    solicitud_id = aprobada.json()["id"]
    assert client.put(
        f"/api/inventario/solicitudes/{solicitud_id}",
        headers=admin,
        json={"estado": "aprobada"},
    ).status_code == 200

    def stock_actual():
        productos = client.get("/api/inventario/productos", headers=admin).json()
        return next(item["stock"] for item in productos if item["id"] == producto_id)

    assert stock_actual() == 9
    assert client.delete(f"/api/inventario/solicitudes/{solicitud_id}", headers=encargado).status_code == 409
    assert client.delete(f"/api/inventario/solicitudes/{solicitud_id}", headers=admin).status_code == 200
    assert stock_actual() == 10
    movimientos = client.get("/api/inventario/movimientos", headers=admin).json()
    assert any(
        item["tipo"] == "entrada"
        and item["motivo"] == f"Reversión por eliminación de solicitud #{solicitud_id}"
        for item in movimientos
    )


def test_reporte_historial_actualizacion(api):
    client, tokens = api
    encargado = headers(tokens["encargado"])
    sin_asignacion = headers(tokens["sin-asignacion"])
    cultivo_id = client.get("/api/cultivos/", headers=encargado).json()[0]["id"]
    params = {
        "tipo": "mediciones",
        "cultivo_id": cultivo_id,
        "fecha_inicio": "2025-01-01T00:00:00",
        "fecha_fin": "2027-01-01T00:00:00",
        "formato": "csv",
        "total_registros": 1,
        "tamano_bytes": 100,
    }

    creado = client.post("/api/reportes/historial", headers=encargado, json=params)
    assert creado.status_code == 201, creado.json()
    reporte_id = creado.json()["id"]

    actualizado = client.put(
        f"/api/reportes/historial/{reporte_id}",
        headers=encargado,
        json={"formato": "pdf", "total_registros": 9},
    )
    assert actualizado.status_code == 200, actualizado.json()
    assert actualizado.json()["formato"] == "pdf"
    assert actualizado.json()["total_registros"] == 9
    assert actualizado.json()["cultivo_id"] == cultivo_id
    limpio = client.put(
        f"/api/reportes/historial/{reporte_id}",
        headers=encargado,
        json={"cultivo_id": None},
    )
    assert limpio.status_code == 200, limpio.json()
    assert limpio.json()["cultivo_id"] is None
    assert client.put(
        f"/api/reportes/historial/{reporte_id}",
        headers=encargado,
        json={"fecha_inicio": "2028-01-01T00:00:00"},
    ).status_code == 422
    assert client.put(
        f"/api/reportes/historial/{reporte_id}",
        headers=sin_asignacion,
        json={"formato": "excel"},
    ).status_code == 403
    assert client.delete(f"/api/reportes/historial/{reporte_id}", headers=encargado).status_code == 204


def test_mapa_configuracion_crud(api):
    client, tokens = api
    admin = headers(tokens["admin"])
    sin_asignacion = headers(tokens["sin-asignacion"])

    sector = client.post(
        "/api/instalaciones/",
        headers=admin,
        json={"nombre": "Sector CRUD Mapa", "ubicacion": "Oeste"},
    )
    assert sector.status_code == 201, sector.json()
    sector_id = sector.json()["id"]
    payload = {
        "posicion_x": 2, "posicion_y": 3, "ancho": 4, "alto": 2,
        "tipo_sector": "bomba", "color": "#112233",
    }

    assert client.get(f"/api/mapa/config/{sector_id}", headers=admin).status_code == 404
    creada = client.post(f"/api/mapa/config/{sector_id}", headers=admin, json=payload)
    assert creada.status_code == 201, creada.json()
    assert creada.json()["tipo_sector"] == "bomba"
    assert client.post(f"/api/mapa/config/{sector_id}", headers=admin, json=payload).status_code == 409

    detalle = client.get(f"/api/mapa/config/{sector_id}", headers=admin)
    assert detalle.status_code == 200
    assert detalle.json()["ancho"] == 4
    assert client.get(
        f"/api/mapa/config/{sector_id}", headers=sin_asignacion
    ).status_code == 403
    actualizada = client.put(
        f"/api/mapa/config/{sector_id}", headers=admin, json={"color": "#445566"}
    )
    assert actualizada.status_code == 200
    assert actualizada.json()["color"] == "#445566"
    assert actualizada.json()["ancho"] == 4
    assert actualizada.json()["tipo_sector"] == "bomba"
    assert client.delete(f"/api/mapa/config/{sector_id}", headers=admin).status_code == 204
    assert client.get(f"/api/mapa/config/{sector_id}", headers=admin).status_code == 404