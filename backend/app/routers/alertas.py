"""
Alertas climáticas por correo para los usuarios que las activan.

Flujo: consulta el pronóstico diario de Open-Meteo -> aplica las reglas de
app/alertas_reglas.py -> envía un correo por usuario suscrito con las alertas
nuevas -> registra lo enviado en alertas_enviadas para no repetir.

Variables de entorno (backend/.env):
  SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_USER, SMTP_PASSWORD, SMTP_FROM,
  SMTP_STARTTLS (1 por defecto)
  BREVO_API_KEY             (opcional) envía por la API HTTPS de Brevo en lugar de SMTP.
                            Útil cuando la red o el antivirus bloquean los puertos 587/465.
  BREVO_REMITENTE           correo remitente verificado en Brevo (por defecto SMTP_FROM o SMTP_USER)
  ALERTAS_AUTO=1            revisa automáticamente mientras el backend esté encendido
  ALERTAS_INTERVALO_HORAS   cada cuántas horas (6 por defecto)
"""

import asyncio
import logging
import os
import smtplib
import ssl
import time
from datetime import date, timedelta
from email.message import EmailMessage

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.alertas_reglas import (
    PARAMETROS_DIARIOS,
    UMBRALES,
    VALORES_PRUEBA,
    alerta_de_prueba,
    componer_correo,
    evaluar_pronostico,
    valor_en,
)
from app.auth import UsuarioActual, get_current_user, requiere_admin, supabase_admin
from app.routers.registros import LATITUD_COCHABAMBA, LONGITUD_COCHABAMBA

router = APIRouter(prefix="/alertas", tags=["alertas"])
logger = logging.getLogger("climatech.alertas")

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DIAS_PRONOSTICO = 3


# ----------------------------------------------------------------- utilidades
def obtener_pronostico(dias: int = DIAS_PRONOSTICO, timeout: float = 20.0) -> dict:
    params = {
        "latitude": LATITUD_COCHABAMBA,
        "longitude": LONGITUD_COCHABAMBA,
        "daily": ",".join(PARAMETROS_DIARIOS),
        "timezone": "America/La_Paz",
        "forecast_days": dias,
    }
    try:
        r = httpx.get(FORECAST_URL, params=params, timeout=timeout)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar el pronóstico de Open-Meteo: {exc}")
    return r.json().get("daily", {})


def _nombre_ehlo() -> str:
    """
    Nombre con el que el PC se presenta a Gmail (comando EHLO).
    Por defecto smtplib usa el nombre del equipo de Windows; si tiene tildes, «ñ», espacios
    u otros caracteres raros, Gmail corta la conexión («Connection unexpectedly closed»).
    Por eso se usa un nombre fijo y válido.
    """
    return (os.getenv("SMTP_EHLO") or "localhost").strip()


def _enviar_por(host: str, puerto: int, ssl_directo: bool, usuario: str | None, clave: str | None, msg: EmailMessage) -> None:
    contexto = ssl.create_default_context()
    paso = "conectar"
    try:
        if ssl_directo:
            servidor = smtplib.SMTP_SSL(host, puerto, timeout=20, context=contexto, local_hostname=_nombre_ehlo())
        else:
            servidor = smtplib.SMTP(host, puerto, timeout=20, local_hostname=_nombre_ehlo())
        with servidor:
            paso = "saludo EHLO"
            servidor.ehlo()
            if not ssl_directo and os.getenv("SMTP_STARTTLS", "1") == "1":
                paso = "STARTTLS (cifrado)"
                servidor.starttls(context=contexto)
                servidor.ehlo()
            if usuario:
                paso = "inicio de sesión (usuario y contraseña)"
                servidor.login(usuario, clave or "")
            paso = "envío del mensaje"
            servidor.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        raise
    except (smtplib.SMTPException, OSError) as exc:
        raise smtplib.SMTPException(f"falló en el paso «{paso}»: {exc}") from exc


BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def _enviar_por_brevo(clave_api: str, destino: str, asunto: str, cuerpo: str) -> None:
    """Envía por HTTPS (puerto 443), que casi ninguna red o antivirus bloquea."""
    remitente = (
        os.getenv("BREVO_REMITENTE") or os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or ""
    ).strip()
    if not remitente:
        raise RuntimeError("Falta BREVO_REMITENTE en backend/.env (el correo verificado como remitente en Brevo).")
    try:
        r = httpx.post(
            BREVO_URL,
            headers={"api-key": clave_api.strip(), "accept": "application/json"},
            json={
                "sender": {"email": remitente, "name": "ClimaTech"},
                "to": [{"email": destino}],
                "subject": asunto,
                "textContent": cuerpo,
            },
            timeout=20,
        )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"No se pudo conectar con Brevo: {exc}") from exc
    if r.status_code >= 300:
        raise RuntimeError(
            f"Brevo rechazó el envío ({r.status_code}): {r.text[:300]}. Revisa BREVO_API_KEY y que "
            f"{remitente} esté verificado como remitente en Brevo."
        )


def enviar_correo(destino: str, asunto: str, cuerpo: str) -> None:
    clave_brevo = os.getenv("BREVO_API_KEY")
    if clave_brevo:
        _enviar_por_brevo(clave_brevo, destino, asunto, cuerpo)
        return

    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host:
        raise RuntimeError("SMTP no configurado (falta SMTP_HOST en backend/.env).")
    puerto = int(os.getenv("SMTP_PORT", "587"))
    usuario = (os.getenv("SMTP_USER") or "").strip() or None
    # Google muestra la contraseña de aplicación en grupos separados por espacios: se quitan.
    clave = (os.getenv("SMTP_PASSWORD") or "").replace(" ", "") or None
    remitente = os.getenv("SMTP_FROM") or usuario or "alertas@climatech.local"

    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = remitente
    msg["To"] = destino
    msg.set_content(cuerpo)

    # Se usa el modo configurado y, si la conexión falla, el otro modo habitual de Gmail (587 STARTTLS <-> 465 SSL).
    intentos = [(puerto, puerto == 465)]
    if puerto in (587, 465):
        intentos.append((465 if puerto == 587 else 587, puerto == 587))

    fallos: list[str] = []
    for p, ssl_directo in intentos:
        try:
            _enviar_por(host, p, ssl_directo, usuario, clave, msg)
            return
        except smtplib.SMTPAuthenticationError as exc:
            raise RuntimeError(
                "El servidor rechazó el usuario o la contraseña. Con Gmail necesitas la verificación en dos pasos y una "
                f"«contraseña de aplicación» en SMTP_PASSWORD (no tu contraseña normal). Detalle: {exc.smtp_code}"
            ) from exc
        except (smtplib.SMTPException, OSError) as exc:
            fallos.append(f"puerto {p} ({'SSL' if ssl_directo else 'STARTTLS'}): {exc}")

    raise RuntimeError(
        f"No se pudo conectar con el servidor de correo {host}. " + " | ".join(fallos)
        + ". Si falla en «inicio de sesión», SMTP_PASSWORD debe ser una contraseña de aplicación de Google "
        "(16 letras), no tu contraseña normal. Si falla antes, revisa el antivirus o la red, o configura "
        "BREVO_API_KEY en backend/.env para enviar por HTTPS. "
        "Diagnóstico (desde C:\\ClimaTech\\backend con el venv activo): python scripts\\probar_smtp.py tu_correo"
    )


def _suscriptores() -> list[dict]:
    perfiles = (
        supabase_admin.table("profiles")
        .select("id,nombre_completo")
        .eq("alertas_activas", True)
        .eq("estado", "activo")
        .execute()
        .data
        or []
    )
    if not perfiles:
        return []

    correos: dict[str, str | None] = {}
    pagina = 1
    while pagina <= 50:
        respuesta = supabase_admin.auth.admin.list_users(page=pagina, per_page=200)
        usuarios = respuesta if isinstance(respuesta, list) else getattr(respuesta, "users", [])
        for u in usuarios:
            correos[u.id] = u.email
        if len(usuarios) < 200:
            break
        pagina += 1

    return [
        {"id": p["id"], "nombre": p["nombre_completo"], "email": correos.get(p["id"])}
        for p in perfiles
        if correos.get(p["id"])
    ]


def revisar_y_enviar(enviar: bool = True) -> dict:
    """Detecta alertas y las envía a los suscriptores. Con enviar=False solo simula."""
    diario = obtener_pronostico()
    alertas = evaluar_pronostico(diario)
    resumen = {
        "simulacion": not enviar,
        "alertas_detectadas": alertas,
        "destinatarios": 0,
        "enviados": 0,
        "sin_novedades": 0,
        "errores": [],
    }
    if not alertas:
        return resumen

    suscriptores = _suscriptores()
    resumen["destinatarios"] = len(suscriptores)
    fechas = sorted({a["fecha"] for a in alertas})

    for s in suscriptores:
        previas = (
            supabase_admin.table("alertas_enviadas")
            .select("tipo,fecha_pronostico")
            .eq("usuario_id", s["id"])
            .in_("fecha_pronostico", fechas)
            .execute()
            .data
            or []
        )
        ya_enviadas = {(p["tipo"], p["fecha_pronostico"]) for p in previas}
        nuevas = [a for a in alertas if (a["tipo"], a["fecha"]) not in ya_enviadas]
        if not nuevas:
            resumen["sin_novedades"] += 1
            continue

        if not enviar:
            resumen["enviados"] += 1
            continue

        asunto, cuerpo = componer_correo(s["nombre"], nuevas)
        try:
            enviar_correo(s["email"], asunto, cuerpo)
        except Exception as exc:
            resumen["errores"].append(f"{s['email']}: {exc}")
            continue

        supabase_admin.table("alertas_enviadas").insert(
            [
                {
                    "usuario_id": s["id"],
                    "tipo": a["tipo"],
                    "nivel": a["nivel"],
                    "fecha_pronostico": a["fecha"],
                    "mensaje": a["mensaje"],
                }
                for a in nuevas
            ]
        ).execute()
        resumen["enviados"] += 1

    return resumen


async def bucle_automatico() -> None:
    """Tarea de fondo (se activa con ALERTAS_AUTO=1 en main.py)."""
    horas = float(os.getenv("ALERTAS_INTERVALO_HORAS", "6"))
    while True:
        try:
            resumen = await run_in_threadpool(revisar_y_enviar, True)
            logger.info("Revisión de alertas: %s enviados, %s errores", resumen["enviados"], len(resumen["errores"]))
        except Exception:
            logger.exception("Falló la revisión automática de alertas")
        await asyncio.sleep(horas * 3600)


# ------------------------------------------------------------------ endpoints
class PreferenciaRequest(BaseModel):
    alertas_activas: bool


@router.get("/preferencia")
def obtener_preferencia(usuario: UsuarioActual = Depends(get_current_user)):
    fila = supabase_admin.table("profiles").select("alertas_activas").eq("id", usuario.id).single().execute()
    return {"alertas_activas": bool(fila.data["alertas_activas"]), "email": usuario.email}


@router.patch("/preferencia")
def cambiar_preferencia(datos: PreferenciaRequest, usuario: UsuarioActual = Depends(get_current_user)):
    supabase_admin.table("profiles").update({"alertas_activas": datos.alertas_activas}).eq("id", usuario.id).execute()
    return {"alertas_activas": datos.alertas_activas}


@router.get("/pronostico")
def pronostico(usuario: UsuarioActual = Depends(get_current_user)):
    diario = obtener_pronostico()
    dias = [
        {
            "fecha": f,
            "lluvia_mm": valor_en(diario.get("precipitation_sum"), i),
            "prob_lluvia": valor_en(diario.get("precipitation_probability_max"), i),
            "tmax": valor_en(diario.get("temperature_2m_max"), i),
            "tmin": valor_en(diario.get("temperature_2m_min"), i),
            "rafaga": valor_en(diario.get("wind_gusts_10m_max"), i),
        }
        for i, f in enumerate(diario.get("time") or [])
    ]
    return {
        "fuente": "Open-Meteo (pronóstico)",
        "dias": dias,
        "alertas": evaluar_pronostico(diario),
        "umbrales": UMBRALES,
    }


@router.post("/revisar")
def revisar(simular: bool = False, usuario: UsuarioActual = Depends(requiere_admin)):
    """Solo administrador. Con simular=true no se envía ni se registra nada."""
    resumen = revisar_y_enviar(enviar=not simular)
    if not simular:
        supabase_admin.table("auditoria").insert(
            {
                "usuario_id": usuario.id,
                "accion": "enviar_alertas",
                "tabla_afectada": "alertas_enviadas",
                "detalle": {
                    "alertas": len(resumen["alertas_detectadas"]),
                    "enviados": resumen["enviados"],
                    "errores": len(resumen["errores"]),
                },
            }
        ).execute()
    return resumen


@router.get("/historial")
def historial(usuario: UsuarioActual = Depends(requiere_admin)):
    filas = (
        supabase_admin.table("alertas_enviadas")
        .select("tipo,nivel,fecha_pronostico,enviado_en,profiles(nombre_completo)")
        .order("enviado_en", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    return filas


# ------------------------------------------------------- correo de prueba
class PruebaRequest(BaseModel):
    tipo: str = "lluvia"          # lluvia | helada | calor | viento
    a_suscriptores: bool = False  # solo administrador


ESPERA_PRUEBA_SEGUNDOS = 20
_ultima_prueba: dict[str, float] = {}


@router.post("/prueba")
def enviar_prueba(datos: PruebaRequest, usuario: UsuarioActual = Depends(get_current_user)):
    """
    Envía un correo de PRUEBA con una alerta simulada (no se registra como alerta real).
    - Cualquier usuario: se envía solo a su propio correo.
    - Administrador con a_suscriptores=true: se envía a quienes activaron las alertas.
    """
    if datos.tipo not in VALORES_PRUEBA:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Usa uno de: {list(VALORES_PRUEBA)}")
    if datos.a_suscriptores and usuario.rol != "administrador":
        raise HTTPException(status_code=403, detail="Solo un administrador puede enviar a los suscriptores.")

    ahora = time.monotonic()
    ultimo = _ultima_prueba.get(usuario.id)
    if ultimo is not None and ahora - ultimo < ESPERA_PRUEBA_SEGUNDOS:
        faltan = int(ESPERA_PRUEBA_SEGUNDOS - (ahora - ultimo)) + 1
        raise HTTPException(status_code=429, detail=f"Espera {faltan} segundos antes de enviar otra prueba.")
    _ultima_prueba[usuario.id] = ahora

    if datos.a_suscriptores:
        destinatarios = _suscriptores()
        if not destinatarios:
            raise HTTPException(status_code=400, detail="No hay suscriptores con las alertas activadas.")
    else:
        if not usuario.email:
            raise HTTPException(status_code=400, detail="Tu cuenta no tiene correo asociado.")
        perfil = (
            supabase_admin.table("profiles").select("nombre_completo").eq("id", usuario.id).single().execute()
        )
        destinatarios = [{"nombre": perfil.data["nombre_completo"], "email": usuario.email}]

    fecha = (date.today() + timedelta(days=1)).isoformat()
    alerta = alerta_de_prueba(datos.tipo, fecha)

    enviados, errores = 0, []
    for d in destinatarios:
        asunto, cuerpo = componer_correo(d["nombre"], [alerta], prueba=True)
        try:
            enviar_correo(d["email"], asunto, cuerpo)
            enviados += 1
        except Exception as exc:
            errores.append(f"{d['email']}: {exc}")

    if enviados == 0:
        raise HTTPException(status_code=502, detail=f"No se pudo enviar el correo de prueba. {errores[0]}")

    if datos.a_suscriptores:
        supabase_admin.table("auditoria").insert(
            {
                "usuario_id": usuario.id,
                "accion": "enviar_alerta_prueba",
                "tabla_afectada": "alertas_enviadas",
                "detalle": {"tipo": datos.tipo, "enviados": enviados, "errores": len(errores)},
            }
        ).execute()

    return {
        "enviados": enviados,
        "errores": errores,
        "destino": None if datos.a_suscriptores else usuario.email,
    }


# ------------------------------------------- enviarme las alertas actuales
_ultimo_envio_propio: dict[str, float] = {}


@router.post("/enviarme")
def enviarme_alertas(usuario: UsuarioActual = Depends(get_current_user)):
    """Envía al correo del propio usuario las alertas REALES detectadas ahora en el pronóstico."""
    ahora = time.monotonic()
    ultimo = _ultimo_envio_propio.get(usuario.id)
    if ultimo is not None and ahora - ultimo < ESPERA_PRUEBA_SEGUNDOS:
        faltan = int(ESPERA_PRUEBA_SEGUNDOS - (ahora - ultimo)) + 1
        raise HTTPException(status_code=429, detail=f"Espera {faltan} segundos antes de enviar otro correo.")
    _ultimo_envio_propio[usuario.id] = ahora

    if not usuario.email:
        raise HTTPException(status_code=400, detail="Tu cuenta no tiene correo asociado.")

    alertas = evaluar_pronostico(obtener_pronostico())
    if not alertas:
        raise HTTPException(status_code=400, detail="Ahora mismo no hay alertas en el pronóstico, no hay nada que enviar.")

    perfil = supabase_admin.table("profiles").select("nombre_completo").eq("id", usuario.id).single().execute()
    asunto, cuerpo = componer_correo(perfil.data["nombre_completo"], alertas)
    try:
        enviar_correo(usuario.email, asunto, cuerpo)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo enviar el correo. {exc}")
    return {"enviados": 1, "alertas": len(alertas), "destino": usuario.email}