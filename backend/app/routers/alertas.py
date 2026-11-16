"""
Alertas climáticas por correo para los usuarios que las activan.

Flujo: consulta el pronóstico diario de Open-Meteo -> aplica las reglas de
app/alertas_reglas.py -> envía un correo por usuario suscrito con las alertas
nuevas -> registra lo enviado en alertas_enviadas para no repetir.

Variables de entorno (backend/.env):
  SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_USER, SMTP_PASSWORD, SMTP_FROM,
  SMTP_STARTTLS (1 por defecto)
  ALERTAS_AUTO=1            revisa automáticamente mientras el backend esté encendido
  ALERTAS_INTERVALO_HORAS   cada cuántas horas (6 por defecto)
"""

import asyncio
import logging
import os
import smtplib
from email.message import EmailMessage

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.alertas_reglas import PARAMETROS_DIARIOS, UMBRALES, valor_en, componer_correo, evaluar_pronostico
from app.auth import UsuarioActual, get_current_user, requiere_admin, supabase_admin
from app.routers.registros import LATITUD_COCHABAMBA, LONGITUD_COCHABAMBA

router = APIRouter(prefix="/alertas", tags=["alertas"])
logger = logging.getLogger("climatech.alertas")

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DIAS_PRONOSTICO = 3


# ----------------------------------------------------------------- utilidades
def obtener_pronostico(dias: int = DIAS_PRONOSTICO) -> dict:
    params = {
        "latitude": LATITUD_COCHABAMBA,
        "longitude": LONGITUD_COCHABAMBA,
        "daily": ",".join(PARAMETROS_DIARIOS),
        "timezone": "America/La_Paz",
        "forecast_days": dias,
    }
    try:
        r = httpx.get(FORECAST_URL, params=params, timeout=20.0)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar el pronóstico de Open-Meteo: {exc}")
    return r.json().get("daily", {})


def enviar_correo(destino: str, asunto: str, cuerpo: str) -> None:
    host = os.getenv("SMTP_HOST")
    if not host:
        raise RuntimeError("SMTP no configurado (falta SMTP_HOST en backend/.env).")
    puerto = int(os.getenv("SMTP_PORT", "587"))
    usuario = os.getenv("SMTP_USER")
    clave = os.getenv("SMTP_PASSWORD")
    remitente = os.getenv("SMTP_FROM") or usuario or "alertas@climatech.local"

    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = remitente
    msg["To"] = destino
    msg.set_content(cuerpo)

    if puerto == 465:
        with smtplib.SMTP_SSL(host, puerto, timeout=20) as servidor:
            if usuario:
                servidor.login(usuario, clave or "")
            servidor.send_message(msg)
    else:
        with smtplib.SMTP(host, puerto, timeout=20) as servidor:
            if os.getenv("SMTP_STARTTLS", "1") == "1":
                servidor.starttls()
            if usuario:
                servidor.login(usuario, clave or "")
            servidor.send_message(msg)


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
