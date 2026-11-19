"""Comprobación de conectividad TCP para dispositivos IoT."""
import socket
import time

DEFAULT_DEVICE_PORT = 80


def probar_conexion(
    direccion_ip: str,
    puerto: int | None = None,
    timeout: float = 2.0,
) -> dict:
    """Intenta abrir una conexión TCP al dispositivo y mide la latencia.

    No envía ni recibe datos: basta con que el host acepte la conexión en el
    puerto indicado para considerarlo alcanzable, sin importar el protocolo
    (HTTP, MQTT, socket propio, etc.).
    """
    puerto = int(puerto or DEFAULT_DEVICE_PORT)
    inicio = time.perf_counter()
    try:
        with socket.create_connection((direccion_ip, puerto), timeout=timeout):
            latencia = round((time.perf_counter() - inicio) * 1000, 1)
            return {
                "alcanzable": True,
                "latencia_ms": latencia,
                "error": None,
                "puerto": puerto,
            }
    except OSError as exc:
        return {
            "alcanzable": False,
            "latencia_ms": None,
            "error": str(exc) or exc.__class__.__name__,
            "puerto": puerto,
        }
