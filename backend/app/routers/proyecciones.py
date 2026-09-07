"""
Endpoint que genera proyecciones estadísticas sobre una variable
climática usando uno de 3 métodos, y calcula sus métricas de error.
"""

from datetime import date, timedelta

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from statsmodels.tsa.holtwinters import Holt

from app.auth import get_current_user, supabase_admin, UsuarioActual

router = APIRouter(prefix="/proyecciones", tags=["proyecciones"])

VARIABLES_VALIDAS = {"temperatura", "humedad", "velocidad_viento"}
METODOS_VALIDOS = {"promedio_movil", "holt", "regresion_lineal"}


class GenerarProyeccionRequest(BaseModel):
    variable: str
    metodo: str
    periodo_inicio: date
    periodo_fin: date
    dias_a_proyectar: int = 7


def _cargar_serie(variable: str, periodo_inicio: date, periodo_fin: date) -> pd.DataFrame:
    """Trae los registros históricos y arma un promedio diario (una fila por día)."""
    resultado = (
        supabase_admin.table("registros_climaticos")
        .select(f"fecha,{variable}")
        .gte("fecha", periodo_inicio.isoformat())
        .lte("fecha", periodo_fin.isoformat())
        .execute()
    )

    if not resultado.data:
        raise HTTPException(status_code=404, detail="No hay registros históricos en ese período.")

    df = pd.DataFrame(resultado.data)
    df = df.dropna(subset=[variable])
    if df.empty:
        raise HTTPException(
            status_code=404, detail=f"No hay valores de '{variable}' en ese período."
        )

    # Promedio diario, por si hay varias lecturas por día
    df = df.groupby("fecha", as_index=False)[variable].mean()
    df["fecha"] = pd.to_datetime(df["fecha"])
    df = df.sort_values("fecha").reset_index(drop=True)
    return df


def _metricas(y_real, y_pred) -> dict:
    return {
        "mae": round(float(mean_absolute_error(y_real, y_pred)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_real, y_pred))), 4),
    }


def _proyectar_promedio_movil(df: pd.DataFrame, variable: str, dias_a_proyectar: int, ventana: int = 7):
    serie = df[variable]
    ventana = min(ventana, len(serie))

    # Métrica en-muestra: comparar cada valor real contra el promedio móvil de los N anteriores
    movil = serie.rolling(window=ventana, min_periods=1).mean().shift(1)
    validos = movil.notna()
    metricas = _metricas(serie[validos], movil[validos]) if validos.sum() > 0 else {"mae": None, "rmse": None}

    ultimo_promedio = serie.tail(ventana).mean()
    ultima_fecha = df["fecha"].max()
    valores = [
        {"fecha": (ultima_fecha + timedelta(days=i + 1)).date().isoformat(), "valor": round(float(ultimo_promedio), 4)}
        for i in range(dias_a_proyectar)
    ]
    parametros = {"ventana": ventana}
    return valores, parametros, metricas, None


def _proyectar_holt(df: pd.DataFrame, variable: str, dias_a_proyectar: int):
    serie = df[variable].reset_index(drop=True)
    if len(serie) < 4:
        raise HTTPException(status_code=400, detail="Se necesitan al menos 4 días de historial para usar Holt.")

    modelo = Holt(serie, initialization_method="estimated").fit()
    ajuste = modelo.fittedvalues
    metricas = _metricas(serie[1:], ajuste[1:])  # el primer valor ajustado no es comparable

    pronostico = modelo.forecast(dias_a_proyectar)
    ultima_fecha = df["fecha"].max()
    valores = [
        {"fecha": (ultima_fecha + timedelta(days=i + 1)).date().isoformat(), "valor": round(float(v), 4)}
        for i, v in enumerate(pronostico)
    ]
    parametros = {
        "alpha": round(float(modelo.params["smoothing_level"]), 4),
        "beta": round(float(modelo.params["smoothing_trend"]), 4),
    }
    return valores, parametros, metricas, None


def _proyectar_regresion_lineal(df: pd.DataFrame, variable: str, dias_a_proyectar: int):
    if len(df) < 5:
        raise HTTPException(
            status_code=400, detail="Se necesitan al menos 5 días de historial para la regresión lineal."
        )

    df = df.copy()
    df["dia_ordinal"] = df["fecha"].map(lambda f: f.toordinal())
    df["dia_anio"] = df["fecha"].dt.dayofyear
    df["sin_anio"] = np.sin(2 * np.pi * df["dia_anio"] / 365.25)
    df["cos_anio"] = np.cos(2 * np.pi * df["dia_anio"] / 365.25)

    X = df[["dia_ordinal", "sin_anio", "cos_anio"]]
    y = df[variable]

    modelo = LinearRegression().fit(X, y)
    y_pred = modelo.predict(X)

    metricas = _metricas(y, y_pred)
    r2 = round(float(r2_score(y, y_pred)), 4)

    ultima_fecha = df["fecha"].max()
    fechas_futuras = [ultima_fecha + timedelta(days=i + 1) for i in range(dias_a_proyectar)]
    X_futuro = pd.DataFrame(
        {
            "dia_ordinal": [f.toordinal() for f in fechas_futuras],
            "dia_anio": [f.dayofyear for f in fechas_futuras],
        }
    )
    X_futuro["sin_anio"] = np.sin(2 * np.pi * X_futuro["dia_anio"] / 365.25)
    X_futuro["cos_anio"] = np.cos(2 * np.pi * X_futuro["dia_anio"] / 365.25)
    predicciones = modelo.predict(X_futuro[["dia_ordinal", "sin_anio", "cos_anio"]])

    valores = [
        {"fecha": f.date().isoformat(), "valor": round(float(v), 4)}
        for f, v in zip(fechas_futuras, predicciones)
    ]
    parametros = {
        "coeficientes": {
            "dia_ordinal": round(float(modelo.coef_[0]), 6),
            "sin_anio": round(float(modelo.coef_[1]), 4),
            "cos_anio": round(float(modelo.coef_[2]), 4),
        },
        "intercepto": round(float(modelo.intercept_), 4),
    }
    return valores, parametros, metricas, r2


@router.post("/generar")
async def generar_proyeccion(
    datos: GenerarProyeccionRequest,
    usuario: UsuarioActual = Depends(get_current_user),
):
    if datos.variable not in VARIABLES_VALIDAS:
        raise HTTPException(status_code=400, detail=f"Variable inválida. Usa una de: {VARIABLES_VALIDAS}")
    if datos.metodo not in METODOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Método inválido. Usa uno de: {METODOS_VALIDOS}")
    if datos.dias_a_proyectar < 1 or datos.dias_a_proyectar > 30:
        raise HTTPException(status_code=400, detail="dias_a_proyectar debe estar entre 1 y 30.")

    df = _cargar_serie(datos.variable, datos.periodo_inicio, datos.periodo_fin)

    if datos.metodo == "promedio_movil":
        valores, parametros, metricas, r2 = _proyectar_promedio_movil(df, datos.variable, datos.dias_a_proyectar)
    elif datos.metodo == "holt":
        valores, parametros, metricas, r2 = _proyectar_holt(df, datos.variable, datos.dias_a_proyectar)
    else:
        valores, parametros, metricas, r2 = _proyectar_regresion_lineal(df, datos.variable, datos.dias_a_proyectar)

    # Guardar metadatos de la proyección
    proyeccion_insert = (
        supabase_admin.table("proyecciones")
        .insert(
            {
                "variable": datos.variable,
                "metodo": datos.metodo,
                "parametros": parametros,
                "periodo_inicio": datos.periodo_inicio.isoformat(),
                "periodo_fin": datos.periodo_fin.isoformat(),
                "mae": metricas["mae"],
                "rmse": metricas["rmse"],
                "r2": r2,
                "generado_por": usuario.id,
            }
        )
        .execute()
    )
    proyeccion_id = proyeccion_insert.data[0]["id"]

    # Guardar los valores proyectados día por día
    filas_valores = [{"proyeccion_id": proyeccion_id, **v} for v in valores]
    supabase_admin.table("proyeccion_valores").insert(filas_valores).execute()

    return {
        "proyeccion_id": proyeccion_id,
        "variable": datos.variable,
        "metodo": datos.metodo,
        "parametros": parametros,
        "metricas": {**metricas, "r2": r2},
        "historico": [
            {"fecha": f.date().isoformat(), "valor": round(float(v), 4)}
            for f, v in zip(df["fecha"], df[datos.variable])
        ],
        "proyeccion": valores,
    }
