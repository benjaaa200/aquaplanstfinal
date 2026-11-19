"""Envío de correos y SMS para la recuperación de contraseña.

Los proveedores se configuran por entorno. Si no hay proveedor configurado,
el código se escribe en el log para poder probar el flujo en desarrollo.
"""
import base64
import logging
import smtplib
from email.message import EmailMessage
from urllib import error, parse, request

from backend.config import (
    PASSWORD_RESET_CODE_MINUTES,
    PASSWORD_RESET_DEV_MODE,
    PASSWORD_RESET_LINK_MINUTES,
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_TLS,
    SMTP_USER,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM,
)

logger = logging.getLogger(__name__)


def smtp_configurado() -> bool:
    return bool(SMTP_HOST and SMTP_FROM)


def twilio_configurado() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM)


def modo_desarrollo_activo() -> bool:
    """Expone el código en la API solo en desarrollo y sin proveedor real."""
    return (
        PASSWORD_RESET_DEV_MODE
        and not smtp_configurado()
        and not twilio_configurado()
    )


def elegir_canal(usuario) -> str | None:
    if usuario.telefono_respaldo and twilio_configurado():
        return "sms"
    if usuario.email_respaldo or usuario.email:
        return "email"
    if usuario.telefono_respaldo:
        return "sms"
    return None


def destino_del_canal(usuario, canal: str) -> str | None:
    if canal == "sms":
        return usuario.telefono_respaldo
    return usuario.email_respaldo or usuario.email


def enviar_correo(destino: str, asunto: str, cuerpo: str) -> bool:
    if not smtp_configurado():
        logger.warning(
            "SMTP no configurado; correo para %s no enviado. Contenido: %s",
            destino,
            cuerpo,
        )
        return False

    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = SMTP_FROM
    mensaje["To"] = destino
    mensaje.set_content(cuerpo)

    try:
        if SMTP_PORT == 465:
            servidor = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15)
        else:
            servidor = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
        with servidor:
            servidor.ehlo()
            if SMTP_TLS and SMTP_PORT != 465:
                servidor.starttls()
                servidor.ehlo()
            if SMTP_USER:
                servidor.login(SMTP_USER, SMTP_PASSWORD)
            servidor.send_message(mensaje)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        logger.error("No se pudo enviar el correo a %s: %s", destino, exc)
        return False


def enviar_sms(destino: str, mensaje: str) -> bool:
    if not twilio_configurado():
        logger.warning(
            "Twilio no configurado; SMS para %s no enviado. Contenido: %s",
            destino,
            mensaje,
        )
        return False

    url = (
        "https://api.twilio.com/2010-04-01/Accounts/"
        f"{TWILIO_ACCOUNT_SID}/Messages.json"
    )
    payload = parse.urlencode(
        {"From": TWILIO_FROM, "To": destino, "Body": mensaje}
    ).encode("utf-8")
    credenciales = base64.b64encode(
        f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode("utf-8")
    ).decode("ascii")
    solicitud = request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Basic {credenciales}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    try:
        with request.urlopen(solicitud, timeout=15) as respuesta:
            return 200 <= respuesta.status < 300
    except (error.URLError, OSError) as exc:
        logger.error("No se pudo enviar el SMS a %s: %s", destino, exc)
        return False


def enviar_codigo(usuario, codigo: str, canal: str) -> bool:
    minutos = PASSWORD_RESET_CODE_MINUTES
    cuerpo = (
        f"AquaPlants: tu código de recuperación es {codigo}. "
        f"Expira en {minutos} minutos. Si no lo solicitaste, ignora este mensaje."
    )
    destino = destino_del_canal(usuario, canal)
    if not destino:
        logger.warning("Usuario %s sin destino para el canal %s", usuario.id, canal)
        return False

    if canal == "sms":
        return enviar_sms(destino, cuerpo)
    return enviar_correo(destino, "AquaPlants - Código de recuperación", cuerpo)


def enviar_enlace(usuario, enlace: str, canal: str) -> bool:
    """Envía un enlace mágico de un solo uso para restablecer la contraseña."""
    minutos = PASSWORD_RESET_LINK_MINUTES
    cuerpo = (
        "AquaPlants: abre este enlace para restablecer tu contraseña:\n\n"
        f"{enlace}\n\n"
        f"Expira en {minutos} minutos. Si no lo solicitaste, ignora este mensaje."
    )
    destino = destino_del_canal(usuario, canal)
    if not destino:
        logger.warning("Usuario %s sin destino para el canal %s", usuario.id, canal)
        return False

    if canal == "sms":
        return enviar_sms(destino, cuerpo)
    return enviar_correo(destino, "AquaPlants - Enlace de recuperación", cuerpo)
