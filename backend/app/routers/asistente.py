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
    texto_ayuda,
    texto_historial_alertas,
    texto_registros,
    texto_reportes,
    texto_resumen,
    texto_eventos,
    texto_metodos,
    texto_pronostico,
    texto_proyeccion,
)
from app.auth import UsuarioActual, get_current_user, supabase_admin
from app.datos import cargar_serie_diaria, listar_eventos
from app.ia_modelos import comparar_metodos, enso_varia, preparar_serie
from app.routers import alertas as modulo_alertas

router = APIRouter(prefix="/asistente", tags=["asistente"])

DIAS_PRUEBA = 7
DIAS_HISTORICO_DEFECTO = 730
MAX_DIAS_IMPORTACION = 366
MINIMO_RECOMENDADO_ML = 90

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
    _b("Proyectar temperatura", "proyecta la temperatura de los próximos 7 días"),
    _b("Proyección con El Niño", "proyecta la temperatura de los próximos 7 días tomando en cuenta El Niño"),
    _b("Registrar un dato", "quiero registrar un dato"),
    _b("Ver registros", "muéstrame los últimos registros"),
    _b("Importar datos", "importa datos de Open-Meteo"),
    _b("Generar reporte", "genera un reporte"),
    _b("¿Hay un evento en curso?", "¿hay algún evento climático en curso?"),
    _b("Pronóstico y alertas", "pronóstico de lluvia"),
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

    serie, info = preparar_serie(df, variable)
    if len(serie) < DIAS_PRUEBA + 5:
        return _resp(
            f"Solo hay {len(serie)} días continuos con datos en ese período y necesito al menos {DIAS_PRUEBA + 5} "
            "para poder evaluar los métodos. Prueba con un período más amplio o importa más datos.",
            ctx,
            botones=[_b("Importar datos", "importa los últimos 6 meses")],
            avisos=avisos,
        )

    eventos = listar_eventos()
    actual = evento_actual(eventos)
    usar_enso = slots.get("usar_enso") is True
    enso_fn = construir_funcion_enso(eventos) if usar_enso else None
    varia = enso_varia(list(serie["fecha"]), enso_fn) if usar_enso else None

    try:
        resultado = comparar_metodos(serie, DIAS_PRUEBA, dias, enso_fn)
    except ValueError as exc:
        return _resp(str(exc), ctx, avisos=avisos)
    if not resultado["resultados"]:
        return _resp("Ningún método pudo ejecutarse con los datos disponibles.", ctx, avisos=avisos)

    lista = resultado["resultados"]
    mejor = next((r for r in lista if r["metodo"] == resultado["mejor_metodo"]), None)
    pedido = slots.get("metodo")
    elegido = next((r for r in lista if r["metodo"] == pedido), None)

    advertencias: list[str] = []
    if pedido and elegido is None:
        motivo = next((o["motivo"] for o in resultado["omitidos"] if o["metodo"] == pedido), "no se pudo ejecutar")
        advertencias.append(f"No pude usar el método que pediste: {motivo}")
    elegido = elegido or mejor or lista[0]

    if info["dias_descartados"]:
        advertencias.append(
            f"Había un hueco grande de datos: usé solo el último tramo continuo ({info['dias_serie']} días)."
        )
    elif info["dias_faltantes"]:
        advertencias.append(f"Rellené {info['dias_faltantes']} día(s) sin dato por interpolación.")
    if len(serie) < MINIMO_RECOMENDADO_ML:
        advertencias.append(
            f"Solo hay {len(serie)} días de histórico; los modelos de IA rinden mejor con {MINIMO_RECOMENDADO_ML} o más."
        )

    inicio_serie = serie["fecha"].iloc[0].date().isoformat()
    fin_serie = serie["fecha"].iloc[-1].date().isoformat()
    datos_serie = {
        "dias_serie": len(serie),
        "inicio": inicio_serie,
        "fin": fin_serie,
        "reciente": float(serie["valor"].tail(7).mean()),
    }
    enso_info = {"usado": usar_enso, "varia": varia, "evento_actual": actual["nombre"] if actual else None}

    texto = texto_proyeccion(variable, dias, resultado, elegido, mejor, datos_serie, enso_info, advertencias)

    historico = serie.tail(30)
    tarjeta = {
        "tipo": "proyeccion",
        "variable": variable,
        "unidad": UNIDADES[variable],
        "metodo": elegido["nombre"],
        "historico": [
            {"fecha": f.date().isoformat(), "valor": round(float(v), 3)}
            for f, v in zip(historico["fecha"], historico["valor"])
        ],
        "proyeccion": elegido["proyeccion"],
        "prueba": elegido["prueba"],
        "metodos": [
            {
                "nombre": r["nombre"],
                "mae": r["mae"],
                "rmse": r["rmse"],
                "elegido": r["metodo"] == elegido["metodo"],
                "mejor": bool(mejor and r["metodo"] == mejor["metodo"]),
            }
            for r in lista
        ],
    }

    botones = []
    if not usar_enso:
        botones.append(_b("Repetir con El Niño", "repítelo tomando en cuenta El Niño"))
    botones.append(_b("Explicar los métodos", "explícame los métodos"))
    botones.append(_b("Generar reporte de este período", "genera un reporte de ese período"))
    for clave, nombre in OTRAS_VARIABLES[variable]:
        botones.append(_b(f"Proyectar {nombre.lower()}", f"ahora con {nombre.lower()}"))

    guardado = {"variable": variable, "dias": dias, "periodo": _periodo_explicito(inicio, fin), "usar_enso": usar_enso}
    if pedido:
        guardado["metodo"] = pedido
    return _resp(
        texto,
        ctx,
        tarjetas=[tarjeta],
        botones=botones,
        avisos=avisos,
        ultima={"intencion": "proyectar", "slots": guardado},
    )


def _h_fenomenos(slots, ctx, avisos, usuario=None):
    eventos = listar_eventos()
    actual = evento_actual(eventos)
    tarjeta = {
        "tipo": "eventos",
        "evento_actual": actual["nombre"] if actual else None,
        "eventos": [
            {k: e.get(k) for k in ("id", "nombre", "fase", "intensidad", "fecha_inicio", "fecha_fin")} for e in eventos[:6]
        ],
        "puede_editar": _es_admin(usuario),
    }
    return _resp(
        texto_eventos(eventos, actual),
        ctx,
        tarjetas=[tarjeta],
        botones=[
            _b("Anomalías de la temperatura", "¿qué anomalías tuvo la temperatura?"),
            _b("Proyección con El Niño", "proyecta la temperatura de los próximos 7 días tomando en cuenta El Niño"),
        ]
        + ([_b("Registrar un evento", "agrega un evento climático")] if _es_admin(usuario) else []),
        avisos=avisos,
    )


def _h_anomalias(slots, ctx, avisos, usuario=None):
    variable = slots.get("variable", "temperatura")
    hoy = date.today()
    ultima_periodo = ((ctx.get("ultima") or {}).get("slots") or {}).get("periodo")
    inicio, fin = resolver_periodo(slots.get("periodo"), hoy, None, ultima_periodo)
    try:
        df = cargar_serie_diaria(variable, inicio, fin)
    except HTTPException as exc:
        if exc.status_code == 404:
            return _resp("No encontré datos en ese período para calcular anomalías.", ctx, avisos=avisos)
        raise

    eventos = listar_eventos()
    actual = evento_actual(eventos)
    analisis = analizar_anomalias(df, variable, eventos)
    tarjeta = {
        "tipo": "anomalias",
        "variable": variable,
        "unidad": UNIDADES[variable],
        "por_fase": analisis["por_fase"],
        "mensual": analisis["mensual"][-24:],
    }
    return _resp(
        texto_anomalias(variable, analisis, actual["nombre"] if actual else None),
        ctx,
        tarjetas=[tarjeta],
        botones=[_b("Proyectar con El Niño", f"proyecta {variable.replace('_', ' ')} tomando en cuenta El Niño")],
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
    dias = [
        {
            "fecha": f,
            "lluvia_mm": valor_en(diario.get("precipitation_sum"), i),
            "prob_lluvia": valor_en(diario.get("precipitation_probability_max"), i),
            "tmax": valor_en(diario.get("temperature_2m_max"), i),
            "tmin": valor_en(diario.get("temperature_2m_min"), i),
            "rafaga": valor_en(diario.get("wind_gusts_10m_max"), i),
        }
        for i, f in enumerate(diario.get("time") or [])
    ]
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


def _h_reporte(slots, ctx, avisos, usuario=None):
    hoy = date.today()
    ultima_periodo = ((ctx.get("ultima") or {}).get("slots") or {}).get("periodo")
    inicio, fin = resolver_periodo(slots.get("periodo"), hoy, None, ultima_periodo)
    if inicio is None or fin is None:
        return _pedir_periodo("¿De qué período quieres el reporte en PDF?", slots, ctx, avisos, "reporte")
    fin = min(fin, hoy)
    if inicio > fin:
        return _pedir_periodo("Las fechas no son válidas. ¿De qué período quieres el reporte?", slots, ctx, avisos, "reporte")

    accion = {
        "tipo": "generar_reporte",
        "params": {"periodo_inicio": inicio.isoformat(), "periodo_fin": fin.isoformat()},
        "estado": "pendiente",
        "descripcion": f"Generar reporte PDF del {_fmt(inicio)} al {_fmt(fin)}",
    }
    texto = (
        f"Voy a generar un reporte en PDF con el resumen histórico y las proyecciones del {_fmt(inicio)} al {_fmt(fin)}. "
        "Si quieres que incluya tus proyecciones, usa el mismo rango con el que las generaste. ¿Confirmas?"
    )
    return _resp(texto, ctx, accion=accion, avisos=avisos)


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
    "anomalias": _h_anomalias,
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
