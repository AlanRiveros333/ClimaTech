"""
Carga varios años de histórico horario de Open-Meteo en registros_climaticos,
en tramos de hasta 360 días (la API del sistema limita a 366 por importación).
Sirve para tener datos suficientes para los modelos de IA y para las anomalías
de El Niño, y también para llenar una base local antes de la defensa.

Uso (desde la carpeta backend, con el entorno virtual activo):
    python -m scripts.cargar_historico 2018-01-01 2026-11-01
    python -m scripts.cargar_historico 2018-01-01 2026-11-01 --usuario <UUID_DEL_ADMIN>

Si registros_climaticos.registrado_por no admite nulos, pasa --usuario con el
id de un usuario existente (columna id de la tabla profiles).
Es repetible: no duplica registros (fecha + hora + fuente).
"""

import argparse
import sys
import time
from datetime import date, timedelta

import httpx

from app.auth import supabase_admin
from app.routers.registros import LATITUD_COCHABAMBA, LONGITUD_COCHABAMBA, OPEN_METEO_URL

TRAMO_DIAS = 360
LOTE_FILAS = 1000


def descargar(inicio: date, fin: date) -> list[dict]:
    params = {
        "latitude": LATITUD_COCHABAMBA,
        "longitude": LONGITUD_COCHABAMBA,
        "start_date": inicio.isoformat(),
        "end_date": fin.isoformat(),
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m",
        "timezone": "America/La_Paz",
    }
    r = httpx.get(OPEN_METEO_URL, params=params, timeout=60.0)
    r.raise_for_status()
    h = r.json().get("hourly", {})
    filas = []
    for i, marca in enumerate(h.get("time", [])):
        fecha, hora = marca.split("T")
        t = h["temperature_2m"][i]
        hu = h["relative_humidity_2m"][i]
        v = h["wind_speed_10m"][i]
        if t is None and hu is None and v is None:
            continue  # día aún no publicado por Open-Meteo
        filas.append(
            {
                "fecha": fecha,
                "hora": f"{hora}:00",
                "temperatura": t,
                "humedad": hu,
                "velocidad_viento": v,
                "fuente": "open_meteo",
            }
        )
    return filas


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inicio", type=date.fromisoformat)
    ap.add_argument("fin", type=date.fromisoformat)
    ap.add_argument("--usuario", help="UUID para registrado_por (opcional)")
    args = ap.parse_args()

    if args.fin < args.inicio:
        print("La fecha final no puede ser anterior a la inicial.")
        return 1
    if args.fin > date.today():
        args.fin = date.today()

    total = 0
    actual = args.inicio
    while actual <= args.fin:
        tramo_fin = min(actual + timedelta(days=TRAMO_DIAS - 1), args.fin)
        print(f"Descargando {actual} -> {tramo_fin} ...", flush=True)
        filas = descargar(actual, tramo_fin)
        if args.usuario:
            for f in filas:
                f["registrado_por"] = args.usuario
        for i in range(0, len(filas), LOTE_FILAS):
            supabase_admin.table("registros_climaticos").upsert(
                filas[i : i + LOTE_FILAS], on_conflict="fecha,hora,fuente", ignore_duplicates=True
            ).execute()
        total += len(filas)
        print(f"   {len(filas)} registros procesados", flush=True)
        actual = tramo_fin + timedelta(days=1)
        time.sleep(1)  # cortesía con la API gratuita

    print(f"Listo: {total} registros procesados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
