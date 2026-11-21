"""
Asistente conversacional de ClimaTech.

  POST /asistente/mensaje   recibe el mensaje y el contexto de la conversación,
                            ejecuta lo que corresponda y devuelve la respuesta.

Qué hace el servidor directamente (solo lectura): proyecciones comparando
métodos, eventos El Niño / La Niña, anomalías y pronóstico.
Qué NO hace: importar datos, generar reportes y cambiar preferencias de alertas.
Para esas acciones devuelve una "acción" que el navegador ejecuta, tras la
confirmación del usuario, llamando a los endpoints que ya existen (con sus
propios permisos y auditoría).
"""

from datetime import date, timedelta

import pandas as pd

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.alertas_reglas import evaluar_pronostico, valor_en
from app.analisis_enso import analizar_anomalias, construir_funcion_enso, evento_actual
from app.asistente_clasificador import clasificar
from app.asistente_llm import interpretar_con_llm
from app.asistente_nlu import fusionar_slots, interpretar, resolver_periodo, sanear_contexto
from app.asistente_texto import (
    UNIDADES,
    texto_anomalias,
    descriptor,
    nombre_dia,
    nombre_mes,
    texto_ayuda,
    texto_historial_alertas,
    texto_registros,
    texto_reportes,
    texto_resumen,
    texto_eventos,
    texto_metodos,
    texto_pronostico,
    texto_proyeccion,
    texto_proyeccion_corto,
)
from app.auth import UsuarioActual, get_current_user, supabase_admin
from app.datos import cargar_serie_diaria, listar_eventos
from app.ia_modelos import METODOS, comparar_metodos, enso_varia, preparar_serie
from app.pronostico_openmeteo import distancia, obtener_referencia
from app import estacion as modulo_estacion
from app import mos as modulo_mos
from app.routers import alertas as modulo_alertas

router = APIRouter(prefix="/asistente", tags=["asistente"])

DIAS_PRUEBA = 7
DIAS_HISTORICO_DEFECTO = 730
MAX_DIAS_IMPORTACION = 366
MINIMO_RECOMENDADO_ML = 90
MEJORA_MIN_ENSO = 0.02  # la fase El Niño/La Niña se usa solo si baja el error al menos un 2 %
MIN_DIAS_OPENMETEO = 3  # días en común con Open-Meteo para elegir el método más cercano

OTRAS_VARIABLES = {
    "temperatura": [("humedad", "Humedad"), ("velocidad_viento", "Viento")],
    "humedad": [("temperatura", "Temperatura"), ("velocidad_viento", "Viento")],
    "velocidad_viento": [("temperatura", "Temperatura"), ("humedad", "Humedad")],
}


class MensajeRequest(BaseModel):
    mensaje: str = Field(min_length=1, max_length=300)
    contexto: dict | None = None


# ----------------------------------------------------------------- utilidades
def _b(texto: str, mensaje: str | None = None) -> dict:
    return {"texto": texto, "mensaje": mensaje or texto}


BOTONES_AYUDA = [
    _b("Proyección del clima", "proyecta la temperatura de los próximos 7 días"),
    _b("Registrar un dato", "quiero registrar un dato"),
    _b("Ver registros", "muéstrame los últimos registros"),
    _b("Importar datos", "importa datos de Open-Meteo"),
    _b("Generar reporte", "genera un reporte"),
    _b("Fenómenos y anomalías", "¿qué fenómenos y anomalías hay?"),
    _b("Alertas por correo", "pronóstico de lluvia"),
]
BOTONES_PERIODO = [
    _b("Últimos 30 días", "últimos 30 días"),
    _b("Últimos 6 meses", "últimos 6 meses"),
    _b("Último año", "último año"),
]


def _ctx(ctx: dict, **cambios) -> dict:
    base = {"intencion_pendiente": None, "slots": {}, "accion": None, "ultima": ctx.get("ultima")}
    base.update(cambios)
    return base


def _resp(texto: str, ctx: dict, *, tarjetas=None, botones=None, accion=None, avisos=None, **cambios_ctx) -> dict:
    cuerpo = texto
    if avisos:
        cuerpo = "\n".join(avisos) + "\n\n" + texto
    return {
        "respuesta": cuerpo,
        "tarjetas": tarjetas or [],
        "botones": botones or [],
        "accion": accion,
        "contexto": _ctx(ctx, accion=accion, **cambios_ctx),
    }


def _ultima_fecha() -> date | None:
    filas = supabase_admin.table("registros_diarios").select("fecha").order("fecha", desc=True).limit(1).execute().data
    return date.fromisoformat(filas[0]["fecha"]) if filas else None


def _es_admin(usuario) -> bool:
    return usuario is not None and getattr(usuario, "rol", None) == "administrador"


def _solo_admin(ctx, avisos):
    return _resp("Esa acción es solo para administradores.", ctx, botones=BOTONES_AYUDA[:4], avisos=avisos)


def _consultar_resumen() -> tuple[int, str, str] | None:
    tabla = supabase_admin.table("registros_diarios")
    total = tabla.select("fecha", count="exact").limit(1).execute()
    n = total.count or 0
    if n == 0:
        return None
    primero = supabase_admin.table("registros_diarios").select("fecha").order("fecha").limit(1).execute().data[0]["fecha"]
    ultimo = supabase_admin.table("registros_diarios").select("fecha").order("fecha", desc=True).limit(1).execute().data[0]["fecha"]
    return n, primero, ultimo


def _consultar_registros(cantidad: int, inicio: date | None, fin: date | None) -> list[dict]:
    q = (
        supabase_admin.table("registros_climaticos")
        .select("id,fecha,hora,temperatura,humedad,velocidad_viento,fuente")
        .order("fecha", desc=True)
        .order("hora", desc=True)
        .limit(cantidad)
    )
    if inicio:
        q = q.gte("fecha", inicio.isoformat())
    if fin:
        q = q.lte("fecha", fin.isoformat())
    return q.execute().data or []


def _consultar_reportes() -> list[dict]:
    return (
        supabase_admin.table("reportes")
        .select("id,tipo,periodo_inicio,periodo_fin,archivo_url,created_at")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data
        or []
    )


def _consultar_historial_alertas() -> list[dict]:
    return (
        supabase_admin.table("alertas_enviadas")
        .select("tipo,nivel,fecha_pronostico,enviado_en,profiles(nombre_completo)")
        .order("enviado_en", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )


def _periodo_explicito(inicio: date, fin: date) -> dict:
    return {"inicio": inicio.isoformat(), "fin": fin.isoformat(), "rel": None, "anio": None, "ese_periodo": False}


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


# ------------------------------------------------------------------- handlers
def _h_ayuda(slots, ctx, avisos, usuario=None):
    return _resp(texto_ayuda(), ctx, botones=BOTONES_AYUDA, avisos=avisos)


def _h_metodos(slots, ctx, avisos, usuario=None):
    return _resp(texto_metodos(), ctx, botones=[_b("Proyectar con comparación", "proyecta la temperatura de los próximos 7 días")], avisos=avisos)


def _pedir_variable(slots, ctx, avisos, intencion):
    return _resp(
        "¿De qué variable quieres hacerlo?",
        ctx,
        botones=[_b("Temperatura", "temperatura"), _b("Humedad", "humedad"), _b("Viento", "viento")]
        + ([_b("Ver pronóstico de lluvia", "pronóstico de lluvia")] if any("lluvia" in a for a in (avisos or [])) else []),
        avisos=avisos,
        intencion_pendiente=intencion,
        slots=slots,
    )


def _sin_datos(variable, inicio, fin, ctx, avisos):
    return _resp(
        f"No encontré datos de {variable.replace('_', ' ')} entre {_fmt(inicio)} y {_fmt(fin)}. "
        "Puedo importarlos de Open-Meteo si quieres.",
        ctx,
        botones=[_b("Importar ese período", f"importa desde {inicio.isoformat()} hasta {fin.isoformat()}")],
        avisos=avisos,
    )


def _dias_de(diario: dict) -> list[dict]:
    return [
        {
            "fecha": f,
            "lluvia_mm": valor_en(diario.get("precipitation_sum"), i),
            "prob_lluvia": valor_en(diario.get("precipitation_probability_max"), i),
            "tmax": valor_en(diario.get("temperature_2m_max"), i),
            "tmin": valor_en(diario.get("temperature_2m_min"), i),
            "rafaga": valor_en(diario.get("wind_gusts_10m_max"), i),
            "codigo": valor_en(diario.get("weather_code"), i),
        }
        for i, f in enumerate(diario.get("time") or [])
    ]


def _alertas_probables() -> tuple[bool, list[dict], list[dict]]:
    """(consulta_ok, dias, alertas). No falla si no hay internet: devuelve (False, [], [])."""
    try:
        diario = modulo_alertas.obtener_pronostico(timeout=6.0)
    except HTTPException:
        return False, [], []
    return True, _dias_de(diario), evaluar_pronostico(diario)


def _consultar_amplitud() -> tuple[float, float] | None:
    """Amplitud diaria típica de los últimos 90 días (cuánto sube el máximo y baja el mínimo respecto al promedio)."""
    try:
        filas = (
            supabase_admin.table("registros_diarios")
            .select("temperatura,temperatura_max,temperatura_min")
            .order("fecha", desc=True)
            .limit(90)
            .execute()
            .data
            or []
        )
    except Exception:
        return None  # la vista aún no tiene las columnas (migración 003)
    if not filas:
        return None
    d = pd.DataFrame(filas).dropna()
    if d.empty:
        return None
    return float((d["temperatura_max"] - d["temperatura"]).mean()), float((d["temperatura"] - d["temperatura_min"]).mean())


def _guardar_proyeccion(usuario, variable: str, elegido: dict, inicio: date, fin: date, enso_usado: bool, corregida: bool = False) -> bool:
    """Guarda la proyección como hacía la pantalla de Proyecciones, para que los reportes la incluyan."""
    try:
        fila = (
            supabase_admin.table("proyecciones")
            .insert(
                {
                    "variable": variable,
                    "metodo": elegido["metodo"],
                    "parametros": {"origen": "asistente", "enso": enso_usado, "correccion_estacion": corregida},
                    "periodo_inicio": inicio.isoformat(),
                    "periodo_fin": fin.isoformat(),
                    "mae": elegido["mae"],
                    "rmse": elegido["rmse"],
                    "r2": None,
                    "generado_por": getattr(usuario, "id", None),
                }
            )
            .execute()
        )
        pid = fila.data[0]["id"]
        supabase_admin.table("proyeccion_valores").insert([{"proyeccion_id": pid, **v} for v in elegido["proyeccion"]]).execute()
        return True
    except Exception:
        return False


def _mejor_rmse(resultado: dict | None) -> float | None:
    if not resultado:
        return None
    r = next((x for x in resultado["resultados"] if x["metodo"] == resultado["mejor_metodo"]), None)
    return r["rmse"] if r else None


def _h_proyectar(slots, ctx, avisos, usuario=None):
    variable = slots.get("variable")
    if not variable:
        return _pedir_variable(slots, ctx, avisos, "proyectar")

    dias = slots.get("dias", 7)
    ultimo = _ultima_fecha()
    if ultimo is None:
        return _resp(
            "Todavía no hay datos históricos en la base. Puedo importarlos de Open-Meteo.",
            ctx,
            botones=[_b("Importar datos", "importa los últimos 6 meses")],
            avisos=avisos,
        )

    ultima_periodo = ((ctx.get("ultima") or {}).get("slots") or {}).get("periodo")
    inicio, fin = resolver_periodo(slots.get("periodo"), ultimo, DIAS_HISTORICO_DEFECTO, ultima_periodo)
    if inicio is None or fin is None:
        inicio, fin = resolver_periodo(None, ultimo, DIAS_HISTORICO_DEFECTO)

    try:
        df = cargar_serie_diaria(variable, inicio, fin)
    except HTTPException as exc:
        if exc.status_code == 404:
            return _sin_datos(variable, inicio, fin, ctx, avisos)
        raise

    # --- Corrección con la estación del aeropuerto: el historial de Open-Meteo se ajusta a lo medido
    # (si hay mediciones importadas y la corrección mejora en la prueba). «sin corrección» la desactiva.
    correccion = None
    if slots.get("corregir") is not False:
        c = modulo_estacion.obtener_correccion(variable)
        if c and c["elegido"] != "sin_correccion":
            correccion = c
            df = modulo_estacion.corregir_serie(df, variable, c["modelo"])

    serie, info = preparar_serie(df, variable)
    if len(serie) < DIAS_PRUEBA + 5:
        return _resp(
            f"Solo hay {len(serie)} días continuos con datos en ese período y necesito al menos {DIAS_PRUEBA + 5} "
            "para poder evaluar los métodos. Prueba con un período más amplio o importa más datos.",
            ctx,
            botones=[_b("Importar datos", "importa los últimos 6 meses")],
            avisos=avisos,
        )

    # --- Fenómenos: se prueba la proyección con y sin la fase de El Niño / La Niña y se queda la más fiel
    eventos = listar_eventos()
    actual = evento_actual(eventos)
    enso_fn = construir_funcion_enso(eventos)
    varia = enso_varia(list(serie["fecha"]), enso_fn)
    forzado = slots.get("usar_enso")

    try:
        res_sin = comparar_metodos(serie, DIAS_PRUEBA, dias, None)
    except ValueError as exc:
        return _resp(str(exc), ctx, avisos=avisos)
    if not res_sin["resultados"]:
        return _resp("Ningún método pudo ejecutarse con los datos disponibles.", ctx, avisos=avisos)

    res_con = None
    if forzado is not False and varia:
        try:
            res_con = comparar_metodos(serie, DIAS_PRUEBA, dias, enso_fn)
        except ValueError:
            res_con = None

    rmse_sin, rmse_con = _mejor_rmse(res_sin), _mejor_rmse(res_con)
    if forzado is True:
        modo, usar_con = "forzado", res_con is not None
    elif forzado is False:
        modo, usar_con = "excluido", False
    else:
        modo = "auto"
        usar_con = bool(res_con and rmse_con is not None and rmse_sin is not None and rmse_con < rmse_sin * (1 - MEJORA_MIN_ENSO))
    resultado = res_con if usar_con else res_sin
    enso_info = {
        "modo": modo,
        "usado": usar_con,
        "varia": varia,
        "evento_actual": actual["nombre"] if actual else None,
        "rmse_con": rmse_con,
        "rmse_sin": rmse_sin,
    }

    lista = resultado["resultados"]
    mejor = next((r for r in lista if r["metodo"] == resultado["mejor_metodo"]), None)
    pedido = slots.get("metodo")
    elegido = next((r for r in lista if r["metodo"] == pedido), None)

    # --- Referencia externa: pronóstico de Open-Meteo (modelo meteorológico físico) para las mismas fechas.
    # Se mide qué tan cerca queda cada método y, si el usuario no pidió uno, se usa el más cercano.
    referencia = obtener_referencia([p["fecha"] for p in lista[0]["proyeccion"]])
    cercano = None
    if referencia:
        for r in lista:
            d = distancia(r["proyeccion"], referencia, variable)
            r["dif_openmeteo"], r["dias_openmeteo"] = d if d else (None, 0)
        comparables = [r for r in lista if r["dif_openmeteo"] is not None and r["dias_openmeteo"] >= MIN_DIAS_OPENMETEO]
        cercano = min(comparables, key=lambda r: r["dif_openmeteo"]) if comparables else None

    # --- Modelo híbrido (MOS): el pronóstico de Open-Meteo corregido por un modelo que aprendió, con
    # pronósticos pasados y lo medido en la estación, cómo se equivoca Open-Meteo en Cochabamba.
    # Cubre los días que alcanza el pronóstico (hasta 16); los días siguientes los completa el mejor método estadístico.
    hibrido, mos = None, None
    if referencia and slots.get("corregir") is not False:
        mos = modulo_mos.obtener_mos(variable)
        if mos:
            relleno = cercano or mejor or lista[0]
            pred = modulo_mos.predecir(mos, referencia, [p["fecha"] for p in relleno["proyeccion"]], variable)
            if len(pred) >= MIN_DIAS_OPENMETEO:
                opcion = next(o for o in mos["opciones"] if o["metodo"] == mos["elegido"])
                hibrido = {
                    "metodo": "hibrido_mos",
                    "nombre": f"Híbrido: {opcion['nombre']}",
                    "es_ml": True,
                    "mae": opcion["mae"],
                    "rmse": opcion["rmse"],
                    "prueba": mos["muestra"],
                    "proyeccion": [{"fecha": p["fecha"], "valor": pred.get(p["fecha"], p["valor"])} for p in relleno["proyeccion"]],
                    "mejora_vs_referencia_pct": None,
                    "dias_hibrido": len(pred),
                    "relleno": relleno["nombre"] if len(pred) < len(relleno["proyeccion"]) else None,
                }
                d = distancia(hibrido["proyeccion"], referencia, variable)
                hibrido["dif_openmeteo"], hibrido["dias_openmeteo"] = d if d else (None, 0)
                lista.append(hibrido)

    advertencias: list[str] = []
    if pedido and elegido is None:
        motivo = next((o["motivo"] for o in resultado["omitidos"] if o["metodo"] == pedido), "no se pudo ejecutar")
        advertencias.append(f"No pude usar el método que pediste: {motivo}")
    if elegido:
        criterio = "pedido"
    elif hibrido:
        elegido, criterio = hibrido, "mos"
    elif cercano:
        elegido, criterio = cercano, "openmeteo"
    else:
        elegido, criterio = (mejor or lista[0]), "error"

    om_valores = [referencia[p["fecha"]][variable] for p in elegido["proyeccion"]
                  if referencia and p["fecha"] in referencia and referencia[p["fecha"]].get(variable) is not None]
    om_tmax = [referencia[p["fecha"]]["tmax"] for p in elegido["proyeccion"]
               if referencia and p["fecha"] in referencia and referencia[p["fecha"]].get("tmax") is not None]
    openmeteo = {
        "ok": bool(om_valores),
        "dias": len(om_valores),
        "promedio": round(sum(om_valores) / len(om_valores), 2) if om_valores else None,
        "tmax_min": min(om_tmax) if om_tmax else None,
        "tmax_max": max(om_tmax) if om_tmax else None,
        "dif_elegido": elegido.get("dif_openmeteo"),
        "cercano": cercano["nombre"] if cercano else None,
    }

    if info["dias_descartados"]:
        advertencias.append(f"Había un hueco grande de datos: usé solo el último tramo continuo ({info['dias_serie']} días).")
    elif info["dias_faltantes"]:
        advertencias.append(f"Rellené {info['dias_faltantes']} día(s) sin dato por interpolación.")
    if len(serie) < MINIMO_RECOMENDADO_ML:
        advertencias.append(
            f"Solo hay {len(serie)} días de histórico; los modelos de IA rinden mejor con {MINIMO_RECOMENDADO_ML} o más."
        )

    datos_serie = {
        "dias_serie": len(serie),
        "inicio": serie["fecha"].iloc[0].date().isoformat(),
        "fin": serie["fecha"].iloc[-1].date().isoformat(),
        "reciente": float(serie["valor"].tail(7).mean()),
    }

    # --- Contexto: qué es lo habitual para la época y cómo vienen los últimos meses
    valores = [p["valor"] for p in elegido["proyeccion"]]
    promedio = sum(valores) / len(valores)
    resumen = {
        "promedio": promedio,
        "minimo": min(valores),
        "maximo": max(valores),
        "reciente": datos_serie["reciente"],
        "descriptor": descriptor(variable, promedio),
    }
    habitual = anomalia_reciente = None
    try:
        analisis = analizar_anomalias(df, variable, eventos)
    except Exception:
        analisis = None
    if analisis and analisis["anios_con_datos"] >= 2:
        mes_proy = int(elegido["proyeccion"][len(valores) // 2]["fecha"][5:7])
        clim = next((m["climatologia"] for m in analisis["mensual"] if int(m["mes"][5:7]) == mes_proy), None)
        if clim is not None:
            habitual = {"valor": round(clim, 2), "mes": nombre_mes(mes_proy), "diferencia": round(promedio - clim, 2)}
        con_anomalia = [m for m in analisis["mensual"] if m["anomalia"] is not None]
        if con_anomalia:
            u = con_anomalia[-1]
            anomalia_reciente = {"mes": u["mes"], "anomalia": u["anomalia"], "fase": u["fase"]}

    # --- Alertas probables (pronóstico de Open-Meteo, puede no estar disponible sin internet)
    pron_ok, dias_pron, alertas = _alertas_probables()

    amplitud = _consultar_amplitud() if variable == "temperatura" else None
    dias_tarjeta = [
        {
            "fecha": p["fecha"],
            "dia": nombre_dia(p["fecha"]),
            "valor": p["valor"],
            "descriptor": descriptor(variable, p["valor"]),
            "max_est": round(p["valor"] + amplitud[0], 1) if amplitud else None,
            "min_est": round(p["valor"] - amplitud[1], 1) if amplitud else None,
            # Cielo y valores del pronóstico de Open-Meteo para ese día (None si no lo cubre)
            "om": (
                {
                    "valor": referencia[p["fecha"]].get(variable),
                    "tmax": referencia[p["fecha"]].get("tmax"),
                    "tmin": referencia[p["fecha"]].get("tmin"),
                    "codigo": referencia[p["fecha"]].get("codigo"),
                    "lluvia_mm": referencia[p["fecha"]].get("lluvia_mm"),
                    "prob_lluvia": referencia[p["fecha"]].get("prob_lluvia"),
                }
                if referencia and p["fecha"] in referencia
                else None
            ),
        }
        for p in elegido["proyeccion"]
    ]

    guardada = _guardar_proyeccion(usuario, variable, elegido, inicio, fin, usar_con, corregida=correccion is not None)
    correccion_info = None
    if correccion:
        mes_proy = int(elegido["proyeccion"][len(elegido["proyeccion"]) // 2]["fecha"][5:7])
        fila_mes = next((m for m in correccion["mensual"] if m["mes"] == mes_proy), None)
        opcion = next(o for o in correccion["opciones"] if o["metodo"] == correccion["elegido"])
        correccion_info = {
            "metodo": opcion["nombre"],
            "mejora_pct": correccion["mejora_pct"],
            "sesgo_mes": fila_mes["sesgo"] if fila_mes else None,
            "mes": nombre_mes(mes_proy),
            "dias_pares": correccion["dias_pares"],
        }
    justificacion = texto_proyeccion(
        variable, dias, resultado, elegido, mejor, datos_serie, enso_info, advertencias, criterio=criterio, openmeteo=openmeteo,
        correccion=correccion_info, sin_corregir_pedido=slots.get("corregir") is False,
        mos=modulo_mos.informe_publico(mos) if mos and criterio == "mos" else None,
    )
    if guardada:
        justificacion += "\nEsta proyección quedó guardada y se incluye en los reportes del mismo período."
    corto = texto_proyeccion_corto(
        variable, dias, resumen, habitual, enso_info, alertas if pron_ok else None, pron_ok,
        elegido=elegido, criterio=criterio, openmeteo=openmeteo, correccion=correccion_info,
        mos=modulo_mos.informe_publico(mos) if mos and criterio == "mos" else None,
    )

    historico = serie.tail(30)
    tarjeta = {
        "tipo": "proyeccion",
        "variable": variable,
        "unidad": UNIDADES[variable],
        "metodo": elegido["nombre"],
        "resumen": resumen,
        "habitual": habitual,
        "anomalia_reciente": anomalia_reciente,
        "dias": dias_tarjeta,
        "rango_estimado": amplitud is not None,
        "enso": {"usado": usar_con, "evento_actual": enso_info["evento_actual"]},
        "pronostico": {"ok": pron_ok, "dias": dias_pron, "alertas": alertas},
        "historico": [
            {"fecha": f.date().isoformat(), "valor": round(float(v), 3)}
            for f, v in zip(historico["fecha"], historico["valor"])
        ],
        "proyeccion": elegido["proyeccion"],
        "openmeteo": openmeteo,
        "criterio": criterio,
        "correccion": correccion_info,
        "hibrido": (
            {
                "modelo": next(o["nombre"] for o in mos["opciones"] if o["metodo"] == mos["elegido"]),
                "mae": elegido["mae"],
                "mae_openmeteo": next(o["mae"] for o in mos["opciones"] if o["metodo"] == "openmeteo_crudo"),
                "mejora_pct": mos["mejora_pct"],
                "fechas": mos["fechas"],
                "dias_hibrido": elegido["dias_hibrido"],
                "relleno": elegido["relleno"],
                "pesos": mos["pesos"] if mos["elegido"] == "ensamble" else None,
            }
            if criterio == "mos"
            else None
        ),
        "prueba": elegido["prueba"],
        "justificacion": justificacion,
        "metodos": [
            {
                "nombre": r["nombre"],
                "mae": r["mae"],
                "rmse": r["rmse"],
                "elegido": r["metodo"] == elegido["metodo"],
                "mejor": bool(mejor and r["metodo"] == mejor["metodo"]),
                "dif_openmeteo": r.get("dif_openmeteo"),
                "cercano": bool(cercano and r["metodo"] == cercano["metodo"]),
            }
            for r in lista
        ],
    }

    botones = []
    if alertas:
        botones.append(_b("Enviarme esta alerta por correo", "envíame las alertas por correo"))
    botones.append(_b("Fenómenos y anomalías", f"fenómenos y anomalías de {variable.replace('_', ' ')}"))
    botones.append(_b("Reporte de este período", "genera un reporte de ese período"))
    for _, nombre in OTRAS_VARIABLES[variable]:
        botones.append(_b(f"Proyectar {nombre.lower()}", f"ahora con {nombre.lower()}"))

    guardado = {"variable": variable, "dias": dias, "periodo": _periodo_explicito(inicio, fin)}
    if forzado is not None:
        guardado["usar_enso"] = forzado
    if pedido:
        guardado["metodo"] = pedido
    if slots.get("corregir") is False:
        guardado["corregir"] = False
    elif correccion_info or criterio == "mos":
        botones.append(_b("Comparar sin corrección", "ahora sin corrección"))
    return _resp(
        corto,
        ctx,
        tarjetas=[tarjeta],
        botones=botones,
        avisos=avisos,
        ultima={"intencion": "proyectar", "slots": guardado},
    )


def _h_fenomenos(slots, ctx, avisos, usuario=None):
    """Fenómenos (El Niño / La Niña) y anomalías de los datos, juntos en una sola respuesta."""
    variable = slots.get("variable", "temperatura")
    eventos = listar_eventos()
    actual = evento_actual(eventos)
    tarjetas = [
        {
            "tipo": "eventos",
            "evento_actual": actual["nombre"] if actual else None,
            "eventos": [
                {k: e.get(k) for k in ("id", "nombre", "fase", "intensidad", "fecha_inicio", "fecha_fin")} for e in eventos[:6]
            ],
            "puede_editar": _es_admin(usuario),
        }
    ]
    textos = [texto_eventos(eventos, actual, cierre=False)]

    hoy = date.today()
    ultima_periodo = ((ctx.get("ultima") or {}).get("slots") or {}).get("periodo")
    inicio, fin = resolver_periodo(slots.get("periodo"), hoy, None, ultima_periodo)
    try:
        df = cargar_serie_diaria(variable, inicio, fin)
        analisis = analizar_anomalias(df, variable, eventos)
        tarjetas.append(
            {
                "tipo": "anomalias",
                "variable": variable,
                "unidad": UNIDADES[variable],
                "por_fase": analisis["por_fase"],
                "mensual": analisis["mensual"][-24:],
            }
        )
        textos.append(texto_anomalias(variable, analisis, None))
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        textos.append("Todavía no hay datos suficientes para calcular anomalías. Puedo importarlos de Open-Meteo.")

    otras = [(v, n) for v, n in OTRAS_VARIABLES[variable]]
    botones = [_b(f"Ver {n.lower()}", f"fenómenos y anomalías de {v.replace('_', ' ')}") for v, n in otras]
    botones.append(_b("Proyectar con estos datos", f"proyecta {variable.replace('_', ' ')} de los próximos 7 días"))
    if _es_admin(usuario):
        botones.append(_b("Registrar un evento", "agrega un evento climático"))
    return _resp(
        "\n\n".join(textos),
        ctx,
        tarjetas=tarjetas,
        botones=botones,
        avisos=avisos,
        ultima={"intencion": "anomalias", "slots": {"variable": variable}},
    )


def _h_alertas(slots, ctx, avisos, usuario=None):
    botones = [
        _b("Activar mis alertas por correo", "activa mis alertas por correo"),
        _b("Enviarme un correo de prueba", "quiero un correo de prueba de lluvia"),
    ]
    try:
        diario = modulo_alertas.obtener_pronostico()
    except HTTPException:
        return _resp(
            "No pude consultar el pronóstico de Open-Meteo (¿sin conexión a internet?). Inténtalo de nuevo en un momento.",
            ctx,
            avisos=avisos,
        )
    alertas = evaluar_pronostico(diario)
    dias = _dias_de(diario)
    return _resp(
        texto_pronostico(dias, alertas),
        ctx,
        tarjetas=[{"tipo": "pronostico", "dias": dias, "alertas": alertas}],
        botones=botones,
        avisos=avisos,
    )


def _pedir_periodo(texto, slots, ctx, avisos, intencion):
    botones = list(BOTONES_PERIODO)
    if intencion == "reporte" and ctx.get("ultima"):
        botones.insert(0, _b("Mismo período de la proyección", "genera un reporte de ese período"))
    return _resp(texto, ctx, botones=botones, avisos=avisos, intencion_pendiente=intencion, slots=slots)


def _h_importar(slots, ctx, avisos, usuario=None):
    hoy = date.today()
    ultima_periodo = ((ctx.get("ultima") or {}).get("slots") or {}).get("periodo")
    inicio, fin = resolver_periodo(slots.get("periodo"), hoy, None, ultima_periodo)
    if inicio is None or fin is None:
        return _pedir_periodo("¿Qué período quieres importar de Open-Meteo?", slots, ctx, avisos, "importar")

    notas = list(avisos or [])
    fin = min(fin, hoy)
    if inicio > fin:
        return _pedir_periodo("Las fechas no son válidas (el inicio es posterior al fin o está en el futuro). ¿Qué período importo?", slots, ctx, notas, "importar")
    dias = (fin - inicio).days + 1
    if dias > MAX_DIAS_IMPORTACION:
        inicio = fin - timedelta(days=MAX_DIAS_IMPORTACION - 1)
        dias = MAX_DIAS_IMPORTACION
        notas.append(f"El máximo por importación es {MAX_DIAS_IMPORTACION} días; ajusté el período. Para más años, repite por tramos.")

    accion = {
        "tipo": "importar_open_meteo",
        "params": {"fecha_inicio": inicio.isoformat(), "fecha_fin": fin.isoformat()},
        "estado": "pendiente",
        "descripcion": f"Importar datos de Open-Meteo del {_fmt(inicio)} al {_fmt(fin)}",
    }
    texto = (
        f"Voy a importar datos horarios de temperatura, humedad y viento de Open-Meteo para Cochabamba del "
        f"{_fmt(inicio)} al {_fmt(fin)} ({dias} días, unos {dias * 24} registros). Los registros que ya existan se ignoran. "
        "Los últimos días pueden venir incompletos porque Open-Meteo tarda en publicarlos. ¿Confirmas?"
    )
    return _resp(texto, ctx, accion=accion, avisos=notas)


FORMATOS_REPORTE = {"pdf": "PDF", "word": "Word", "excel": "Excel"}


def _h_reporte(slots, ctx, avisos, usuario=None):
    hoy = date.today()
    formato = slots.get("formato", "pdf")
    ultima_periodo = ((ctx.get("ultima") or {}).get("slots") or {}).get("periodo")
    inicio, fin = resolver_periodo(slots.get("periodo"), hoy, None, ultima_periodo)
    if inicio is None or fin is None:
        return _pedir_periodo(
            f"¿De qué período quieres el reporte en {FORMATOS_REPORTE[formato]}? (También puede ser en Word o Excel.)",
            slots, ctx, avisos, "reporte",
        )
    fin = min(fin, hoy)
    if inicio > fin:
        return _pedir_periodo("Las fechas no son válidas. ¿De qué período quieres el reporte?", slots, ctx, avisos, "reporte")

    accion = {
        "tipo": "generar_reporte",
        "params": {"periodo_inicio": inicio.isoformat(), "periodo_fin": fin.isoformat(), "formato": formato},
        "estado": "pendiente",
        "descripcion": f"Generar reporte {FORMATOS_REPORTE[formato]} del {_fmt(inicio)} al {_fmt(fin)}",
    }
    texto = (
        f"Voy a generar un reporte en {FORMATOS_REPORTE[formato]} con el resumen histórico y las proyecciones del "
        f"{_fmt(inicio)} al {_fmt(fin)}. Incluye las proyecciones generadas con ese mismo período. ¿Confirmas?"
    )
    otros = [(k, v) for k, v in FORMATOS_REPORTE.items() if k != formato]
    return _resp(
        texto,
        ctx,
        accion=accion,
        botones=[_b(f"Cambiar a {v}", f"en {v}") for _, v in otros],
        avisos=avisos,
    )


def _accion_simple(tipo, params, descripcion, texto, ctx, avisos):
    accion = {"tipo": tipo, "params": params, "estado": "pendiente", "descripcion": descripcion}
    return _resp(texto, ctx, accion=accion, avisos=avisos)


def _h_activar(slots, ctx, avisos, usuario=None):
    return _accion_simple(
        "activar_alertas", {}, "Activar alertas por correo",
        "Voy a activar tus alertas por correo (lluvia intensa, helada, calor y viento fuerte). ¿Confirmas?", ctx, avisos,
    )


def _h_desactivar(slots, ctx, avisos, usuario=None):
    return _accion_simple(
        "desactivar_alertas", {}, "Desactivar alertas por correo",
        "Voy a desactivar tus alertas por correo. ¿Confirmas?", ctx, avisos,
    )


def _h_prueba(slots, ctx, avisos, usuario=None):
    tipo = slots.get("tipo_alerta", "lluvia")
    a_todos = slots.get("a_suscriptores") is True
    if a_todos and not _es_admin(usuario):
        return _solo_admin(ctx, avisos)
    destino = "a todos los suscriptores" if a_todos else "a tu correo"
    return _accion_simple(
        "enviar_prueba_alerta",
        {"tipo": tipo, "a_suscriptores": "true" if a_todos else "false"},
        f"Enviar correo de prueba ({tipo}) {destino}",
        f"Voy a enviar {destino} una alerta de prueba simulada de tipo «{tipo}». ¿Confirmas?",
        ctx,
        avisos,
    )


def _h_resumen_datos(slots, ctx, avisos, usuario=None):
    resumen = _consultar_resumen()
    if resumen is None:
        return _resp(
            "Todavía no hay datos históricos en la base. Puedo importarlos de Open-Meteo.",
            ctx,
            botones=[_b("Importar el último año", "importa el último año")],
            avisos=avisos,
        )
    n, primero, ultimo = resumen
    rango = (date.fromisoformat(ultimo) - date.fromisoformat(primero)).days + 1
    tarjeta = {
        "tipo": "resumen",
        "dias_con_datos": n,
        "primer_dia": primero,
        "ultimo_dia": ultimo,
        "dias_rango": rango,
        "cobertura_pct": round(n / rango * 100, 1) if rango else 0,
    }
    return _resp(
        texto_resumen(n, primero, ultimo, rango),
        ctx,
        tarjetas=[tarjeta],
        botones=[_b("Importar el último año", "importa el último año"), _b("Proyectar temperatura", "proyecta la temperatura de los próximos 7 días")],
        avisos=avisos,
    )


def _h_ver_registros(slots, ctx, avisos, usuario=None):
    cantidad = slots.get("cantidad", 10)
    inicio = fin = None
    if slots.get("periodo"):
        ultima_periodo = ((ctx.get("ultima") or {}).get("slots") or {}).get("periodo")
        inicio, fin = resolver_periodo(slots["periodo"], date.today(), None, ultima_periodo)
    filas = _consultar_registros(cantidad, inicio, fin)
    if not filas:
        return _resp(
            "No encontré registros" + (" en ese período." if inicio else " en la base de datos."),
            ctx,
            botones=[_b("Importar datos", "importa los últimos 6 meses"), _b("Registrar un dato", "quiero registrar un dato")],
            avisos=avisos,
        )
    puede = _es_admin(usuario)
    return _resp(
        texto_registros(filas, puede),
        ctx,
        tarjetas=[{"tipo": "registros", "filas": filas, "puede_editar": puede}],
        botones=[_b("Registrar un dato", "quiero registrar un dato"), _b("¿Cuántos datos tengo?", "¿cuántos datos tengo?")],
        avisos=avisos,
    )


def _h_registrar(slots, ctx, avisos, usuario=None):
    periodo = slots.get("periodo") or {}
    fecha = periodo.get("inicio") if periodo.get("inicio") and periodo.get("inicio") == periodo.get("fin") else None
    return _resp(
        "Completa los datos y pulsa Guardar. Valido los rangos: humedad entre 0 y 100 %, viento sin valores negativos "
        "y no se aceptan fechas futuras.",
        ctx,
        tarjetas=[{"tipo": "form_registro", "valores": slots.get("valores", {}), "fecha": fecha}],
        avisos=avisos,
    )


def _h_nuevo_evento(slots, ctx, avisos, usuario=None):
    if not _es_admin(usuario):
        return _solo_admin(ctx, avisos)
    return _resp(
        "Completa los datos del evento (El Niño o La Niña) y pulsa Guardar. Deja el fin vacío si el evento sigue en curso.",
        ctx,
        tarjetas=[{"tipo": "form_evento"}],
        avisos=avisos,
    )


def _h_mis_reportes(slots, ctx, avisos, usuario=None):
    try:
        filas = _consultar_reportes()
    except Exception:
        return _resp("No pude consultar la lista de reportes en este momento.", ctx, avisos=avisos)
    return _resp(
        texto_reportes(filas),
        ctx,
        tarjetas=[{"tipo": "reportes", "filas": filas}] if filas else [],
        botones=[_b("Generar reporte nuevo", "genera un reporte")],
        avisos=avisos,
    )


def _h_historial_alertas(slots, ctx, avisos, usuario=None):
    if not _es_admin(usuario):
        return _solo_admin(ctx, avisos)
    try:
        filas = _consultar_historial_alertas()
    except Exception:
        return _resp("No pude consultar el historial de alertas en este momento.", ctx, avisos=avisos)
    return _resp(
        texto_historial_alertas(filas),
        ctx,
        tarjetas=[{"tipo": "historial_alertas", "filas": filas}] if filas else [],
        avisos=avisos,
    )


def _h_revisar_alertas(slots, ctx, avisos, usuario=None):
    if not _es_admin(usuario):
        return _solo_admin(ctx, avisos)
    simular = slots.get("simular") is True
    if simular:
        texto = (
            "Voy a simular la revisión: consulto el pronóstico y te digo cuántos correos se enviarían, "
            "sin enviar nada. ¿Confirmas?"
        )
    else:
        texto = (
            "Voy a consultar el pronóstico y enviar por correo las alertas nuevas a los usuarios que las activaron. "
            "No se repiten alertas ya enviadas. ¿Confirmas?"
        )
    return _accion_simple(
        "revisar_alertas",
        {"simular": "true" if simular else "false"},
        "Simular revisión de alertas" if simular else "Revisar y enviar alertas",
        texto,
        ctx,
        avisos,
    )


def _h_enviar_alerta_correo(slots, ctx, avisos, usuario=None):
    ok, dias, alertas = _alertas_probables()
    if not ok:
        return _resp("No pude consultar el pronóstico (¿sin conexión a internet?). Inténtalo de nuevo en un momento.", ctx, avisos=avisos)
    if not alertas:
        return _resp(
            "Ahora mismo no hay alertas probables en los próximos días, así que no hay nada que enviar. "
            "Si quieres ver cómo llega un correo, puedo enviarte uno de prueba.",
            ctx,
            botones=[_b("Enviarme un correo de prueba", "quiero un correo de prueba de lluvia")],
            avisos=avisos,
        )
    detalle = "; ".join(f"{a['titulo'].lower()} el {a['fecha'][8:10]}/{a['fecha'][5:7]}" for a in alertas[:5])
    return _accion_simple(
        "enviar_alerta_actual",
        {},
        "Enviarme las alertas actuales por correo",
        f"Voy a enviar a tu correo las alertas detectadas: {detalle}. ¿Confirmas?",
        ctx,
        avisos,
    )


def _primera_fecha() -> date | None:
    filas = supabase_admin.table("registros_diarios").select("fecha").order("fecha").limit(1).execute().data
    return date.fromisoformat(filas[0]["fecha"]) if filas else None


def _h_importar_estacion(slots, ctx, avisos, usuario=None):
    """Propone descargar las mediciones de la estación del aeropuerto para el mismo período del historial."""
    if not _es_admin(usuario):
        return _solo_admin(ctx, avisos)
    ultimo, primero = _ultima_fecha(), _primera_fecha()
    if ultimo is None or primero is None:
        return _resp("Primero necesito el historial de Open-Meteo para saber qué período comparar.", ctx, avisos=avisos)
    fin = min(ultimo, date.today() - timedelta(days=1))
    inicio = max(primero, fin - timedelta(days=366 * 6 - 1))
    return _accion_simple(
        "importar_estacion",
        {"fecha_inicio": inicio.isoformat(), "fecha_fin": fin.isoformat()},
        f"Importar mediciones de la estación del aeropuerto del {_fmt(inicio)} al {_fmt(fin)}",
        f"Voy a descargar los reportes horarios de la estación del {modulo_estacion.NOMBRE_ESTACION} del {_fmt(inicio)} "
        f"al {_fmt(fin)} (el mismo período de tu historial) y guardar un resumen por día. Puede tardar un minuto. ¿Confirmas?",
        ctx,
        avisos,
    )


def _h_estacion(slots, ctx, avisos, usuario=None):
    """Impacto de corregir Open-Meteo con la estación del aeropuerto."""
    variable = slots.get("variable", "temperatura")
    try:
        pares = modulo_estacion.pares_open_meteo_estacion(variable)
    except Exception:
        pares = None
    if pares is None or pares.empty:
        return _resp(
            "Todavía no hay mediciones de la estación del aeropuerto guardadas. Con ellas puedo medir cuánto se desvía "
            "el historial de Open-Meteo y corregirlo. (Si es la primera vez, ejecuta antes la migración 005 en Supabase.)",
            ctx,
            botones=[_b("Importar datos de la estación", "importa los datos de la estación del aeropuerto")],
            avisos=avisos,
        )
    try:
        r = modulo_estacion.evaluar_correccion(pares, variable)
    except ValueError as exc:
        return _resp(str(exc), ctx, botones=[_b("Importar datos de la estación", "importa los datos de la estación del aeropuerto")], avisos=avisos)
    r["verificacion"] = modulo_estacion.verificar_proyecciones(variable)
    mos = modulo_mos.obtener_mos(variable)
    r["mos"] = modulo_mos.informe_publico(mos) if mos else None
    u = UNIDADES[variable]
    base = next(o for o in r["opciones"] if o["metodo"] == "sin_correccion")
    mejor = r["opciones"][0]
    lineas = [
        f"Comparé {r['dias_pares']} días en los que hay dato de Open-Meteo y de la estación del aeropuerto.",
        f"Sin corregir, Open-Meteo se desvía en promedio {base['mae']:.1f} {u} de lo medido "
        f"(y en general marca {abs(base['sesgo']):.1f} {u} {'menos' if base['sesgo'] > 0 else 'más'}).",
    ]
    if mejor["metodo"] == "sin_correccion":
        lineas.append("Ninguna corrección mejoró en la prueba, así que las proyecciones siguen usando Open-Meteo tal cual.")
    else:
        lineas.append(
            f"Con «{mejor['nombre']}» el error baja a {mejor['mae']:.1f} {u} ({r['mejora_pct']:.0f} % menos), medido en "
            f"los últimos {r['dias_prueba']} días, que no se usaron para calcularla. Desde ahora las proyecciones la usan."
        )
    if r["mos"]:
        m = r["mos"]
        crudo = next(o for o in m["opciones"] if o["metodo"] == "openmeteo_crudo")
        mejor_m = m["opciones"][0]
        if mejor_m["metodo"] == "openmeteo_crudo":
            lineas.append(f"Modelo híbrido: el pronóstico de Open-Meteo sin corregir fue el más preciso ({crudo['mae']:.1f} {u}); se usa tal cual.")
        else:
            lineas.append(
                f"Modelo híbrido: el pronóstico de Open-Meteo se equivocó {crudo['mae']:.1f} {u} en promedio; corregido con "
                f"«{mejor_m['nombre']}» baja a {mejor_m['mae']:.1f} {u} ({m['mejora_pct']:.0f} % menos), en {m['fechas_prueba']} fechas no vistas."
            )
    if r["verificacion"]:
        v = r["verificacion"][0]
        nombre_v = METODOS[v["metodo"]][0] if v["metodo"] in METODOS else ("el modelo híbrido Open-Meteo + IA" if v["metodo"] == "hibrido_mos" else v["metodo"])
        lineas.append(f"De las proyecciones guardadas, la que menos se equivocó frente a lo medido fue {nombre_v}, con un error medio de {v['mae']:.1f} {u}.")
    tarjeta = {"tipo": "estacion", "unidad": u, "nombre_estacion": modulo_estacion.NOMBRE_ESTACION, **{k: r[k] for k in (
        "variable", "dias_pares", "desde", "hasta", "dias_prueba", "prueba_desde", "opciones", "elegido", "mejora_pct", "mensual", "verificacion", "mos")}}
    botones = [_b(f"Proyectar {variable.replace('_', ' ')}", f"proyecta {variable.replace('_', ' ')} de los próximos 7 días")]
    for otra, nombre in OTRAS_VARIABLES[variable]:
        botones.append(_b(f"Impacto en {nombre.lower()}", f"impacto de la estación en {nombre.lower()}"))
    botones.append(_b("Actualizar datos de la estación", "importa los datos de la estación del aeropuerto"))
    return _resp("\n".join(lineas), ctx, tarjetas=[tarjeta], botones=botones, avisos=avisos)


def _h_confirmar(slots, ctx, avisos, usuario=None):
    accion = ctx.get("accion")
    if not accion:
        return _resp("No tengo nada pendiente por confirmar. ¿Qué te gustaría hacer?", ctx, botones=BOTONES_AYUDA, avisos=avisos)
    ejecutar = dict(accion, estado="confirmada")
    respuesta = _resp("Perfecto, lo ejecuto ahora.", ctx, avisos=avisos)
    respuesta["accion"] = ejecutar  # el contexto ya no la conserva
    return respuesta


def _h_cancelar(slots, ctx, avisos, usuario=None):
    return _resp("Listo, cancelé la acción. ¿Algo más?", ctx, botones=BOTONES_AYUDA[:3], avisos=avisos)


def _h_desconocido(slots, ctx, avisos, usuario=None):
    return _resp(
        "No estoy seguro de haber entendido. Puedo proyectar variables climáticas, importar datos de Open-Meteo, "
        "generar reportes, hablarte de El Niño / La Niña y mostrar alertas. Prueba con una de estas opciones:",
        ctx,
        botones=BOTONES_AYUDA,
        avisos=avisos,
    )


HANDLERS = {
    "ayuda": _h_ayuda,
    "metodos": _h_metodos,
    "proyectar": _h_proyectar,
    "fenomenos": _h_fenomenos,
    "anomalias": _h_fenomenos,  # fenómenos y anomalías se responden juntos
    "enviar_alerta_correo": _h_enviar_alerta_correo,
    "alertas": _h_alertas,
    "importar": _h_importar,
    "reporte": _h_reporte,
    "activar_alertas": _h_activar,
    "desactivar_alertas": _h_desactivar,
    "prueba_alerta": _h_prueba,
    "resumen_datos": _h_resumen_datos,
    "ver_registros": _h_ver_registros,
    "registrar": _h_registrar,
    "nuevo_evento": _h_nuevo_evento,
    "mis_reportes": _h_mis_reportes,
    "historial_alertas": _h_historial_alertas,
    "estacion": _h_estacion,
    "importar_estacion": _h_importar_estacion,
    "revisar_alertas": _h_revisar_alertas,
    "confirmar": _h_confirmar,
    "cancelar": _h_cancelar,
    "desconocido": _h_desconocido,
}


def despachar(interp: dict, ctx: dict, usuario=None) -> dict:
    intencion = interp["intencion"]
    base: dict = {}
    if interp.get("seguimiento"):
        if ctx["intencion_pendiente"] == intencion:
            base = ctx["slots"]
        elif ctx["ultima"] and ctx["ultima"]["intencion"] == intencion:
            base = ctx["ultima"]["slots"]
    elif ctx["intencion_pendiente"] == intencion:
        base = ctx["slots"]
    if intencion == "reporte" and ctx["accion"] and ctx["accion"]["tipo"] == "generar_reporte":
        p = ctx["accion"]["params"]
        try:
            base = {
                "periodo": _periodo_explicito(date.fromisoformat(p["periodo_inicio"]), date.fromisoformat(p["periodo_fin"])),
                "formato": p.get("formato", "pdf") if p.get("formato") in FORMATOS_REPORTE else "pdf",
            }
        except (KeyError, ValueError):
            pass
    slots = fusionar_slots(base, interp["slots"])
    return HANDLERS[intencion](slots, ctx, interp.get("avisos") or [], usuario)


@router.post("/mensaje")
def mensaje(datos: MensajeRequest, usuario: UsuarioActual = Depends(get_current_user)):
    ctx = sanear_contexto(datos.contexto)
    interp = interpretar(datos.mensaje, ctx)
    interprete = "reglas"
    if interp["intencion"] == "desconocido":
        # Respaldo 1: clasificador local (Machine Learning liviano, sin internet)
        local, _ = clasificar(datos.mensaje)
        if local:
            interp = {"intencion": local, "slots": interp["slots"], "avisos": interp["avisos"], "seguimiento": False}
            interprete = "clasificador"
        else:
            # Respaldo 2 (opcional): modelo de lenguaje, solo si hay GEMINI_API_KEY
            por_llm = interpretar_con_llm(datos.mensaje, ctx)
            if por_llm:
                interp, interprete = por_llm, "llm"
    respuesta = despachar(interp, ctx, usuario)
    respuesta["interprete"] = interprete
    return respuesta
