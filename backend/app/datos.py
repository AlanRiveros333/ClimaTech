"""
Acceso a datos compartido por los módulos de IA, alertas y fenómenos.

Importante: la API de Supabase devuelve como máximo 1000 filas por consulta.
Como los registros son horarios (24 por día), una consulta directa a
registros_climaticos se corta a los ~41 días. Por eso se lee la vista
registros_diarios (1 fila por día) y se pagina con range().
"""

from datetime import date

import pandas as pd
from fastapi import HTTPException

from app.auth import supabase_admin

VARIABLES_VALIDAS = ("temperatura", "humedad", "velocidad_viento")
TAMANO_PAGINA = 1000


def cargar_serie_diaria(variable: str, inicio: date | None, fin: date | None) -> pd.DataFrame:
    """Devuelve un DataFrame (fecha, <variable>) con el promedio diario, ordenado por fecha."""
    if variable not in VARIABLES_VALIDAS:
        raise HTTPException(
            status_code=400, detail=f"Variable inválida. Usa una de: {list(VARIABLES_VALIDAS)}"
        )

    filas: list[dict] = []
    desde = 0
    while True:
        consulta = supabase_admin.table("registros_diarios").select(f"fecha,{variable}").order("fecha")
        if inicio:
            consulta = consulta.gte("fecha", inicio.isoformat())
        if fin:
            consulta = consulta.lte("fecha", fin.isoformat())
        pagina = consulta.range(desde, desde + TAMANO_PAGINA - 1).execute().data or []
        filas.extend(pagina)
        if len(pagina) < TAMANO_PAGINA:
            break
        desde += TAMANO_PAGINA

    df = pd.DataFrame(filas)
    if df.empty or variable not in df.columns:
        raise HTTPException(status_code=404, detail="No hay registros históricos en ese período.")

    df = df.dropna(subset=[variable])
    if df.empty:
        raise HTTPException(
            status_code=404, detail=f"No hay valores de '{variable}' en ese período."
        )

    df["fecha"] = pd.to_datetime(df["fecha"])
    return df.sort_values("fecha").reset_index(drop=True)


def listar_eventos() -> list[dict]:
    """Eventos El Niño / La Niña ordenados del más reciente al más antiguo."""
    resultado = (
        supabase_admin.table("eventos_climaticos")
        .select("*")
        .order("fecha_inicio", desc=True)
        .execute()
    )
    return resultado.data or []
