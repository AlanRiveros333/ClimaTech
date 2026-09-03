"""
Endpoint para importar datos históricos de clima desde la API pública
de Open-Meteo (archive-api.open-meteo.com) y guardarlos en Supabase.

Coordenadas fijas: Cochabamba, Bolivia.
"""

from datetime import date, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.auth import get_current_user, supabase_admin, UsuarioActual

router = APIRouter(prefix="/registros", tags=["registros"])

LATITUD_COCHABAMBA = -17.3895
LONGITUD_COCHABAMBA = -66.1568
OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"

MAX_DIAS_POR_IMPORTACION = 366


class ImportarOpenMeteoRequest(BaseModel):
    fecha_inicio: date
    fecha_fin: date

    @field_validator("fecha_fin")
    @classmethod
    def fecha_fin_no_menor_que_inicio(cls, v, info):
        inicio = info.data.get("fecha_inicio")
        if inicio and v < inicio:
            raise ValueError("fecha_fin no puede ser anterior a fecha_inicio")
        return v


class RegistroManualRequest(BaseModel):
    fecha: date
    hora: str  # formato "HH:MM"
    temperatura: float | None = None
    humedad: float | None = None
    velocidad_viento: float | None = None

    @field_validator("humedad")
    @classmethod
    def humedad_en_rango(cls, v):
        if v is not None and not (0 <= v <= 100):
            raise ValueError("La humedad debe estar entre 0 y 100")
        return v

    @field_validator("velocidad_viento")
    @classmethod
    def viento_no_negativo(cls, v):
        if v is not None and v < 0:
            raise ValueError("La velocidad del viento no puede ser negativa")
        return v


@router.post("/manual")
async def registrar_manual(
    datos: RegistroManualRequest,
    usuario: UsuarioActual = Depends(get_current_user),
):
    """Registra una lectura climática ingresada manualmente por el usuario."""
    if datos.fecha > date.today():
        raise HTTPException(status_code=400, detail="No se pueden registrar fechas futuras.")

    resultado = (
        supabase_admin.table("registros_climaticos")
        .insert(
            {
                "fecha": datos.fecha.isoformat(),
                "hora": datos.hora,
                "temperatura": datos.temperatura,
                "humedad": datos.humedad,
                "velocidad_viento": datos.velocidad_viento,
                "fuente": "manual",
                "registrado_por": usuario.id,
            }
        )
        .execute()
    )

    supabase_admin.table("auditoria").insert(
        {
            "usuario_id": usuario.id,
            "accion": "registro_manual",
            "tabla_afectada": "registros_climaticos",
            "detalle": {"fecha": datos.fecha.isoformat(), "hora": datos.hora},
        }
    ).execute()

    return {"mensaje": "Registro guardado correctamente.", "registro": resultado.data}


@router.post("/importar-open-meteo")
async def importar_open_meteo(
    datos: ImportarOpenMeteoRequest,
    usuario: UsuarioActual = Depends(get_current_user),
):
    """Importa temperatura, humedad y viento históricos desde Open-Meteo para Cochabamba."""
    if datos.fecha_fin > date.today():
        raise HTTPException(status_code=400, detail="fecha_fin no puede ser futura.")

    dias_solicitados = (datos.fecha_fin - datos.fecha_inicio).days + 1
    if dias_solicitados > MAX_DIAS_POR_IMPORTACION:
        raise HTTPException(
            status_code=400,
            detail=f"El rango máximo por importación es de {MAX_DIAS_POR_IMPORTACION} días.",
        )

    params = {
        "latitude": LATITUD_COCHABAMBA,
        "longitude": LONGITUD_COCHABAMBA,
        "start_date": datos.fecha_inicio.isoformat(),
        "end_date": datos.fecha_fin.isoformat(),
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m",
        "timezone": "America/La_Paz",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502, detail=f"No se pudo contactar a Open-Meteo: {exc}"
            )

    payload = response.json()
    horas = payload.get("hourly", {})
    tiempos = horas.get("time", [])
    temperaturas = horas.get("temperature_2m", [])
    humedades = horas.get("relative_humidity_2m", [])
    vientos = horas.get("wind_speed_10m", [])

    if not tiempos:
        raise HTTPException(status_code=502, detail="Open-Meteo no devolvió datos para ese rango.")

    registros = []
    for i, marca_tiempo in enumerate(tiempos):
        # marca_tiempo llega como "2024-06-01T00:00"
        fecha_str, hora_str = marca_tiempo.split("T")
        registros.append(
            {
                "fecha": fecha_str,
                "hora": f"{hora_str}:00",
                "temperatura": temperaturas[i] if i < len(temperaturas) else None,
                "humedad": humedades[i] if i < len(humedades) else None,
                "velocidad_viento": vientos[i] if i < len(vientos) else None,
                "fuente": "open_meteo",
                "registrado_por": usuario.id,
            }
        )

    # upsert: si ya existe (misma fecha+hora+fuente) lo ignora en vez de fallar
    resultado = (
        supabase_admin.table("registros_climaticos")
        .upsert(registros, on_conflict="fecha,hora,fuente", ignore_duplicates=True)
        .execute()
    )

    supabase_admin.table("auditoria").insert(
        {
            "usuario_id": usuario.id,
            "accion": "importar_open_meteo",
            "tabla_afectada": "registros_climaticos",
            "detalle": {
                "fecha_inicio": datos.fecha_inicio.isoformat(),
                "fecha_fin": datos.fecha_fin.isoformat(),
                "registros_procesados": len(registros),
            },
        }
    ).execute()

    return {
        "mensaje": "Importación completada.",
        "registros_procesados": len(registros),
    }


@router.get("")
async def listar_registros(
    limite: int = 50,
    usuario: UsuarioActual = Depends(get_current_user),
):
    """Lista los registros climáticos más recientes."""
    resultado = (
        supabase_admin.table("registros_climaticos")
        .select("*")
        .order("fecha", desc=True)
        .order("hora", desc=True)
        .limit(limite)
        .execute()
    )
    return resultado.data
