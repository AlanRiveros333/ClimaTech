"""
Pronóstico de Open-Meteo para las MISMAS fechas que proyecta ClimaTech.

Sirve como referencia externa: Open-Meteo usa modelos meteorológicos físicos
(simulan la atmósfera), por eso puede anticipar olas de calor o tormentas que
un método estadístico, que solo mira el pasado, no puede ver venir.

Importante para comparar bien: en ClimaTech la "temperatura" de un día es el
PROMEDIO de las 24 lecturas horarias (igual que al importar el histórico).
Las páginas de clima muestran la MÁXIMA del día, que en Cochabamba suele estar
10 a 14 °C por encima del promedio. Por eso aquí se calcula también el promedio
diario a partir de los datos horarios: así la comparación es justa.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

import httpx

from app.routers.registros import LATITUD_COCHABAMBA, LONGITUD_COCHABAMBA

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DIAS_PASADOS_MAX = 90   # la API de pronóstico guarda unos 3 meses hacia atrás
DIAS_FUTUROS_MAX = 15   # y hasta 16 días hacia adelante (hoy + 15)

# Variable de ClimaTech -> variable horaria de Open-Meteo
HORARIAS = {
    "temperatura": "temperature_2m",
    "humedad": "relative_humidity_2m",
    "velocidad_viento": "wind_speed_10m",
}
DIARIAS = (
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
)


def _ix(lista, i):
    return lista[i] if lista and i < len(lista) else None


def obtener_referencia(fechas: list[str], timeout: float = 8.0) -> dict[str, dict] | None:
    """
    fechas: fechas ISO de la proyección. Devuelve {fecha: {...}} solo para las fechas que
    Open-Meteo cubre, o None si no hay conexión o ninguna fecha está dentro de su rango.
    """
    if not fechas:
        return None
    hoy = date.today()
    inicio = max(date.fromisoformat(fechas[0]), hoy - timedelta(days=DIAS_PASADOS_MAX))
    fin = min(date.fromisoformat(fechas[-1]), hoy + timedelta(days=DIAS_FUTUROS_MAX))
    if fin < inicio:
        return None

    params = {
        "latitude": LATITUD_COCHABAMBA,
        "longitude": LONGITUD_COCHABAMBA,
        "hourly": ",".join(HORARIAS.values()),
        "daily": ",".join(DIARIAS),
        "timezone": "America/La_Paz",
        "start_date": inicio.isoformat(),
        "end_date": fin.isoformat(),
    }
    try:
        r = httpx.get(FORECAST_URL, params=params, timeout=timeout)
        r.raise_for_status()
        datos = r.json()
    except (httpx.HTTPError, ValueError):
        return None

    # Promedio diario de los datos horarios (mismo criterio que el histórico de ClimaTech)
    h = datos.get("hourly") or {}
    sumas: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for i, instante in enumerate(h.get("time") or []):
        dia = instante[:10]
        for variable, campo in HORARIAS.items():
            v = _ix(h.get(campo), i)
            if v is not None:
                sumas[dia][variable].append(float(v))

    d = datos.get("daily") or {}
    salida: dict[str, dict] = {}
    for i, dia in enumerate(d.get("time") or []):
        promedios = {v: round(sum(xs) / len(xs), 2) for v, xs in sumas[dia].items() if xs}
        # máxima y mínima horaria de cada variable (las usa el modelo híbrido como datos de entrada)
        for v, xs in sumas[dia].items():
            if len(xs) >= 20:
                promedios[f"{v}_max"] = round(max(xs), 2)
                promedios[f"{v}_min"] = round(min(xs), 2)
        salida[dia] = {
            **promedios,
            "codigo": _ix(d.get("weather_code"), i),
            "tmax": _ix(d.get("temperature_2m_max"), i),
            "tmin": _ix(d.get("temperature_2m_min"), i),
            "lluvia_mm": _ix(d.get("precipitation_sum"), i),
            "prob_lluvia": _ix(d.get("precipitation_probability_max"), i),
        }
    return salida or None


def distancia(proyeccion: list[dict], referencia: dict[str, dict], variable: str) -> tuple[float, int] | None:
    """Diferencia absoluta media entre una proyección y Open-Meteo, en los días que ambos cubren."""
    pares = [
        (p["valor"], referencia[p["fecha"]][variable])
        for p in proyeccion
        if p["fecha"] in referencia and referencia[p["fecha"]].get(variable) is not None
    ]
    if not pares:
        return None
    return round(sum(abs(a - b) for a, b in pares) / len(pares), 3), len(pares)


# ------------------------------------------------------------------ varios modelos meteorológicos
_cache_multi: dict[tuple, tuple[float, dict]] = {}
CACHE_MULTI_SEGUNDOS = 1800  # los modelos se actualizan cada ~6 horas


def _pronostico_de_modelo(modelo: str, inicio: date, fin: date, timeout: float) -> dict[str, dict]:
    """{fecha: {variable: {media, maxima, minima}}} con el pronóstico actual de UN modelo."""
    r = httpx.get(
        FORECAST_URL,
        params={
            "latitude": LATITUD_COCHABAMBA,
            "longitude": LONGITUD_COCHABAMBA,
            "hourly": ",".join(HORARIAS.values()),
            "models": modelo,
            "timezone": "America/La_Paz",
            "start_date": inicio.isoformat(),
            "end_date": fin.isoformat(),
        },
        timeout=timeout,
    )
    r.raise_for_status()
    h = r.json().get("hourly") or {}
    sufijo = f"_{modelo}"
    series = {(k[: -len(sufijo)] if k.endswith(sufijo) else k): v for k, v in h.items() if k != "time"}
    acum: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for i, instante in enumerate(h.get("time") or []):
        for variable, campo in HORARIAS.items():
            v = _ix(series.get(campo), i)
            if v is not None:
                acum[instante[:10]][variable].append(float(v))
    salida: dict[str, dict] = {}
    for dia, por_var in acum.items():
        for variable, xs in por_var.items():
            if len(xs) >= 20:
                salida.setdefault(dia, {})[variable] = {
                    "media": round(sum(xs) / len(xs), 2),
                    "maxima": round(max(xs), 2),
                    "minima": round(min(xs), 2),
                }
    return salida


def obtener_multimodelo(fechas: list[str], modelos: list[str], timeout: float = 10.0) -> dict[str, dict]:
    """
    Pronóstico actual de cada modelo para las fechas dadas: {fecha: {modelo: {variable: {media, maxima, minima}}}}.
    Las consultas van en paralelo; un modelo que falla o no cubre una fecha simplemente no aparece.
    """
    if not fechas or not modelos:
        return {}
    from concurrent.futures import ThreadPoolExecutor
    import time

    hoy = date.today()
    inicio = max(date.fromisoformat(fechas[0]), hoy - timedelta(days=DIAS_PASADOS_MAX))
    fin = min(date.fromisoformat(fechas[-1]), hoy + timedelta(days=DIAS_FUTUROS_MAX))
    if fin < inicio:
        return {}
    clave = (inicio, fin, tuple(modelos))
    guardado = _cache_multi.get(clave)
    if guardado and time.time() - guardado[0] < CACHE_MULTI_SEGUNDOS:
        return guardado[1]

    def uno(m):
        try:
            return m, _pronostico_de_modelo(m, inicio, fin, timeout)
        except Exception:
            return m, {}

    salida: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=min(8, len(modelos))) as ex:
        for m, por_fecha in ex.map(uno, modelos):
            for f, datos in por_fecha.items():
                salida.setdefault(f, {})[m] = datos
    _cache_multi[clave] = (time.time(), salida)
    return salida
