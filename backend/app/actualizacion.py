"""
Actualización automática diaria de los datos de ClimaTech.

Qué hace, en orden:
  1. Historial de Open-Meteo: importa los días nuevos desde el último registrado.
  2. Estación del aeropuerto (SLCB): descarga los reportes METAR de los últimos días.
  3. Pronósticos pasados de Open-Meteo: agrega los días nuevos (para el modelo híbrido).
  4. Reentrena la corrección de la estación y el modelo híbrido con los datos nuevos.

Cuándo se ejecuta (activado por defecto; ACTUALIZACION_AUTO=0 en backend/.env lo desactiva):
  - Al iniciar el backend, si hay días pendientes (el backend corre en una PC que no siempre
    está encendida, así que se pone al día apenas arranca).
  - Todos los días a ACTUALIZACION_HORA (hora de Bolivia, por defecto 05:30) si el backend está encendido.
  - A pedido de un administrador: POST /actualizacion/ejecutar o desde el asistente.

Cada paso es independiente: si uno falla (por ejemplo, no hay internet), los demás igual se intentan
y el error queda anotado en el estado y en la auditoría.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from threading import Lock

import httpx

logger = logging.getLogger("climatech.actualizacion")


def _aviso(texto: str) -> None:
    """Mensaje visible en la terminal del backend (uvicorn no muestra los logs INFO de la app)."""
    print(f"[ClimaTech · actualización] {datetime.now(BOLIVIA):%d/%m %H:%M} {texto}", flush=True)

BOLIVIA = timezone(timedelta(hours=-4))  # Bolivia no usa horario de verano
SOLAPE_DIAS = 2                          # se vuelven a pedir los últimos días por si llegaron incompletos
RETRASO_ARCHIVO = 5                      # el archivo histórico de Open-Meteo publica cada día con ~5 días de retraso
MAX_DIAS_TRAMO = 365
VARIABLES = ("temperatura", "humedad", "velocidad_viento")

_estado: dict = {"en_curso": False, "ultima": None}
_candado = Lock()


def hoy_bolivia() -> date:
    return datetime.now(BOLIVIA).date()


def estado() -> dict:
    with _candado:
        return {"en_curso": _estado["en_curso"], "ultima": _estado["ultima"], "programada": hora_programada()}


def hora_programada() -> str | None:
    if os.getenv("ACTUALIZACION_AUTO", "1") == "0":
        return None
    return os.getenv("ACTUALIZACION_HORA", "05:30")


# ------------------------------------------------------------------ consultas de "hasta dónde hay datos"
def _ultima_fecha(tabla: str, *filtros: tuple[str, str] | None) -> date | None:
    from app.auth import supabase_admin

    q = supabase_admin.table(tabla).select("fecha")
    for filtro in filtros:
        if filtro:
            q = q.eq(*filtro)
    filas = q.order("fecha", desc=True).limit(1).execute().data
    return date.fromisoformat(filas[0]["fecha"]) if filas else None


def _usuario_sistema() -> str | None:
    """Los registros importados necesitan un autor: se usa el primer administrador."""
    from app.auth import supabase_admin

    fijo = os.getenv("ACTUALIZACION_USUARIO_ID")
    if fijo:
        return fijo
    filas = supabase_admin.table("profiles").select("id").eq("rol", "administrador").limit(1).execute().data
    return filas[0]["id"] if filas else None


def pendientes() -> dict:
    """Días que faltan en cada fuente (para decidir si actualizar al iniciar)."""
    ayer = hoy_bolivia() - timedelta(days=1)
    resultado = {}
    for clave, tabla, filtro in (
        ("historial", "registros_diarios", None),
        ("estacion", "observaciones_estacion", ("estacion", "SLCB")),
        ("pronosticos_previos", "pronosticos_previos", ("variable", "temperatura")),
    ):
        try:
            ultima = _ultima_fecha(tabla, filtro)
            tolerancia = RETRASO_ARCHIVO if clave == "historial" else 0
            resultado[clave] = None if ultima is None else max((ayer - ultima).days - tolerancia, 0)
        except Exception:
            resultado[clave] = None  # tabla inexistente (falta una migración)
    return resultado


# ------------------------------------------------------------------ pasos
def _paso_historial(autor: str | None) -> dict:
    """Días nuevos del historial horario de Open-Meteo (archivo). Solo guarda horas con las 3 variables."""
    from app.auth import supabase_admin
    from app.routers.registros import LATITUD_COCHABAMBA, LONGITUD_COCHABAMBA, OPEN_METEO_URL

    ultima = _ultima_fecha("registros_diarios")
    if ultima is None:
        return {"omitido": "No hay historial inicial: impórtalo una vez desde el sistema."}
    if autor is None:
        return {"omitido": "No hay ningún administrador para registrar como autor de la importación."}
    inicio, fin = ultima + timedelta(days=1), hoy_bolivia() - timedelta(days=1)
    if inicio > fin:
        return {"dias": 0, "horas": 0}

    horas_guardadas, dias = 0, set()
    desde = inicio
    while desde <= fin:
        hasta = min(fin, desde + timedelta(days=MAX_DIAS_TRAMO - 1))
        r = httpx.get(
            OPEN_METEO_URL,
            params={
                "latitude": LATITUD_COCHABAMBA,
                "longitude": LONGITUD_COCHABAMBA,
                "start_date": desde.isoformat(),
                "end_date": hasta.isoformat(),
                "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m",
                "timezone": "America/La_Paz",
            },
            timeout=60,
        )
        r.raise_for_status()
        h = r.json().get("hourly") or {}
        temps, hums, vientos = (h.get(c) or [] for c in ("temperature_2m", "relative_humidity_2m", "wind_speed_10m"))
        filas = []
        for i, instante in enumerate(h.get("time") or []):
            t, hu, v = (lista[i] if i < len(lista) else None for lista in (temps, hums, vientos))
            # El archivo de Open-Meteo tarda unos días en completar las fechas recientes: las horas sin
            # dato NO se guardan, para que una próxima actualización las pueda completar.
            if t is None or hu is None or v is None:
                continue
            fecha, hora = instante.split("T")
            filas.append(
                {
                    "fecha": fecha,
                    "hora": f"{hora}:00",
                    "temperatura": t,
                    "humedad": hu,
                    "velocidad_viento": v,
                    "fuente": "open_meteo",
                    "registrado_por": autor,
                }
            )
            dias.add(fecha)
        for i in range(0, len(filas), 1000):
            supabase_admin.table("registros_climaticos").upsert(
                filas[i : i + 1000], on_conflict="fecha,hora,fuente", ignore_duplicates=True
            ).execute()
        horas_guardadas += len(filas)
        desde = hasta + timedelta(days=1)
    return {"dias": len(dias), "horas": horas_guardadas, "hasta": max(dias) if dias else None}


def _paso_estacion() -> dict:
    from app import estacion

    ultima = _ultima_fecha("observaciones_estacion", ("estacion", estacion.ESTACION))
    if ultima is None:
        return {"omitido": "Aún no se importó la estación: ejecuta una vez scripts\\importar_estacion.py."}
    inicio, fin = ultima - timedelta(days=SOLAPE_DIAS), hoy_bolivia() - timedelta(days=1)
    if inicio > fin:
        return {"dias": 0}
    dias = estacion.resumir_por_dia(estacion.descargar_iem(inicio, fin))
    if dias:
        estacion.guardar_observaciones(dias)
    return {"dias": len(dias), "completos": sum(1 for d in dias if d["temperatura"] is not None), "hasta": dias[-1]["fecha"] if dias else None}


def _paso_previos() -> dict:
    """
    Pronósticos pasados de cada modelo meteorológico. Cada modelo continúa desde su propia última fecha;
    un modelo que aún no tiene datos (por ejemplo, recién agregado) se descarga completo desde 2024.
    """
    from app import mos

    if _ultima_fecha("pronosticos_previos", ("variable", "temperatura")) is None:
        return {"omitido": "Aún no se importaron los pronósticos pasados: ejecuta una vez scripts\\importar_estacion.py."}
    fin = hoy_bolivia() - timedelta(days=1)
    total, por_modelo, errores = 0, {}, {}
    for modelo in [mos.PRINCIPAL] + mos.modelos_extra():
        try:
            ultima = _ultima_fecha("pronosticos_previos", ("variable", "temperatura"), ("modelo", modelo))
            inicio = mos.INICIO_DATOS if ultima is None else ultima - timedelta(days=SOLAPE_DIAS)
            if inicio > fin:
                continue
            filas = mos.descargar_previos_modelo(modelo, inicio, fin)
            if filas:
                mos.guardar_previos(filas)
            total += len(filas)
            por_modelo[mos.nombre_modelo(modelo)] = len(filas)
        except Exception as exc:
            if modelo == mos.PRINCIPAL:
                raise
            errores[mos.nombre_modelo(modelo)] = str(exc)[:160]
    salida = {"filas": total, "por_modelo": por_modelo, "hasta": fin.isoformat() if total else None}
    if errores:
        salida["modelos_con_error"] = errores
    return salida


def _paso_reentrenar() -> dict:
    """Recalcula la corrección y el modelo híbrido ya, así la primera consulta del día es rápida."""
    from app import estacion, mos

    estacion.limpiar_cache()
    mos.limpiar_cache()
    salida = {}
    for v in VARIABLES:
        c = estacion.obtener_correccion(v, forzar=True)
        m = mos.obtener_mos(v, forzar=True)
        salida[v] = {
            "correccion": c["elegido"] if c else None,
            "hibrido": m["elegido"] if m else None,
            "error_hibrido": next((o["mae"] for o in m["opciones"] if o["metodo"] == m["elegido"]), None) if m else None,
        }
    return salida


# ------------------------------------------------------------------ orquestación
def actualizar_todo(origen: str = "automatica") -> dict:
    """Ejecuta los 4 pasos. Si ya hay una actualización en curso, no inicia otra."""
    with _candado:
        if _estado["en_curso"]:
            return {"omitida": "Ya hay una actualización en curso."}
        _estado["en_curso"] = True
    inicio = time.time()
    pasos: dict[str, dict] = {}
    errores: list[str] = []
    try:
        try:
            autor = _usuario_sistema()
        except Exception:
            autor = None
        for nombre, funcion in (
            ("historial", lambda: _paso_historial(autor)),
            ("estacion", _paso_estacion),
            ("pronosticos_previos", _paso_previos),
            ("reentrenamiento", _paso_reentrenar),
        ):
            try:
                pasos[nombre] = funcion()
            except Exception as exc:  # un paso que falla no detiene a los demás
                logger.exception("Falló el paso %s de la actualización", nombre)
                pasos[nombre] = {"error": str(exc)[:300]}
                errores.append(f"{nombre}: {str(exc)[:200]}")
        resumen = {
            "origen": origen,
            "fecha": datetime.now(BOLIVIA).isoformat(timespec="minutes"),
            "segundos": round(time.time() - inicio, 1),
            "ok": not errores,
            "pasos": pasos,
            "errores": errores,
        }
        try:
            from app.auth import supabase_admin

            supabase_admin.table("auditoria").insert(
                {
                    "usuario_id": autor,
                    "accion": "actualizacion_datos",
                    "tabla_afectada": "registros_climaticos,observaciones_estacion,pronosticos_previos",
                    "detalle": resumen,
                }
            ).execute()
        except Exception:
            logger.warning("No se pudo registrar la actualización en la auditoría")
        _aviso(
            f"terminada ({origen}) en {resumen['segundos']} s · historial: {pasos.get('historial')} · "
            f"estación: {pasos.get('estacion')} · pronósticos pasados: {pasos.get('pronosticos_previos')}"
            + (f" · ERRORES: {errores}" if errores else "")
        )
        return resumen
    finally:
        with _candado:
            _estado["en_curso"] = False
            if "resumen" in locals():
                _estado["ultima"] = resumen


def _segundos_hasta(hora_texto: str) -> float:
    h, m = (int(x) for x in hora_texto.split(":"))
    ahora = datetime.now(BOLIVIA)
    objetivo = ahora.replace(hour=h, minute=m, second=0, microsecond=0)
    if objetivo <= ahora:
        objetivo += timedelta(days=1)
    return (objetivo - ahora).total_seconds()


async def bucle_automatico() -> None:
    """Tarea de fondo del backend: se pone al día al iniciar y luego se repite cada día a la hora programada."""
    from fastapi.concurrency import run_in_threadpool

    await asyncio.sleep(20)  # deja que el backend termine de arrancar
    try:
        faltan = await run_in_threadpool(pendientes)
        if any(v for v in faltan.values()):
            _aviso(f"días pendientes {faltan}: poniéndome al día…")
            await run_in_threadpool(actualizar_todo, "al_iniciar")
        else:
            # Sin días pendientes: igual se entrenan los modelos en segundo plano, así la primera
            # proyección después de encender el backend responde rápido.
            await run_in_threadpool(_paso_reentrenar)
            _aviso("datos al día; modelos listos")
    except Exception:
        logger.exception("Falló la actualización al iniciar")

    hora = hora_programada() or "05:30"
    _aviso(f"programada todos los días a las {hora} (hora de Bolivia)")
    while True:
        await asyncio.sleep(_segundos_hasta(hora))
        try:
            await run_in_threadpool(actualizar_todo, "diaria")
        except Exception:
            logger.exception("Falló la actualización diaria")
