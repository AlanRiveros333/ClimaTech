"""
Modelo híbrido: pronóstico de Open-Meteo + corrección aprendida (técnica MOS, «Model Output Statistics»).

Idea:
  Los métodos estadísticos solo ven el pasado y no pueden anticipar una ola de calor o un frente frío.
  Los modelos meteorológicos físicos (Open-Meteo) sí, pero tienen errores sistemáticos en un valle de
  montaña como Cochabamba. MOS combina ambos: los modelos matemáticos de ClimaTech (regresión lineal,
  Random Forest, Gradient Boosting) reciben como DATO DE ENTRADA el pronóstico de Open-Meteo y aprenden
  a corregirlo, comparando pronósticos pasados con lo que realmente midió la estación del aeropuerto.

Datos de entrenamiento:
  - Pronósticos pasados: Previous Runs API de Open-Meteo (lo que se pronosticó 1 a 7 días antes).
  - Verdad medida: estación SLCB (tabla observaciones_estacion, paso 1).

Validación (igual de honesta que el resto del sistema): tres tramos en orden de tiempo.
Los modelos aprenden con el 60 % más antiguo, los pesos de la combinación se calculan con el 15 %
siguiente y todas las opciones se califican con el último 25 %, que nadie vio antes.
"""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import date, timedelta
from threading import Lock

import httpx
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from scipy.optimize import nnls
from sklearn.linear_model import LinearRegression

PREVIOUS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
INICIO_DATOS = date(2024, 1, 1)  # desde cuándo hay pronósticos pasados para la mayoría de modelos
ANTICIPACIONES = range(1, 8)     # 1 a 7 días de anticipación
HORAS_MINIMAS = 20
FRACCION_PRUEBA = 0.25
FRACCION_VALIDACION = 0.15       # tramo para calcular los pesos de la combinación
FECHAS_MINIMAS = 90
TRAMO_DIAS = 92                  # días por pedido a la API
VARIABLES = {"temperatura": "temperature_2m", "humedad": "relative_humidity_2m", "velocidad_viento": "wind_speed_10m"}
LIMITES = {"temperatura": (-30.0, 50.0), "humedad": (0.0, 100.0), "velocidad_viento": (0.0, 200.0)}
CARACTERISTICAS = ["anticipacion", "media", "maxima", "minima", "sin_dia", "cos_dia"]

NOMBRES = {
    "openmeteo_crudo": "Open-Meteo sin corregir",
    "mos_lineal": "Open-Meteo + Regresión lineal",
    "mos_random_forest": "Open-Meteo + Random Forest (IA)",
    "mos_gradient_boosting": "Open-Meteo + Gradient Boosting (IA)",
    "ensamble": "Combinación ponderada de los 4",
}


# =================================================================== lógica pura
def resumir_previos(datos: dict) -> list[dict]:
    """Respuesta horaria de la Previous Runs API -> filas diarias (fecha, variable, anticipación, media, máx, mín)."""
    h = datos.get("hourly") or {}
    tiempos = h.get("time") or []
    acum: dict[tuple, list[float]] = defaultdict(list)
    for variable, campo in VARIABLES.items():
        for k in ANTICIPACIONES:
            valores = h.get(f"{campo}_previous_day{k}") or []
            for i, instante in enumerate(tiempos):
                v = valores[i] if i < len(valores) else None
                if v is not None:
                    acum[(instante[:10], variable, k)].append(float(v))
    filas = []
    for (fecha, variable, k), xs in sorted(acum.items()):
        if len(xs) < HORAS_MINIMAS:
            continue
        filas.append(
            {
                "fecha": fecha,
                "variable": variable,
                "anticipacion": k,
                "media": round(sum(xs) / len(xs), 2),
                "maxima": round(max(xs), 2),
                "minima": round(min(xs), 2),
                "modelo": "best_match",
            }
        )
    return filas


def _estacionalidad(fechas: pd.Series) -> tuple[np.ndarray, np.ndarray]:
    dia = pd.to_datetime(fechas).dt.dayofyear.to_numpy()
    ang = 2 * np.pi * dia / 365.25
    return np.sin(ang), np.cos(ang)


def construir_dataset(previos: pd.DataFrame, observado: pd.DataFrame) -> pd.DataFrame:
    """previos[fecha, anticipacion, media, maxima, minima] + observado[fecha, est] -> tabla de entrenamiento."""
    d = previos.merge(observado, on="fecha", how="inner").dropna(subset=["media", "maxima", "minima", "est"])
    d = d.sort_values(["fecha", "anticipacion"]).reset_index(drop=True)
    d["sin_dia"], d["cos_dia"] = _estacionalidad(d["fecha"])
    return d


def _modelos() -> dict:
    return {
        "mos_lineal": LinearRegression(),
        "mos_random_forest": RandomForestRegressor(n_estimators=300, min_samples_leaf=5, random_state=0, n_jobs=-1),
        "mos_gradient_boosting": GradientBoostingRegressor(n_estimators=300, learning_rate=0.05, max_depth=3, random_state=0),
    }


def _metricas(real: np.ndarray, pred: np.ndarray) -> dict:
    err = real - pred
    return {
        "mae": round(float(np.abs(err).mean()), 3),
        "rmse": round(float(np.sqrt((err**2).mean())), 3),
        "sesgo": round(float(err.mean()), 3),
    }


def _pesos(predicciones: dict[str, np.ndarray], real: np.ndarray) -> dict[str, float]:
    """
    Pesos de la combinación: mínimos cuadrados no negativos (NNLS) con la condición de que sumen 1. Busca la
    mezcla de modelos que menos se equivoca en el tramo dado, sin pesos negativos. Un modelo que no aporta
    información nueva queda con peso cero. Si NNLS no encuentra solución, usa pesos proporcionales a 1 / error².
    """
    claves = list(predicciones)
    matriz = np.column_stack([predicciones[k] for k in claves])
    # Fila extra con mucho peso: obliga a que los pesos sumen 1 (así la combinación no introduce sesgo).
    lam = 1000.0 * max(float(np.abs(real).mean()), 1.0)
    matriz = np.vstack([matriz, np.full(len(claves), lam)])
    objetivo = np.append(real, lam)
    try:
        w, _ = nnls(matriz, objetivo)
    except Exception:
        w = np.zeros(len(claves))
    if w.sum() <= 0:
        w = np.array([1.0 / max(float(np.abs(real - predicciones[k]).mean()), 1e-6) ** 2 for k in claves])
    w = w / w.sum()
    return {k: float(v) for k, v in zip(claves, w)}


def _combinar(predicciones: dict[str, np.ndarray], pesos: dict[str, float]) -> np.ndarray:
    return sum(pesos[k] * predicciones[k] for k in pesos)


def evaluar_mos(dataset: pd.DataFrame, variable: str) -> dict:
    """
    Compara, en fechas no vistas, Open-Meteo crudo, 3 correcciones aprendidas y su combinación ponderada.

    Tres tramos en orden de tiempo, para que nada se evalúe con datos que ya vio:
      entrenamiento (60 %) -> los modelos aprenden
      validación    (15 %) -> se calculan los pesos de la combinación (acierto reciente)
      prueba        (25 %) -> se mide el error de todas las opciones
    """
    fechas = np.sort(dataset["fecha"].unique())
    n = len(fechas)
    if n < FECHAS_MINIMAS:
        raise ValueError(
            f"Hay {n} fechas con pronóstico pasado y medición de la estación; se necesitan al menos {FECHAS_MINIMAS}."
        )
    c_val = fechas[int(n * (1 - FRACCION_PRUEBA - FRACCION_VALIDACION))]
    c_test = fechas[int(n * (1 - FRACCION_PRUEBA))]
    train = dataset[dataset["fecha"] < c_val]
    val = dataset[(dataset["fecha"] >= c_val) & (dataset["fecha"] < c_test)]
    test = dataset[dataset["fecha"] >= c_test]
    lo, hi = LIMITES[variable]

    pred_val = {"openmeteo_crudo": val["media"].to_numpy()}
    pred_test = {"openmeteo_crudo": test["media"].to_numpy()}
    for clave, modelo in _modelos().items():
        modelo.fit(train[CARACTERISTICAS], train["est"])
        pred_val[clave] = np.clip(modelo.predict(val[CARACTERISTICAS]), lo, hi)
        pred_test[clave] = np.clip(modelo.predict(test[CARACTERISTICAS]), lo, hi)

    real_val, real = val["est"].to_numpy(), test["est"].to_numpy()
    pesos_val = _pesos(pred_val, real_val)
    pred_test["ensamble"] = _combinar(pred_test, pesos_val)

    opciones = []
    for clave, pred in pred_test.items():
        por_anticipacion = {
            int(k): round(float(np.abs(real[m] - pred[m]).mean()), 3)
            for k in ANTICIPACIONES
            if (m := (test["anticipacion"] == k).to_numpy()).any()
        }
        opciones.append({"metodo": clave, "nombre": NOMBRES[clave], **_metricas(real, pred), "por_anticipacion": por_anticipacion})
    opciones.sort(key=lambda o: o["mae"])
    mejor = opciones[0]
    crudo = next(o for o in opciones if o["metodo"] == "openmeteo_crudo")

    # Modelo final: se reentrena con TODAS las fechas. Si gana la combinación, sus pesos se recalculan con el
    # tramo más reciente (prueba), cuyas predicciones también fueron fuera de muestra: «acierto reciente».
    final, modelos_finales, pesos_finales = None, {}, {}
    if mejor["metodo"] == "ensamble":
        pesos_finales = _pesos({k: p for k, p in pred_test.items() if k != "ensamble"}, real)
        for clave, modelo in _modelos().items():
            modelo.fit(dataset[CARACTERISTICAS], dataset["est"])
            modelos_finales[clave] = modelo
    elif mejor["metodo"] != "openmeteo_crudo":
        final = _modelos()[mejor["metodo"]]
        final.fit(dataset[CARACTERISTICAS], dataset["est"])

    # Muestra para el gráfico «real vs. predicho» (anticipación de 1 día)
    m1 = (test["anticipacion"] == 1).to_numpy()
    muestra = [
        {"fecha": str(f)[:10], "real": round(float(r), 2), "predicho": round(float(p), 2)}
        for f, r, p in zip(test["fecha"].to_numpy()[m1], real[m1], pred_test[mejor["metodo"]][m1])
    ][-30:]

    pesos_mostrar = pesos_finales or pesos_val
    return {
        "variable": variable,
        "fechas": int(n),
        "filas": int(len(dataset)),
        "desde": str(fechas[0])[:10],
        "hasta": str(fechas[-1])[:10],
        "fechas_entrenamiento": int(train["fecha"].nunique()),
        "fechas_validacion": int(val["fecha"].nunique()),
        "fechas_prueba": int(test["fecha"].nunique()),
        "prueba_desde": str(c_test)[:10],
        "opciones": opciones,
        "elegido": mejor["metodo"],
        "mejora_pct": round((crudo["mae"] - mejor["mae"]) / crudo["mae"] * 100, 1) if crudo["mae"] > 0 else 0.0,
        "pesos": [
            {"metodo": k, "nombre": NOMBRES[k], "peso": round(v, 3)}
            for k, v in sorted(pesos_mostrar.items(), key=lambda kv: -kv[1])
        ],
        "pesos_finales": bool(pesos_finales),
        "muestra": muestra,
        "_modelo": final,               # objetos de scikit-learn (no se envían al navegador)
        "_modelos": modelos_finales,
        "_pesos": pesos_finales,
    }


def predecir(mos: dict, referencia: dict[str, dict], fechas: list[str], variable: str, hoy: date | None = None) -> dict[str, float]:
    """Valor corregido para cada fecha que cubre el pronóstico actual de Open-Meteo."""
    hoy = hoy or date.today()
    filas = []
    for f in fechas:
        r = referencia.get(f) or {}
        media, maxima, minima = r.get(variable), r.get(f"{variable}_max"), r.get(f"{variable}_min")
        if None in (media, maxima, minima):
            continue
        k = min(max((date.fromisoformat(f) - hoy).days, 1), max(ANTICIPACIONES))
        filas.append({"fecha": f, "anticipacion": k, "media": media, "maxima": maxima, "minima": minima})
    if not filas:
        return {}
    x = pd.DataFrame(filas)
    x["sin_dia"], x["cos_dia"] = _estacionalidad(x["fecha"])
    lo, hi = LIMITES[variable]
    if mos["elegido"] == "ensamble" and mos.get("_modelos"):
        preds = {"openmeteo_crudo": x["media"].to_numpy()}
        for clave, modelo in mos["_modelos"].items():
            preds[clave] = np.clip(modelo.predict(x[CARACTERISTICAS]), lo, hi)
        pred = _combinar(preds, mos["_pesos"])
    elif mos["elegido"] == "openmeteo_crudo" or mos.get("_modelo") is None:
        pred = x["media"].to_numpy()
    else:
        pred = np.clip(mos["_modelo"].predict(x[CARACTERISTICAS]), lo, hi)
    return {f: round(float(v), 2) for f, v in zip(x["fecha"], pred)}


def informe_publico(mos: dict) -> dict:
    return {k: v for k, v in mos.items() if not k.startswith("_")}


# ================================================================ red y base de datos
def descargar_previos(inicio: date, fin: date, timeout: float = 90.0) -> list[dict]:
    from app.routers.registros import LATITUD_COCHABAMBA, LONGITUD_COCHABAMBA

    inicio = max(inicio, INICIO_DATOS)
    campos = [f"{c}_previous_day{k}" for c in VARIABLES.values() for k in ANTICIPACIONES]
    filas: list[dict] = []
    desde = inicio
    while desde <= fin:
        hasta = min(fin, desde + timedelta(days=TRAMO_DIAS - 1))
        r = httpx.get(
            PREVIOUS_URL,
            params={
                "latitude": LATITUD_COCHABAMBA,
                "longitude": LONGITUD_COCHABAMBA,
                "hourly": ",".join(campos),
                "timezone": "America/La_Paz",
                "start_date": desde.isoformat(),
                "end_date": hasta.isoformat(),
            },
            timeout=timeout,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Open-Meteo (pronósticos pasados) respondió {r.status_code}: {r.text[:200]}")
        filas += resumir_previos(r.json())
        desde = hasta + timedelta(days=1)
        time.sleep(0.5)
    return filas


def guardar_previos(filas: list[dict]) -> int:
    from app.auth import supabase_admin

    for i in range(0, len(filas), 500):
        supabase_admin.table("pronosticos_previos").upsert(filas[i : i + 500], on_conflict="fecha,variable,anticipacion").execute()
    return len(filas)


def cargar_previos(variable: str) -> pd.DataFrame:
    from app.auth import supabase_admin

    filas, desde = [], 0
    while True:
        pagina = (
            supabase_admin.table("pronosticos_previos")
            .select("fecha,anticipacion,media,maxima,minima")
            .eq("variable", variable)
            .order("fecha")
            .order("anticipacion")
            .range(desde, desde + 999)
            .execute()
            .data
            or []
        )
        filas.extend(pagina)
        if len(pagina) < 1000:
            break
        desde += 1000
    df = pd.DataFrame(filas, columns=["fecha", "anticipacion", "media", "maxima", "minima"])
    df["fecha"] = pd.to_datetime(df["fecha"])
    return df


_cache: dict[str, tuple[float, dict | None]] = {}
_candado = Lock()
CACHE_SEGUNDOS = 600


def obtener_mos(variable: str, forzar: bool = False) -> dict | None:
    """Modelo híbrido entrenado (con su informe) o None si faltan datos. Se guarda 10 minutos en memoria."""
    from app import estacion

    with _candado:
        guardado = _cache.get(variable)
        if guardado and not forzar and time.time() - guardado[0] < CACHE_SEGUNDOS:
            return guardado[1]
    try:
        previos = cargar_previos(variable)
        observado = estacion.cargar_observaciones(variable)
        resultado = evaluar_mos(construir_dataset(previos, observado), variable) if not previos.empty and not observado.empty else None
    except Exception:
        resultado = None  # sin tabla (falta la migración 006), sin datos o muy pocos
    with _candado:
        _cache[variable] = (time.time(), resultado)
    return resultado


def limpiar_cache() -> None:
    with _candado:
        _cache.clear()

