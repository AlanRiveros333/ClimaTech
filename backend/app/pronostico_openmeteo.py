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
