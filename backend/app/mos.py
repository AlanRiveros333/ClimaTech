"""
Modelo híbrido: pronósticos meteorológicos + corrección aprendida (técnica MOS, «Model Output Statistics»).

Idea:
  Los métodos estadísticos solo ven el pasado y no pueden anticipar una ola de calor o un frente frío.
  Los modelos meteorológicos físicos sí, pero tienen errores sistemáticos en un valle de montaña como
  Cochabamba. MOS combina ambos: los modelos matemáticos de ClimaTech (regresión lineal, Random Forest,
  Gradient Boosting) reciben como DATO DE ENTRADA los pronósticos y aprenden a corregirlos, comparando
  pronósticos pasados con lo que realmente midió la estación del aeropuerto.

Varios modelos meteorológicos (mejora 2):
  Además del «best match» de Open-Meteo se usan, por separado, los modelos globales de Europa (ECMWF),
  Estados Unidos (GFS), Alemania (ICON), Japón (JMA), Canadá (GEM) y Reino Unido (UKMO). Así la corrección
  aprende a cuál creerle en cada situación, y el desacuerdo entre ellos se usa como dato (incertidumbre).
  Un modelo sin datos suficientes para Cochabamba se descarta automáticamente.
  Las opciones de un solo modelo siguen compitiendo: si varios modelos no mejoran, el sistema lo dice.

Datos de entrenamiento:
  - Pronósticos pasados: Previous Runs API de Open-Meteo (lo que se pronosticó 1 a 7 días antes).
  - Verdad medida: estación SLCB (tabla observaciones_estacion, paso 1).

Validación (igual de honesta que el resto del sistema): tres tramos en orden de tiempo.
Los modelos aprenden con el 60 % más antiguo, los pesos de la combinación se calculan con el 15 %
siguiente y todas las opciones se califican con el último 25 %, que nadie vio antes.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict
from datetime import date, timedelta
from threading import Lock

import httpx
import numpy as np
import pandas as pd
from scipy.optimize import nnls
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression

PREVIOUS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
INICIO_DATOS = date(2024, 1, 1)  # desde cuándo hay pronósticos pasados para la mayoría de modelos
ANTICIPACIONES = range(1, 8)     # 1 a 7 días de anticipación
HORAS_MINIMAS = 20
FRACCION_PRUEBA = 0.25
FRACCION_VALIDACION = 0.15       # tramo para calcular los pesos de la combinación
FECHAS_MINIMAS = 90
TRAMO_DIAS = 92                  # días por pedido a la API
COBERTURA_MINIMA = 0.6           # un modelo se usa si tiene dato en al menos el 60 % de los casos
VARIABLES = {"temperatura": "temperature_2m", "humedad": "relative_humidity_2m", "velocidad_viento": "wind_speed_10m"}
LIMITES = {"temperatura": (-30.0, 50.0), "humedad": (0.0, 100.0), "velocidad_viento": (0.0, 200.0)}

PRINCIPAL = "best_match"
NOMBRE_MODELO = {
    "best_match": "Open-Meteo (best match)",
    "ecmwf_ifs025": "ECMWF IFS (Europa)",
    "gfs_seamless": "GFS (Estados Unidos)",
    "icon_seamless": "ICON (Alemania)",
    "jma_seamless": "JMA (Japón)",
    "gem_seamless": "GEM (Canadá)",
    "ukmo_seamless": "UKMO (Reino Unido)",
}
MODELOS_EXTRA_DEFECTO = "ecmwf_ifs025,gfs_seamless,icon_seamless,jma_seamless,gem_seamless,ukmo_seamless"


def modelos_extra() -> list[str]:
    """Modelos adicionales al best match (configurable con MOS_MODELOS en backend/.env; vacío = solo best match)."""
    texto = os.getenv("MOS_MODELOS", MODELOS_EXTRA_DEFECTO)
    return [m.strip() for m in texto.split(",") if m.strip() and m.strip() != PRINCIPAL]


def nombre_modelo(m: str) -> str:
    return NOMBRE_MODELO.get(m, m)


BASE = ["anticipacion", "media", "maxima", "minima", "sin_dia", "cos_dia"]

NOMBRES = {
    "openmeteo_crudo": "Open-Meteo sin corregir",
    "promedio_modelos": "Promedio de los modelos (sin corregir)",
    "mos_lineal": "Open-Meteo + Regresión lineal",
    "mos_random_forest": "Open-Meteo + Random Forest (IA)",
    "mos_gradient_boosting": "Open-Meteo + Gradient Boosting (IA)",
    "mm_lineal": "Varios modelos + Regresión lineal",
    "mm_random_forest": "Varios modelos + Random Forest (IA)",
    "mm_gradient_boosting": "Varios modelos + Gradient Boosting (IA)",
    "ensamble": "Combinación ponderada",
}
ALGORITMOS = {"lineal": "Regresión lineal", "random_forest": "Random Forest", "gradient_boosting": "Gradient Boosting"}


# =================================================================== lógica pura
def resumir_previos(datos: dict, modelo: str = PRINCIPAL) -> list[dict]:
    """Respuesta horaria de la Previous Runs API (un modelo) -> filas diarias (fecha, variable, anticipación, media, máx, mín)."""
    h = datos.get("hourly") or {}
    tiempos = h.get("time") or []
    sufijo = f"_{modelo}"
    # Algunas respuestas agregan el nombre del modelo al final de cada variable: se acepta con y sin sufijo.
    series = {(k[: -len(sufijo)] if k.endswith(sufijo) else k): v for k, v in h.items() if k != "time"}
    acum: dict[tuple, list[float]] = defaultdict(list)
    for variable, campo in VARIABLES.items():
        for k in ANTICIPACIONES:
            valores = series.get(f"{campo}_previous_day{k}") or []
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
                "modelo": modelo,
            }
        )
    return filas


def _estacionalidad(fechas: pd.Series) -> tuple[np.ndarray, np.ndarray]:
    dia = pd.to_datetime(fechas).dt.dayofyear.to_numpy()
    ang = 2 * np.pi * dia / 365.25
    return np.sin(ang), np.cos(ang)


def _agregar_modelos(base: pd.DataFrame, extras: pd.DataFrame, modelos: list[str]) -> pd.DataFrame:
    """
    base[fecha, anticipacion, media, maxima, minima] (best match) + extras en formato largo (con columna modelo).
    Agrega columnas media__<m>, maxima__<m>, minima__<m> por modelo (si falta un dato, se usa el best match),
    y el promedio y la dispersión entre todos los modelos (el desacuerdo indica incertidumbre).
    """
    d = base.copy()
    for m in modelos:
        e = extras[extras["modelo"] == m][["fecha", "anticipacion", "media", "maxima", "minima"]]
        e = e.rename(columns={c: f"{c}__{m}" for c in ("media", "maxima", "minima")})
        d = d.merge(e, on=["fecha", "anticipacion"], how="left")
        for c in ("media", "maxima", "minima"):
            d[f"{c}__{m}"] = d[f"{c}__{m}"].fillna(d[c])
    medias = d[["media"] + [f"media__{m}" for m in modelos]]
    d["prom_modelos"] = medias.mean(axis=1)
    d["dispersion"] = medias.std(axis=1, ddof=0)
    return d


def construir_dataset(previos: pd.DataFrame, observado: pd.DataFrame) -> pd.DataFrame:
    """
    previos: formato largo [fecha, anticipacion, media, maxima, minima, (modelo)] + observado[fecha, est].
    Devuelve la tabla de entrenamiento; en .attrs quedan los modelos usados y la cobertura de cada uno.
    """
    if "modelo" not in previos.columns:
        previos = previos.assign(modelo=PRINCIPAL)
    base = previos[previos["modelo"] == PRINCIPAL].drop(columns="modelo")
    base = base.merge(observado, on="fecha", how="inner").dropna(subset=["media", "maxima", "minima", "est"])

    cobertura, usados = {}, []
    for m in sorted(set(previos["modelo"]) - {PRINCIPAL}):
        claves = previos[previos["modelo"] == m][["fecha", "anticipacion"]].drop_duplicates()
        n = len(base.merge(claves, on=["fecha", "anticipacion"], how="inner"))
        cobertura[m] = round(n / len(base), 3) if len(base) else 0.0
        if cobertura[m] >= COBERTURA_MINIMA:
            usados.append(m)

    d = _agregar_modelos(base, previos[previos["modelo"] != PRINCIPAL], usados)
    d = d.sort_values(["fecha", "anticipacion"]).reset_index(drop=True)
    d["sin_dia"], d["cos_dia"] = _estacionalidad(d["fecha"])
    d.attrs["modelos"] = usados
    d.attrs["cobertura"] = cobertura
    return d


def _caracteristicas(modelos: list[str]) -> list[str]:
    extra = [f"{c}__{m}" for m in modelos for c in ("media", "maxima", "minima")]
    return BASE + extra + ["prom_modelos", "dispersion"]


def _estimadores(prefijo: str) -> dict:
    return {
        f"{prefijo}_lineal": LinearRegression(),
        f"{prefijo}_random_forest": RandomForestRegressor(n_estimators=300, min_samples_leaf=5, random_state=0, n_jobs=-1),
        f"{prefijo}_gradient_boosting": GradientBoostingRegressor(n_estimators=300, learning_rate=0.05, max_depth=3, random_state=0),
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
    mezcla de modelos que menos se equivoca en el tramo dado, sin pesos negativos.
    Un modelo que no aporta información nueva queda con peso cero. Si NNLS no encuentra solución, usa pesos proporcionales a 1 / error².
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


def _predicciones_directas(df: pd.DataFrame) -> dict[str, np.ndarray]:
    """Opciones que no aprenden nada: el pronóstico tal cual."""
    salida = {"openmeteo_crudo": df["media"].to_numpy()}
    if any(c.startswith("media__") for c in df.columns):
        salida["promedio_modelos"] = df["prom_modelos"].to_numpy()
    return salida


def evaluar_mos(dataset: pd.DataFrame, variable: str) -> dict:
    """
    Califica en fechas no vistas: el pronóstico crudo, el promedio de modelos, 3 correcciones con un solo modelo,
    3 correcciones con varios modelos y la combinación ponderada de todas.

    Tres tramos en orden de tiempo, para que nada se evalúe con datos que ya vio:
      entrenamiento (60 %) -> los modelos aprenden
      validación    (15 %) -> se calculan los pesos de la combinación (acierto reciente)
      prueba        (25 %) -> se mide el error de todas las opciones
    """
    modelos = list(dataset.attrs.get("modelos", []))
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

    # Qué columnas usa cada opción
    columnas: dict[str, list[str]] = {k: BASE for k in _estimadores("mos")}
    if modelos:
        columnas.update({k: _caracteristicas(modelos) for k in _estimadores("mm")})

    pred_val, pred_test = _predicciones_directas(val), _predicciones_directas(test)
    for prefijo in ("mos", "mm") if modelos else ("mos",):
        for clave, est in _estimadores(prefijo).items():
            est.fit(train[columnas[clave]], train["est"])
            pred_val[clave] = np.clip(est.predict(val[columnas[clave]]), lo, hi)
            pred_test[clave] = np.clip(est.predict(test[columnas[clave]]), lo, hi)

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
        nombre = NOMBRES[clave] if clave != "ensamble" else f"{NOMBRES['ensamble']} de {len(pesos_val)} opciones"
        opciones.append({"metodo": clave, "nombre": nombre, **_metricas(real, pred), "por_anticipacion": por_anticipacion})
    opciones.sort(key=lambda o: o["mae"])
    mejor = opciones[0]
    crudo = next(o for o in opciones if o["metodo"] == "openmeteo_crudo")

    # Modelo final: se reentrena con TODAS las fechas. Si gana la combinación, sus pesos se recalculan con el
    # tramo más reciente (prueba), cuyas predicciones también fueron fuera de muestra: «acierto reciente».
    finales: dict[str, object] = {}
    pesos_finales: dict[str, float] = {}
    if mejor["metodo"] == "ensamble":
        pesos_finales = _pesos({k: p for k, p in pred_test.items() if k != "ensamble"}, real)
        necesarios = [k for k, w in pesos_finales.items() if w > 0 and k in columnas]
    elif mejor["metodo"] in columnas:
        necesarios = [mejor["metodo"]]
    else:
        necesarios = []
    todos = {**_estimadores("mos"), **(_estimadores("mm") if modelos else {})}
    for clave in necesarios:
        est = todos[clave]
        est.fit(dataset[columnas[clave]], dataset["est"])
        finales[clave] = est

    # Impacto de usar varios modelos: mejor opción con un solo modelo vs. mejor opción con varios
    def mejor_de(claves):
        cand = [o for o in opciones if o["metodo"] in claves]
        return min(cand, key=lambda o: o["mae"]) if cand else None

    uno = mejor_de(set(_estimadores("mos")))
    varios = mejor_de(set(_estimadores("mm"))) if modelos else None

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
        "modelos": [{"id": m, "nombre": nombre_modelo(m)} for m in [PRINCIPAL] + modelos],
        "cobertura": {nombre_modelo(m): c for m, c in dataset.attrs.get("cobertura", {}).items()},
        "descartados": [nombre_modelo(m) for m, c in dataset.attrs.get("cobertura", {}).items() if c < COBERTURA_MINIMA],
        "impacto_modelos": (
            {
                "un_modelo": {"nombre": uno["nombre"], "mae": uno["mae"]},
                "varios_modelos": {"nombre": varios["nombre"], "mae": varios["mae"]},
                "mejora_pct": round((uno["mae"] - varios["mae"]) / uno["mae"] * 100, 1) if uno["mae"] > 0 else 0.0,
            }
            if uno and varios
            else None
        ),
        "pesos": [
            {"metodo": k, "nombre": NOMBRES[k], "peso": round(v, 3)}
            for k, v in sorted(pesos_mostrar.items(), key=lambda kv: -kv[1])
        ],
        "pesos_finales": bool(pesos_finales),
        "muestra": muestra,
        "_finales": finales,        # objetos de scikit-learn (no se envían al navegador)
        "_columnas": columnas,
        "_pesos": pesos_finales,
        "_modelos": modelos,
    }


def _filas_prediccion(referencia: dict[str, dict], multimodelo: dict | None, fechas: list[str], variable: str,
                      modelos: list[str], hoy: date) -> pd.DataFrame:
    filas, extras = [], []
    for f in fechas:
        r = referencia.get(f) or {}
        media, maxima, minima = r.get(variable), r.get(f"{variable}_max"), r.get(f"{variable}_min")
        if None in (media, maxima, minima):
            continue
        k = min(max((date.fromisoformat(f) - hoy).days, 1), max(ANTICIPACIONES))
        filas.append({"fecha": f, "anticipacion": k, "media": media, "maxima": maxima, "minima": minima})
        for m in modelos:
            v = ((multimodelo or {}).get(f) or {}).get(m, {}).get(variable)
            if v:
                extras.append({"fecha": f, "anticipacion": k, "modelo": m, "media": v["media"], "maxima": v["maxima"], "minima": v["minima"]})
    if not filas:
        return pd.DataFrame()
    base = pd.DataFrame(filas)
    ext = pd.DataFrame(extras, columns=["fecha", "anticipacion", "modelo", "media", "maxima", "minima"])
    x = _agregar_modelos(base, ext, modelos)
    x["sin_dia"], x["cos_dia"] = _estacionalidad(x["fecha"])
    return x


def predecir(mos: dict, referencia: dict[str, dict], fechas: list[str], variable: str, hoy: date | None = None,
             multimodelo: dict | None = None) -> dict[str, float]:
    """Valor corregido para cada fecha que cubre el pronóstico actual de Open-Meteo."""
    hoy = hoy or date.today()
    modelos = mos.get("_modelos") or []
    x = _filas_prediccion(referencia, multimodelo, fechas, variable, modelos, hoy)
    if x.empty:
        return {}
    lo, hi = LIMITES[variable]
    preds = _predicciones_directas(x)
    for clave, est in (mos.get("_finales") or {}).items():
        preds[clave] = np.clip(est.predict(x[mos["_columnas"][clave]]), lo, hi)
    elegido = mos["elegido"]
    if elegido == "ensamble":
        usados = {k: w for k, w in mos["_pesos"].items() if w > 0}
        pred = _combinar(preds, usados)
    else:
        pred = preds.get(elegido, preds["openmeteo_crudo"])
    return {f: round(float(v), 2) for f, v in zip(x["fecha"], pred)}


def acuerdo_modelos(multimodelo: dict | None, referencia: dict[str, dict], fechas: list[str], variable: str,
                    modelos: list[str]) -> dict[str, dict]:
    """Por fecha: rango y dispersión del promedio diario según cada modelo, y un nivel de confianza."""
    umbral = {"temperatura": (1.0, 2.0), "humedad": (5.0, 10.0), "velocidad_viento": (2.0, 4.0)}[variable]
    salida = {}
    for f in fechas:
        valores = {}
        base = (referencia.get(f) or {}).get(variable)
        if base is not None:
            valores[PRINCIPAL] = base
        for m in modelos:
            v = ((multimodelo or {}).get(f) or {}).get(m, {}).get(variable)
            if v:
                valores[m] = v["media"]
        if len(valores) < 3:
            continue
        xs = np.array(list(valores.values()))
        disp = float(xs.std())
        nivel = "alta" if disp < umbral[0] else "media" if disp < umbral[1] else "baja"
        salida[f] = {
            "modelos": len(valores),
            "minimo": round(float(xs.min()), 1),
            "maximo": round(float(xs.max()), 1),
            "dispersion": round(disp, 2),
            "confianza": nivel,
            "valores": {nombre_modelo(m): round(v, 1) for m, v in valores.items()},
        }
    return salida


def informe_publico(mos: dict) -> dict:
    return {k: v for k, v in mos.items() if not k.startswith("_")}


# ================================================================ red y base de datos
def descargar_previos_modelo(modelo: str, inicio: date, fin: date, timeout: float = 90.0) -> list[dict]:
    """Pronósticos pasados (1 a 7 días de anticipación) de UN modelo, en tramos de 92 días."""
    from app.routers.registros import LATITUD_COCHABAMBA, LONGITUD_COCHABAMBA

    inicio = max(inicio, INICIO_DATOS)
    campos = [f"{c}_previous_day{k}" for c in VARIABLES.values() for k in ANTICIPACIONES]
    filas: list[dict] = []
    desde = inicio
    while desde <= fin:
        hasta = min(fin, desde + timedelta(days=TRAMO_DIAS - 1))
        params = {
            "latitude": LATITUD_COCHABAMBA,
            "longitude": LONGITUD_COCHABAMBA,
            "hourly": ",".join(campos),
            "timezone": "America/La_Paz",
            "start_date": desde.isoformat(),
            "end_date": hasta.isoformat(),
        }
        if modelo != PRINCIPAL:
            params["models"] = modelo
        r = httpx.get(PREVIOUS_URL, params=params, timeout=timeout)
        if r.status_code >= 400:
            raise RuntimeError(f"{nombre_modelo(modelo)}: Open-Meteo respondió {r.status_code}: {r.text[:200]}")
        filas += resumir_previos(r.json(), modelo)
        desde = hasta + timedelta(days=1)
        time.sleep(0.5)
    return filas


def descargar_previos(inicio: date, fin: date, timeout: float = 90.0, modelos: list[str] | None = None,
                      errores: dict | None = None) -> list[dict]:
    """Best match + modelos extra. Un modelo que falla se anota en `errores` y no detiene a los demás."""
    filas: list[dict] = []
    lista = [PRINCIPAL] + (modelos if modelos is not None else modelos_extra())
    for m in lista:
        try:
            filas += descargar_previos_modelo(m, inicio, fin, timeout)
        except Exception as exc:
            if m == PRINCIPAL:
                raise
            if errores is not None:
                errores[m] = str(exc)[:200]
    return filas


def guardar_previos(filas: list[dict]) -> int:
    from app.auth import supabase_admin

    for i in range(0, len(filas), 500):
        supabase_admin.table("pronosticos_previos").upsert(
            filas[i : i + 500], on_conflict="fecha,variable,anticipacion,modelo"
        ).execute()
    return len(filas)


def cargar_previos(variable: str) -> pd.DataFrame:
    """Formato largo [fecha, anticipacion, modelo, media, maxima, minima] de todos los modelos."""
    from app.auth import supabase_admin

    filas, desde = [], 0
    while True:
        pagina = (
            supabase_admin.table("pronosticos_previos")
            .select("fecha,anticipacion,modelo,media,maxima,minima")
            .eq("variable", variable)
            .order("fecha")
            .order("anticipacion")
            .order("modelo")
            .range(desde, desde + 999)
            .execute()
            .data
            or []
        )
        filas.extend(pagina)
        if len(pagina) < 1000:
            break
        desde += 1000
    df = pd.DataFrame(filas, columns=["fecha", "anticipacion", "modelo", "media", "maxima", "minima"])
    df["fecha"] = pd.to_datetime(df["fecha"])
    return df


_cache: dict[str, tuple[float, dict | None]] = {}
_candado = Lock()
CACHE_SEGUNDOS = 12 * 3600  # los datos solo cambian al actualizar o importar, y eso limpia la caché


def obtener_mos(variable: str, forzar: bool = False) -> dict | None:
    """Modelo híbrido entrenado (con su informe) o None si faltan datos. Se guarda en memoria hasta la próxima actualización."""
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
        resultado = None  # sin tabla (falta una migración), sin datos o muy pocos
    with _candado:
        _cache[variable] = (time.time(), resultado)
    return resultado


def limpiar_cache() -> None:
    with _candado:
        _cache.clear()
