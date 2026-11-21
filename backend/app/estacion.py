"""
Estación meteorológica del Aeropuerto Jorge Wilstermann (Cochabamba, OACI: SLCB).

Para qué sirve:
  El historial de ClimaTech viene del reanálisis de Open-Meteo (ERA5-Land, celdas de
  ~10 km). En un valle rodeado de montañas, esa celda mezcla la ciudad con las laderas
  y suele salir más fría que lo que se mide en la ciudad. La estación del aeropuerto
  es una medición real; con ella:
    1) se calcula cuánto se desvía Open-Meteo, mes a mes, y se corrige (corrección de sesgo),
    2) se verifica qué tan bien acertaron las proyecciones guardadas.
  Open-Meteo se sigue usando para todo lo demás: historial continuo, pronóstico y alertas.

Fuente de las mediciones: archivo mundial de reportes METAR de la Iowa Environmental
Mesonet (Iowa State University), gratuito y sin clave.

Este módulo separa la lógica pura (leer, resumir y corregir: se puede probar sin red)
del acceso a la base de datos y a internet.
"""

from __future__ import annotations

import time
from datetime import date, timedelta
from threading import Lock

import httpx
import numpy as np
import pandas as pd

ESTACION = "SLCB"
NOMBRE_ESTACION = "Aeropuerto Jorge Wilstermann (SLCB)"
IEM_URL = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
NUDOS_A_KMH = 1.852
HORAS_MINIMAS = 20          # un día cuenta para el promedio si tiene al menos 20 horas con reporte
DIAS_MINIMOS_CORRECCION = 60
MINIMO_POR_MES = 15         # días emparejados para calcular la corrección propia de un mes
FRACCION_PRUEBA = 0.25      # último 25 % de los días para medir el impacto (fuera de muestra)
VARIABLES = ("temperatura", "humedad", "velocidad_viento")
LIMITES = {"temperatura": (-30.0, 50.0), "humedad": (0.0, 100.0), "velocidad_viento": (0.0, 200.0)}

NOMBRE_METODO = {
    "sin_correccion": "Open-Meteo sin corregir",
    "sesgo_mensual": "Corrección de sesgo por mes",
    "regresion_mensual": "Regresión lineal por mes",
}


# =================================================================== lógica pura
def _num(texto: str) -> float | None:
    texto = (texto or "").strip()
    if texto in ("", "M", "T", "null", "None"):
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def leer_csv_iem(texto: str) -> pd.DataFrame:
    """CSV de la IEM (station,valid,tmpc,relh,sknt) -> DataFrame horario [instante, temperatura, humedad, velocidad_viento]."""
    lineas = [l for l in texto.splitlines() if l.strip() and not l.startswith("#")]
    if not lineas:
        return pd.DataFrame(columns=["instante", *VARIABLES])
    cab = [c.strip() for c in lineas[0].split(",")]
    if "valid" not in cab:
        raise ValueError(f"Respuesta inesperada de la IEM (sin columna 'valid'): {lineas[0][:120]}")
    i_t, i_v = cab.index("valid"), {c: cab.index(c) for c in ("tmpc", "relh", "sknt") if c in cab}
    filas = []
    for linea in lineas[1:]:
        partes = linea.split(",")
        if len(partes) < len(cab):
            continue
        val = {c: _num(partes[i]) for c, i in i_v.items()}
        filas.append(
            {
                "instante": partes[i_t].strip(),
                "temperatura": val.get("tmpc"),
                "humedad": val.get("relh"),
                "velocidad_viento": val["sknt"] * NUDOS_A_KMH if val.get("sknt") is not None else None,
            }
        )
    df = pd.DataFrame(filas, columns=["instante", *VARIABLES])
    df["instante"] = pd.to_datetime(df["instante"], errors="coerce")
    df = df.dropna(subset=["instante"])
    for v in VARIABLES:  # descarta lecturas imposibles (errores de transmisión)
        lo, hi = LIMITES[v]
        df.loc[(df[v] < lo) | (df[v] > hi), v] = np.nan
    return df


def resumir_por_dia(horario: pd.DataFrame) -> list[dict]:
    """
    Primero un valor por hora (los reportes especiales se promedian con el de rutina) y
    luego el resumen diario. Solo se calcula el promedio de los días con suficientes horas,
    para que un día con reportes solo de tarde no parezca más caluroso de lo que fue.
    """
    if horario.empty:
        return []
    h = horario.copy()
    h["fecha"] = h["instante"].dt.date
    h["hora"] = h["instante"].dt.hour
    por_hora = h.groupby(["fecha", "hora"], as_index=False)[list(VARIABLES)].mean()

    dias = []
    for fecha, g in por_hora.groupby("fecha"):
        horas_t = int(g["temperatura"].notna().sum())
        completo = horas_t >= HORAS_MINIMAS

        def prom(v):
            s = g[v].dropna()
            return round(float(s.mean()), 2) if completo and len(s) >= HORAS_MINIMAS else None

        t = g["temperatura"].dropna()
        dias.append(
            {
                "estacion": ESTACION,
                "fecha": fecha.isoformat(),
                "temperatura": prom("temperatura"),
                "temperatura_max": round(float(t.max()), 1) if completo else None,
                "temperatura_min": round(float(t.min()), 1) if completo else None,
                "humedad": prom("humedad"),
                "velocidad_viento": prom("velocidad_viento"),
                "horas": int(g["hora"].nunique()),
                "fuente": "IEM METAR",
            }
        )
    return dias


def _ajustar(train: pd.DataFrame, metodo: str) -> dict:
    """Coeficientes por mes: valor_corregido = a + b * open_meteo. Si un mes tiene pocos datos, usa el ajuste global."""
    def coef(d: pd.DataFrame) -> tuple[float, float]:
        if metodo == "sin_correccion" or d.empty:
            return 0.0, 1.0
        if metodo == "sesgo_mensual" or len(d) < 3 or d["om"].std() < 1e-6:
            return float((d["est"] - d["om"]).mean()), 1.0
        b, a = np.polyfit(d["om"], d["est"], 1)
        return float(a), float(b)

    global_ = coef(train)
    meses = {}
    for m in range(1, 13):
        d = train[train["mes"] == m]
        meses[m] = coef(d) if len(d) >= MINIMO_POR_MES else global_
    return {"metodo": metodo, "meses": meses}


def _aplicar(om: pd.Series, mes: pd.Series, modelo: dict, variable: str) -> pd.Series:
    a = mes.map(lambda m: modelo["meses"][int(m)][0])
    b = mes.map(lambda m: modelo["meses"][int(m)][1])
    lo, hi = LIMITES[variable]
    return (a + b * om).clip(lo, hi)


def evaluar_correccion(pares: pd.DataFrame, variable: str) -> dict:
    """
    pares: DataFrame[fecha, om, est] (mismo día en Open-Meteo y en la estación).
    Compara 3 opciones en el último 25 % de los días (que no se usan para ajustar) y
    devuelve la mejor ya reajustada con todos los datos, más el detalle para el informe.
    """
    p = pares.dropna().sort_values("fecha").reset_index(drop=True)
    p["mes"] = pd.to_datetime(p["fecha"]).dt.month
    n = len(p)
    if n < DIAS_MINIMOS_CORRECCION:
        raise ValueError(
            f"Hay {n} días con dato en Open-Meteo y en la estación a la vez; se necesitan al menos "
            f"{DIAS_MINIMOS_CORRECCION} para calcular la corrección."
        )
    corte = int(n * (1 - FRACCION_PRUEBA))
    train, test = p.iloc[:corte], p.iloc[corte:]

    opciones = []
    for metodo in NOMBRE_METODO:
        modelo = _ajustar(train, metodo)
        pred = _aplicar(test["om"], test["mes"], modelo, variable)
        err = test["est"] - pred
        opciones.append(
            {
                "metodo": metodo,
                "nombre": NOMBRE_METODO[metodo],
                "mae": round(float(err.abs().mean()), 3),
                "rmse": round(float(np.sqrt((err**2).mean())), 3),
                "sesgo": round(float(err.mean()), 3),  # + = la estación midió más que lo estimado
            }
        )
    opciones.sort(key=lambda o: o["mae"])
    mejor = opciones[0]
    base = next(o for o in opciones if o["metodo"] == "sin_correccion")
    final = _ajustar(p, mejor["metodo"])

    mensual = []
    for m in range(1, 13):
        d = p[p["mes"] == m]
        if d.empty:
            continue
        corr = _aplicar(d["om"], d["mes"], final, variable)
        mensual.append(
            {
                "mes": m,
                "dias": int(len(d)),
                "open_meteo": round(float(d["om"].mean()), 2),
                "estacion": round(float(d["est"].mean()), 2),
                "corregido": round(float(corr.mean()), 2),
                "sesgo": round(float((d["est"] - d["om"]).mean()), 2),
            }
        )

    return {
        "variable": variable,
        "dias_pares": n,
        "desde": str(p["fecha"].iloc[0]),
        "hasta": str(p["fecha"].iloc[-1]),
        "dias_prueba": int(len(test)),
        "prueba_desde": str(test["fecha"].iloc[0]),
        "opciones": opciones,
        "elegido": mejor["metodo"],
        "mejora_pct": round((base["mae"] - mejor["mae"]) / base["mae"] * 100, 1) if base["mae"] > 0 else 0.0,
        "mensual": mensual,
        "modelo": {"metodo": final["metodo"], "meses": {str(k): [round(a, 4), round(b, 4)] for k, (a, b) in final["meses"].items()}},
    }


def corregir_serie(df: pd.DataFrame, variable: str, modelo: dict) -> pd.DataFrame:
    """Aplica la corrección a un DataFrame[fecha, <variable>] con datos de Open-Meteo."""
    if modelo.get("metodo") == "sin_correccion":
        return df
    meses = {int(k): tuple(v) for k, v in modelo["meses"].items()}
    out = df.copy()
    out[variable] = _aplicar(out[variable], pd.to_datetime(out["fecha"]).dt.month, {"meses": meses}, variable)
    return out


# ================================================================ red y base de datos
def descargar_iem(inicio: date, fin: date, timeout: float = 90.0) -> pd.DataFrame:
    """Reportes METAR de SLCB entre dos fechas (hora de Bolivia), en tramos de un año."""
    partes = []
    desde = inicio
    while desde <= fin:
        hasta = min(fin, desde + timedelta(days=365))
        params = [
            ("station", ESTACION),
            ("data", "tmpc"),
            ("data", "relh"),
            ("data", "sknt"),
            ("sts", f"{desde.isoformat()}T04:00Z"),  # 00:00 en Bolivia (UTC-4)
            ("ets", f"{(hasta + timedelta(days=1)).isoformat()}T04:00Z"),
            ("tz", "America/La_Paz"),
            ("format", "onlycomma"),
            ("latlon", "no"),
            ("elev", "no"),
            ("missing", "empty"),
            ("trace", "empty"),
            ("direct", "no"),
        ]
        r = httpx.get(IEM_URL, params=params, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
        partes.append(leer_csv_iem(r.text))
        desde = hasta + timedelta(days=1)
        time.sleep(1)  # la IEM limita la cantidad de pedidos por minuto
    return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=["instante", *VARIABLES])


def guardar_observaciones(dias: list[dict]) -> int:
    from app.auth import supabase_admin

    for i in range(0, len(dias), 500):
        supabase_admin.table("observaciones_estacion").upsert(dias[i : i + 500], on_conflict="estacion,fecha").execute()
    return len(dias)


def cargar_observaciones(variable: str) -> pd.DataFrame:
    """DataFrame[fecha, est] con los promedios diarios de la estación (paginado de a 1000)."""
    from app.auth import supabase_admin

    filas, desde = [], 0
    while True:
        pagina = (
            supabase_admin.table("observaciones_estacion")
            .select(f"fecha,{variable}")
            .eq("estacion", ESTACION)
            .not_.is_(variable, "null")
            .order("fecha")
            .range(desde, desde + 999)
            .execute()
            .data
            or []
        )
        filas.extend(pagina)
        if len(pagina) < 1000:
            break
        desde += 1000
    df = pd.DataFrame(filas, columns=["fecha", variable]).rename(columns={variable: "est"})
    df["fecha"] = pd.to_datetime(df["fecha"])
    return df


def pares_open_meteo_estacion(variable: str) -> pd.DataFrame:
    from app.datos import cargar_serie_diaria

    est = cargar_observaciones(variable)
    if est.empty:
        return pd.DataFrame(columns=["fecha", "om", "est"])
    om = cargar_serie_diaria(variable, None, None).rename(columns={variable: "om"})[["fecha", "om"]]
    return om.merge(est, on="fecha", how="inner")


# Caché de la corrección: se recalcula como máximo cada 10 minutos o al importar datos nuevos.
_cache: dict[str, tuple[float, dict | None]] = {}
_candado = Lock()
CACHE_SEGUNDOS = 600


def obtener_correccion(variable: str, forzar: bool = False) -> dict | None:
    """Resultado de evaluar_correccion o None si no hay datos suficientes de la estación."""
    with _candado:
        guardado = _cache.get(variable)
        if guardado and not forzar and time.time() - guardado[0] < CACHE_SEGUNDOS:
            return guardado[1]
    try:
        resultado = evaluar_correccion(pares_open_meteo_estacion(variable), variable)
    except Exception:
        resultado = None  # sin tabla (falta la migración 005), sin datos o pocos días
    with _candado:
        _cache[variable] = (time.time(), resultado)
    return resultado


def limpiar_cache() -> None:
    with _candado:
        _cache.clear()


def verificar_proyecciones(variable: str, limite: int = 300) -> list[dict]:
    """Error real (contra la estación) de las proyecciones guardadas, agrupado por método."""
    from app.auth import supabase_admin

    est = cargar_observaciones(variable)
    if est.empty:
        return []
    proys = (
        supabase_admin.table("proyecciones")
        .select("id,metodo,parametros")
        .eq("variable", variable)
        .order("created_at", desc=True)
        .limit(limite)
        .execute()
        .data
        or []
    )
    if not proys:
        return []
    metodo_de = {p["id"]: p["metodo"] for p in proys}
    corregida_de = {p["id"]: bool((p.get("parametros") or {}).get("correccion_estacion")) for p in proys}
    valores: list[dict] = []
    ids = list(metodo_de)
    for i in range(0, len(ids), 100):
        valores += (
            supabase_admin.table("proyeccion_valores")
            .select("proyeccion_id,fecha,valor")
            .in_("proyeccion_id", ids[i : i + 100])
            .execute()
            .data
            or []
        )
    if not valores:
        return []
    v = pd.DataFrame(valores)
    v["fecha"] = pd.to_datetime(v["fecha"])
    v = v.merge(est, on="fecha", how="inner")
    if v.empty:
        return []
    v["metodo"] = v["proyeccion_id"].map(metodo_de)
    v["corregida"] = v["proyeccion_id"].map(corregida_de)
    v["error"] = v["est"] - v["valor"]
    salida = []
    for (metodo, corregida), g in v.groupby(["metodo", "corregida"]):
        salida.append(
            {
                "metodo": metodo,
                "corregida": bool(corregida),
                "dias": int(len(g)),
                "proyecciones": int(g["proyeccion_id"].nunique()),
                "mae": round(float(g["error"].abs().mean()), 2),
                "sesgo": round(float(g["error"].mean()), 2),
            }
        )
    return sorted(salida, key=lambda s: s["mae"])
