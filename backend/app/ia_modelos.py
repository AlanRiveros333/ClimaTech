"""
Módulo de IA de ClimaTech (lógica pura, sin base de datos).

Compara 6 métodos sobre la MISMA serie diaria con evaluación fuera de muestra
(backtesting): los últimos `dias_prueba` días se reservan, el modelo se
entrena con el resto, proyecta esos días y se mide MAE y RMSE contra lo real.
Después se reentrena con toda la serie para proyectar el futuro.

Métodos:
  persistencia       referencia: repite el último valor observado
  promedio_movil     promedio de los últimos 7 días (valor constante)
  holt               suavizamiento exponencial con tendencia (statsmodels)
  regresion_lineal   tendencia + componente estacional anual (scikit-learn)
  random_forest      Machine Learning con rezagos (scikit-learn)
  gradient_boosting  Machine Learning con rezagos (scikit-learn)

Los modelos de ML proyectan de forma recursiva: cada predicción pasa a ser un
rezago del día siguiente, igual que ocurriría al proyectar el futuro real.
Opcionalmente reciben la fase ENSO (El Niño / La Niña) como variable.
"""

from __future__ import annotations

import warnings
from datetime import timedelta
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
from statsmodels.tsa.holtwinters import Holt

NUM_REZAGOS = 7
MAX_HUECO_INTERPOLABLE = 7  # días seguidos sin dato que se rellenan por interpolación

EnsoFn = Callable[[pd.Timestamp], float]


# ---------------------------------------------------------------- preparación
def preparar_serie(df: pd.DataFrame, variable: str) -> tuple[pd.DataFrame, dict]:
    """
    Serie diaria continua (sin días faltantes) lista para los modelos.
    Rellena huecos cortos por interpolación y conserva solo el último tramo continuo.
    Devuelve (DataFrame[fecha, valor], info).
    """
    s = df.set_index("fecha")[variable].astype(float)
    s = s.groupby(level=0).mean().asfreq("D")
    faltantes = int(s.isna().sum())
    s = s.interpolate(limit=MAX_HUECO_INTERPOLABLE, limit_direction="both").dropna()

    descartados = 0
    if len(s) > 1:
        saltos = np.where(np.diff(s.index.values).astype("timedelta64[D]").astype(int) > 1)[0]
        if len(saltos):
            inicio_tramo = saltos[-1] + 1
            descartados = int(inicio_tramo)
            s = s.iloc[inicio_tramo:]

    out = pd.DataFrame({"fecha": s.index, "valor": s.values}).reset_index(drop=True)
    info = {"dias_faltantes": faltantes, "dias_descartados": descartados, "dias_serie": len(out)}
    return out, info


# ------------------------------------------------------------------ variables
def _fila_ml(ventana: list[float], fecha: pd.Timestamp, enso: EnsoFn | None) -> list[float]:
    """Rezagos 1..7, media de 7 días, estacionalidad anual y (opcional) fase ENSO."""
    rezagos = [ventana[-i] for i in range(1, NUM_REZAGOS + 1)]
    doy = fecha.day_of_year
    fila = rezagos + [
        float(np.mean(ventana[-NUM_REZAGOS:])),
        float(np.sin(2 * np.pi * doy / 365.25)),
        float(np.cos(2 * np.pi * doy / 365.25)),
    ]
    if enso is not None:
        fila.append(float(enso(fecha)))
    return fila


def _x_regresion(fechas: pd.DatetimeIndex, inicio: pd.Timestamp, enso: EnsoFn | None) -> np.ndarray:
    doy = np.asarray(fechas.day_of_year)
    columnas = [
        np.asarray((fechas - inicio).days, dtype=float),
        np.sin(2 * np.pi * doy / 365.25),
        np.cos(2 * np.pi * doy / 365.25),
    ]
    if enso is not None:
        columnas.append(np.array([enso(f) for f in fechas], dtype=float))
    return np.column_stack(columnas)


# --------------------------------------------------------------- predictores
# Firma común: (train[fecha, valor], fechas_futuras, enso) -> lista de predicciones
def _pred_persistencia(train: pd.DataFrame, fechas, enso) -> list[float]:
    return [float(train["valor"].iloc[-1])] * len(fechas)


def _pred_promedio_movil(train: pd.DataFrame, fechas, enso, ventana: int = 7) -> list[float]:
    return [float(train["valor"].tail(ventana).mean())] * len(fechas)


def _pred_holt(train: pd.DataFrame, fechas, enso) -> list[float]:
    modelo = Holt(train["valor"].reset_index(drop=True), initialization_method="estimated").fit()
    return [float(v) for v in modelo.forecast(len(fechas))]


def _pred_regresion(train: pd.DataFrame, fechas, enso) -> list[float]:
    inicio = train["fecha"].iloc[0]
    modelo = LinearRegression().fit(
        _x_regresion(pd.DatetimeIndex(train["fecha"]), inicio, enso), train["valor"].to_numpy()
    )
    return [float(v) for v in modelo.predict(_x_regresion(pd.DatetimeIndex(fechas), inicio, enso))]


def _crear_pred_ml(fabrica: Callable[[], object]):
    def predictor(train: pd.DataFrame, fechas, enso) -> list[float]:
        serie = train["valor"].tolist()
        fechas_train = list(train["fecha"])
        X, y = [], []
        for t in range(NUM_REZAGOS, len(serie)):
            X.append(_fila_ml(serie[t - NUM_REZAGOS : t], fechas_train[t], enso))
            y.append(serie[t])
        modelo = fabrica().fit(np.array(X), np.array(y))

        ventana = serie[-NUM_REZAGOS:]
        salida = []
        for fecha in fechas:
            p = float(modelo.predict(np.array([_fila_ml(ventana, fecha, enso)]))[0])
            salida.append(p)
            ventana = ventana[1:] + [p]
        return salida

    return predictor


_pred_random_forest = _crear_pred_ml(
    lambda: RandomForestRegressor(n_estimators=200, min_samples_leaf=2, random_state=42, n_jobs=1)
)
_pred_gradient_boosting = _crear_pred_ml(
    lambda: GradientBoostingRegressor(n_estimators=200, max_depth=3, learning_rate=0.05, random_state=42)
)

# clave: (nombre, predictor, días mínimos de entrenamiento, es_ml)
METODOS: dict[str, tuple[str, Callable, int, bool]] = {
    "persistencia": ("Referencia (último valor)", _pred_persistencia, 2, False),
    "promedio_movil": ("Promedio móvil (7 días)", _pred_promedio_movil, 2, False),
    "holt": ("Método de Holt", _pred_holt, 4, False),
    "regresion_lineal": ("Regresión lineal múltiple", _pred_regresion, 5, False),
    "random_forest": ("Random Forest (IA)", _pred_random_forest, 60, True),
    "gradient_boosting": ("Gradient Boosting (IA)", _pred_gradient_boosting, 60, True),
}
CLAVE_REFERENCIA = "persistencia"


def _r(x: float) -> float:
    return round(float(x), 4)


# ------------------------------------------------------------------ evaluación
def comparar_metodos(
    serie: pd.DataFrame,
    dias_prueba: int,
    dias_a_proyectar: int,
    enso: EnsoFn | None = None,
) -> dict:
    """
    serie: DataFrame[fecha, valor] diaria y continua (salida de preparar_serie).
    Lanza ValueError si la serie no alcanza para separar el conjunto de prueba.
    """
    n = len(serie)
    if dias_prueba < 1:
        raise ValueError("dias_prueba debe ser al menos 1.")
    if n < dias_prueba + 5:
        raise ValueError(
            f"Se necesitan al menos {dias_prueba + 5} días continuos de datos "
            f"(hay {n}) para reservar {dias_prueba} días de prueba."
        )

    train = serie.iloc[:-dias_prueba].reset_index(drop=True)
    test = serie.iloc[-dias_prueba:].reset_index(drop=True)
    fechas_test = list(test["fecha"])
    ultima = serie["fecha"].iloc[-1]
    fechas_futuras = [ultima + timedelta(days=i + 1) for i in range(dias_a_proyectar)]
    real = test["valor"].to_numpy()

    resultados, omitidos = [], []
    for clave, (nombre, predictor, minimo, es_ml) in METODOS.items():
        if len(train) < minimo:
            omitidos.append(
                {
                    "metodo": clave,
                    "nombre": nombre,
                    "motivo": f"requiere al menos {minimo} días de entrenamiento (hay {len(train)}).",
                }
            )
            continue
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                pred_test = predictor(train, fechas_test, enso)
                pred_futuro = predictor(serie, fechas_futuras, enso)
        except Exception as exc:  # un método que falla no debe tumbar la comparación
            omitidos.append({"metodo": clave, "nombre": nombre, "motivo": f"falló: {exc}"})
            continue

        mae = mean_absolute_error(real, pred_test)
        rmse = float(np.sqrt(mean_squared_error(real, pred_test)))
        resultados.append(
            {
                "metodo": clave,
                "nombre": nombre,
                "es_ml": es_ml,
                "mae": _r(mae),
                "rmse": _r(rmse),
                "prueba": [
                    {"fecha": f.date().isoformat(), "real": _r(r), "predicho": _r(p)}
                    for f, r, p in zip(fechas_test, real, pred_test)
                ],
                "proyeccion": [
                    {"fecha": f.date().isoformat(), "valor": _r(v)}
                    for f, v in zip(fechas_futuras, pred_futuro)
                ],
            }
        )

    resultados.sort(key=lambda r: r["rmse"])

    ref = next((r for r in resultados if r["metodo"] == CLAVE_REFERENCIA), None)
    for r in resultados:
        if ref and ref["rmse"] > 0 and r["metodo"] != CLAVE_REFERENCIA:
            r["mejora_vs_referencia_pct"] = round((ref["rmse"] - r["rmse"]) / ref["rmse"] * 100, 1)
        else:
            r["mejora_vs_referencia_pct"] = None

    candidatos = [r for r in resultados if r["metodo"] != CLAVE_REFERENCIA]
    mejor = candidatos[0] if candidatos else None
    supera = bool(mejor and ref and mejor["rmse"] < ref["rmse"])

    return {
        "dias_entrenamiento": int(len(train)),
        "dias_prueba": int(dias_prueba),
        "resultados": resultados,
        "omitidos": omitidos,
        "mejor_metodo": mejor["metodo"] if mejor else None,
        "supera_referencia": supera,
    }


def enso_varia(fechas, enso: EnsoFn) -> bool:
    """¿La fase ENSO cambia dentro del período? Si no, no aporta información al modelo."""
    return len({enso(pd.Timestamp(f)) for f in fechas}) > 1
