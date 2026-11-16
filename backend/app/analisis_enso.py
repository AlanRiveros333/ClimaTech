"""
Lógica pura (sin base de datos) para trabajar con eventos El Niño / La Niña:

- construir_funcion_enso: convierte la tabla de eventos en una función
  fecha -> valor numérico (+ = El Niño, - = La Niña, magnitud = intensidad),
  usable como variable explicativa por los modelos de IA.
- evento_en: qué evento (si hay) cubre una fecha.
- analizar_anomalias: anomalía mensual respecto a la climatología de los
  datos disponibles y comparación por fase.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Callable

import numpy as np
import pandas as pd

NIVEL_INTENSIDAD = {"debil": 1, "moderado": 2, "fuerte": 3, "muy_fuerte": 4}
SIGNO_FASE = {"el_nino": 1, "la_nina": -1}
ETIQUETA_FASE = {"el_nino": "El Niño", "la_nina": "La Niña", "neutro": "Neutro"}

MIN_DIAS_POR_MES = 20  # un mes con menos días se descarta para no sesgar el promedio


def _a_fecha(valor) -> date | None:
    if valor is None or valor == "":
        return None
    if isinstance(valor, (datetime, pd.Timestamp)):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return pd.Timestamp(valor).date()


def _normalizar(eventos: list[dict]) -> list[dict]:
    salida = []
    for e in eventos:
        inicio = _a_fecha(e.get("fecha_inicio"))
        if inicio is None or e.get("fase") not in SIGNO_FASE:
            continue
        salida.append(
            {
                "id": e.get("id"),
                "nombre": e.get("nombre", ""),
                "fase": e["fase"],
                "intensidad": e.get("intensidad", "moderado"),
                "inicio": inicio,
                "fin": _a_fecha(e.get("fecha_fin")),
            }
        )
    return salida


def _evento_en_normalizado(dia: date, normalizados: list[dict]) -> dict | None:
    candidatos = [
        e for e in normalizados if e["inicio"] <= dia and (e["fin"] is None or dia <= e["fin"])
    ]
    if not candidatos:
        return None
    return max(candidatos, key=lambda e: NIVEL_INTENSIDAD.get(e["intensidad"], 1))


def evento_en(fecha, eventos: list[dict]) -> dict | None:
    """Evento más intenso que cubre la fecha, o None si el período es neutro."""
    return _evento_en_normalizado(_a_fecha(fecha), _normalizar(eventos))


def construir_funcion_enso(eventos: list[dict]) -> Callable[[pd.Timestamp], float]:
    """fecha -> signo(fase) * nivel(intensidad); 0 si no hay evento."""
    normalizados = _normalizar(eventos)  # se normaliza una sola vez

    def enso(fecha) -> float:
        e = _evento_en_normalizado(_a_fecha(fecha), normalizados)
        if e is None:
            return 0.0
        return float(SIGNO_FASE[e["fase"]] * NIVEL_INTENSIDAD.get(e["intensidad"], 1))

    return enso


def evento_actual(eventos: list[dict], hoy: date | None = None) -> dict | None:
    return evento_en(hoy or date.today(), eventos)


def _num(x) -> float | None:
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return round(float(x), 3)


def analizar_anomalias(df: pd.DataFrame, variable: str, eventos: list[dict]) -> dict:
    """
    df: columnas fecha (datetime) y <variable> (promedio diario).
    La climatología de cada mes del año es el promedio de ese mes en todos los
    años disponibles; la anomalía es el promedio mensual menos esa climatología.
    """
    advertencias: list[str] = []

    d = df[["fecha", variable]].dropna().copy()
    d["periodo"] = d["fecha"].dt.to_period("M")
    mensual = (
        d.groupby("periodo")[variable].agg(valor="mean", dias="size").reset_index()
    )

    incompletos = int((mensual["dias"] < MIN_DIAS_POR_MES).sum())
    if incompletos:
        advertencias.append(
            f"Se descartaron {incompletos} mes(es) con menos de {MIN_DIAS_POR_MES} días de datos."
        )
    mensual = mensual[mensual["dias"] >= MIN_DIAS_POR_MES].copy()

    if mensual.empty:
        return {
            "mensual": [],
            "por_fase": [],
            "anios_con_datos": 0,
            "advertencias": advertencias + ["No hay meses completos para analizar."],
        }

    mensual["mes_num"] = mensual["periodo"].dt.month
    mensual["anio"] = mensual["periodo"].dt.year
    anios_con_datos = int(mensual["anio"].nunique())

    clim = mensual.groupby("mes_num")["valor"].mean()
    anios_por_mes = mensual.groupby("mes_num")["anio"].nunique()
    mensual["climatologia"] = mensual["mes_num"].map(clim)
    mensual["anios_base"] = mensual["mes_num"].map(anios_por_mes)
    mensual["anomalia"] = mensual["valor"] - mensual["climatologia"]
    # Con un solo año por mes la anomalía sería siempre 0: no es información.
    mensual.loc[mensual["anios_base"] < 2, "anomalia"] = np.nan

    if anios_con_datos < 2:
        advertencias.append(
            "Hay datos de un solo año: no se puede calcular una climatología. "
            "Importa varios años (por ejemplo 2018 en adelante) para ver anomalías."
        )

    filas = []
    for _, fila in mensual.iterrows():
        mitad_de_mes = fila["periodo"].to_timestamp() + pd.Timedelta(days=14)
        ev = evento_en(mitad_de_mes, eventos)
        fase = ev["fase"] if ev else "neutro"
        filas.append(
            {
                "mes": str(fila["periodo"]),
                "valor": _num(fila["valor"]),
                "climatologia": _num(fila["climatologia"]),
                "anomalia": _num(fila["anomalia"]),
                "fase": fase,
                "evento": ev["nombre"] if ev else None,
            }
        )

    tabla = pd.DataFrame(filas)
    por_fase = []
    validos = tabla.dropna(subset=["anomalia"])
    for fase, grupo in validos.groupby("fase"):
        por_fase.append(
            {
                "fase": fase,
                "etiqueta": ETIQUETA_FASE.get(fase, fase),
                "meses": int(len(grupo)),
                "valor_medio": _num(grupo["valor"].mean()),
                "anomalia_media": _num(grupo["anomalia"].mean()),
            }
        )

    if len(por_fase) < 2 and anios_con_datos >= 2:
        advertencias.append(
            "Todos los meses analizados caen en una misma fase, por lo que no hay con qué comparar. "
            "Amplía el período para incluir años con y sin evento."
        )
    advertencias.append(
        "La comparación por fase es descriptiva: con pocos años no permite atribuir las diferencias "
        "al fenómeno, porque también influyen otros factores y la variabilidad natural."
    )

    return {
        "mensual": filas,
        "por_fase": por_fase,
        "anios_con_datos": anios_con_datos,
        "advertencias": advertencias,
    }
