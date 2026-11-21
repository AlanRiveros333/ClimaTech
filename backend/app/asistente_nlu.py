"""
Interpretación de mensajes del asistente de ClimaTech.

Capa 1 (sin costo, sin internet): reglas y expresiones regulares que convierten
una frase en una INTENCIÓN y unos DATOS (variable, días, período, uso de El Niño,
método...). Es lógica pura: no toca la base de datos ni la red.

El contexto de la conversación viaja en el cliente y se valida aquí
(sanear_contexto) cada vez, así que un contexto manipulado no puede inyectar
valores fuera de los permitidos.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from datetime import date, timedelta
from typing import Any

VARIABLES = ("temperatura", "humedad", "velocidad_viento")
METODOS = (
    "persistencia",
    "promedio_movil",
    "holt",
    "regresion_lineal",
    "random_forest",
    "gradient_boosting",
)
TIPOS_ALERTA = ("lluvia", "helada", "calor", "viento")
UNIDADES_REL = ("dias", "semanas", "meses", "anios")
INTENCIONES = (
    "proyectar",
    "importar",
    "reporte",
    "anomalias",
    "fenomenos",
    "alertas",
    "activar_alertas",
    "desactivar_alertas",
    "prueba_alerta",
    "metodos",
    "ayuda",
    "registrar",
    "ver_registros",
    "mis_reportes",
    "resumen_datos",
    "nuevo_evento",
    "revisar_alertas",
    "historial_alertas",
    "enviar_alerta_correo",
    "estacion",
    "importar_estacion",
)
ACCIONES = (
    "enviar_alerta_actual",
    "revisar_alertas",
    "importar_open_meteo",
    "generar_reporte",
    "activar_alertas",
    "desactivar_alertas",
    "enviar_prueba_alerta",
    "importar_estacion",
)

MAX_DIAS_PROYECTAR = 30

# ------------------------------------------------------------------ utilidades
_PALABRAS_NUM = {
    "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6,
    "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12, "quince": 15,
    "veinte": 20, "treinta": 30,
}
_NUM = r"(\d{1,4}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta)"


def normalizar(texto: str) -> str:
    """Minúsculas, sin tildes ni ñ, espacios simples."""
    t = unicodedata.normalize("NFD", texto.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t).strip()


def _entero(s: str) -> int:
    return int(s) if s.isdigit() else _PALABRAS_NUM[s]


def _tiene(t: str, patron: str) -> bool:
    return re.search(patron, t) is not None


def _fecha_iso(valor: Any) -> str | None:
    if not isinstance(valor, str):
        return None
    try:
        return date.fromisoformat(valor).isoformat()
    except ValueError:
        return None


# ------------------------------------------------------------ extracción de datos
_RE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_RE_LAT = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_RE_REL = re.compile(rf"\bultim[oa]s?\s+(?:{_NUM}\s+)?(dias?|semanas?|mes(?:es)?|anos?)\b")
_RE_DIAS = re.compile(rf"\b(?:proxim[oa]s?\s+)?{_NUM}\s+(dias?|semanas?|mes(?:es)?)\b")
_RE_ANIO = re.compile(r"\b(20\d{2})\b")

_VARIABLES_RE = {
    "temperatura": r"\b(temperatura|temp|calor|frio|grados)\b",
    "humedad": r"\b(humedad|humedo|humeda)\b",
    "velocidad_viento": r"\b(viento|vientos)\b",
}
_NO_VARIABLES = {"evento", "eventos", "eventual"}  # se parecen a "viento" pero no lo son
_METODOS_RE = {
    "promedio_movil": r"promedio movil|media movil",
    "holt": r"\bholt\b",
    "regresion_lineal": r"regresion",
    "random_forest": r"random forest|bosque aleatorio|\brandom\b",
    "gradient_boosting": r"gradient|boosting",
    "persistencia": r"persistencia",
}
_TIPOS_ALERTA_RE = {
    "lluvia": r"lluvi|llover|llueve|torrencial|granizo",
    "helada": r"helada|congel",
    "viento": r"viento|rafaga",
    "calor": r"calor",
}


_NUMERO = r"(-?\d+(?:[.,]\d+)?)"
_RE_VALORES = {
    "temperatura": re.compile(rf"\btemperatura(?:\s+(?:de|es|fue|marca|a))?\s*{_NUMERO}"),
    "humedad": re.compile(rf"\bhumedad(?:\s+(?:de|es|fue|marca|a))?\s*{_NUMERO}"),
    "velocidad_viento": re.compile(rf"\bviento(?:\s+(?:de|es|fue|marca|a))?\s*{_NUMERO}"),
}
_RE_HORA = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
_RE_CANTIDAD = re.compile(r"\b(\d{1,2})\s+(?:registros|lecturas|mediciones)\b")


def _extraer_valores(t: str) -> dict:
    """Valores numéricos para pre-llenar el formulario de registro manual."""
    valores: dict[str, Any] = {}
    for clave, patron in _RE_VALORES.items():
        m = patron.search(t)
        if m:
            valores[clave] = float(m[1].replace(",", "."))
    m = _RE_HORA.search(t)
    if m:
        valores["hora"] = f"{int(m[1]):02d}:{m[2]}"
    return valores


def _extraer_fechas(t: str) -> tuple[list[date], str]:
    halladas: list[tuple[int, date]] = []
    for m in _RE_ISO.finditer(t):
        try:
            halladas.append((m.start(), date(int(m[1]), int(m[2]), int(m[3]))))
        except ValueError:
            pass
    for m in _RE_LAT.finditer(t):
        try:
            halladas.append((m.start(), date(int(m[3]), int(m[2]), int(m[1]))))
        except ValueError:
            pass
    halladas.sort()
    sin = _RE_LAT.sub(" ", _RE_ISO.sub(" ", t))
    return [d for _, d in halladas], sin


def _extraer_periodo(t: str, hoy: date) -> tuple[dict | None, str]:
    """Devuelve (periodo, texto sin las partes de período)."""
    periodo: dict[str, Any] = {"inicio": None, "fin": None, "rel": None, "anio": None, "ese_periodo": False}
    hay = False

    fechas, t = _extraer_fechas(t)
    if len(fechas) >= 2:
        periodo["inicio"], periodo["fin"] = min(fechas).isoformat(), max(fechas).isoformat()
        hay = True
    elif len(fechas) == 1:
        iso = fechas[0].isoformat()
        if _tiene(t, r"\bhasta\b|\bal\b") and not _tiene(t, r"\bdesde\b"):
            periodo["fin"] = iso
        elif _tiene(t, r"\bdesde\b"):
            periodo["inicio"] = iso
        else:
            periodo["inicio"] = periodo["fin"] = iso
        hay = True

    m = _RE_REL.search(t)
    if m:
        n = _entero(m[1]) if m[1] else 1
        u = m[2]
        unidad = "dias" if u.startswith("dia") else "semanas" if u.startswith("semana") else "meses" if u.startswith("mes") else "anios"
        periodo["rel"] = {"n": n, "unidad": unidad}
        t = _RE_REL.sub(" ", t)
        hay = True

    if _tiene(t, r"\beste ano\b"):
        periodo["anio"], hay = hoy.year, True
        t = re.sub(r"\beste ano\b", " ", t)
    elif _tiene(t, r"\bano pasado\b"):
        periodo["anio"], hay = hoy.year - 1, True
        t = re.sub(r"\bano pasado\b", " ", t)
    else:
        m = _RE_ANIO.search(t)
        if m:
            periodo["anio"], hay = int(m[1]), True
            t = _RE_ANIO.sub(" ", t, count=1)

    if _tiene(t, r"\b(ese|mismo|dicho) (periodo|rango)\b|\besas fechas\b"):
        periodo["ese_periodo"], hay = True, True

    return (periodo if hay else None), t


def _extraer_dias(t: str) -> tuple[int | None, list[str]]:
    avisos: list[str] = []
    dias: int | None = None
    m = _RE_DIAS.search(t)
    if m:
        n, unidad = _entero(m[1]), m[2]
        dias = n * (7 if unidad.startswith("semana") else 30 if unidad.startswith("mes") else 1)
    elif _tiene(t, r"proxima semana|semana que viene|otra semana"):
        dias = 7
    elif _tiene(t, r"proximo mes|mes que viene"):
        dias = 30
    elif _tiene(t, r"\bmanana\b"):
        dias = 1
    if dias is not None:
        if dias > MAX_DIAS_PROYECTAR:
            avisos.append(f"El máximo es {MAX_DIAS_PROYECTAR} días de proyección; ajusté el pedido a {MAX_DIAS_PROYECTAR}.")
            dias = MAX_DIAS_PROYECTAR
        elif dias < 1:
            dias = None
    return dias, avisos


def extraer_slots(t: str, hoy: date) -> tuple[dict, list[str]]:
    """t ya normalizado. Devuelve (slots, avisos)."""
    slots: dict[str, Any] = {}
    periodo, resto = _extraer_periodo(t, hoy)
    if periodo:
        slots["periodo"] = periodo

    dias, avisos = _extraer_dias(resto)
    if dias is not None:
        slots["dias"] = dias

    for variable, patron in _VARIABLES_RE.items():
        if _tiene(t, patron):
            slots["variable"] = variable
            break
    else:
        # Tolerancia a faltas de ortografía: "tempertura", "humedd", "bientos"...
        palabras = {"temperatura": "temperatura", "humedad": "humedad", "viento": "velocidad_viento"}
        for token in re.findall(r"[a-z]{5,}", t):
            if token in _NO_VARIABLES:
                continue
            cerca = difflib.get_close_matches(token, palabras.keys(), n=1, cutoff=0.8)
            if cerca:
                slots["variable"] = palabras[cerca[0]]
                break

    if _tiene(t, r"\bsin (tomar en cuenta |considerar |incluir |usar )?(el |la |los |las )?(nino|nina|fenomenos?|enso)\b"):
        slots["usar_enso"] = False
    elif _tiene(t, r"\b(nino|nina|enso|supernino|fenomenos?|eventos? climaticos?)\b"):
        slots["usar_enso"] = True

    # «sin corrección» / «sin la estación»: proyectar con Open-Meteo tal cual, para comparar
    if _tiene(t, r"\bsin (la |usar |aplicar )?(correccion|corregir|estacion|ajuste)\b"):
        slots["corregir"] = False

    for metodo, patron in _METODOS_RE.items():
        if _tiene(t, patron):
            slots["metodo"] = metodo
            break

    for tipo, patron in _TIPOS_ALERTA_RE.items():
        if _tiene(t, patron):
            slots["tipo_alerta"] = tipo
            break

    for formato, patron in (("word", r"\b(word|docx)\b"), ("excel", r"\b(excel|xlsx|hoja de calculo)\b"), ("pdf", r"\bpdf\b")):
        if _tiene(t, patron):
            slots["formato"] = formato
            break

    valores = _extraer_valores(t)
    if valores:
        slots["valores"] = valores

    m = _RE_CANTIDAD.search(t)
    if m and 1 <= int(m[1]) <= 30:
        slots["cantidad"] = int(m[1])
    if _tiene(t, r"\bsimul\w*"):
        slots["simular"] = True
    if _tiene(t, r"\b(todos|suscriptores|usuarios)\b"):
        slots["a_suscriptores"] = True

    return slots, avisos


# -------------------------------------------------------------------- saneamiento
def sanear_periodo(p: Any) -> dict | None:
    if not isinstance(p, dict):
        return None
    out: dict[str, Any] = {"inicio": _fecha_iso(p.get("inicio")), "fin": _fecha_iso(p.get("fin")),
                           "rel": None, "anio": None, "ese_periodo": bool(p.get("ese_periodo"))}
    rel = p.get("rel")
    if isinstance(rel, dict) and rel.get("unidad") in UNIDADES_REL and isinstance(rel.get("n"), int) and 1 <= rel["n"] <= 3650:
        out["rel"] = {"n": rel["n"], "unidad": rel["unidad"]}
    if isinstance(p.get("anio"), int) and 2000 <= p["anio"] <= 2100:
        out["anio"] = p["anio"]
    if not (out["inicio"] or out["fin"] or out["rel"] or out["anio"] or out["ese_periodo"]):
        return None
    return out


_LIMITES_VALORES = {"temperatura": (-60.0, 60.0), "humedad": (0.0, 100.0), "velocidad_viento": (0.0, 400.0)}


def _sanear_valores(v: Any) -> dict:
    out: dict[str, Any] = {}
    if not isinstance(v, dict):
        return out
    for clave, (lo, hi) in _LIMITES_VALORES.items():
        x = v.get(clave)
        if isinstance(x, (int, float)) and not isinstance(x, bool) and lo <= float(x) <= hi:
            out[clave] = round(float(x), 2)
    h = v.get("hora")
    if isinstance(h, str) and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", h):
        out["hora"] = h
    return out


def sanear_slots(s: Any) -> dict:
    out: dict[str, Any] = {}
    if not isinstance(s, dict):
        return out
    if s.get("variable") in VARIABLES:
        out["variable"] = s["variable"]
    if isinstance(s.get("dias"), int) and not isinstance(s.get("dias"), bool) and 1 <= s["dias"] <= MAX_DIAS_PROYECTAR:
        out["dias"] = s["dias"]
    if isinstance(s.get("usar_enso"), bool):
        out["usar_enso"] = s["usar_enso"]
    if s.get("metodo") in METODOS:
        out["metodo"] = s["metodo"]
    if s.get("tipo_alerta") in TIPOS_ALERTA:
        out["tipo_alerta"] = s["tipo_alerta"]
    periodo = sanear_periodo(s.get("periodo"))
    if periodo:
        out["periodo"] = periodo
    if isinstance(s.get("cantidad"), int) and not isinstance(s.get("cantidad"), bool) and 1 <= s["cantidad"] <= 30:
        out["cantidad"] = s["cantidad"]
    if s.get("formato") in ("pdf", "word", "excel"):
        out["formato"] = s["formato"]
    for clave in ("simular", "a_suscriptores", "corregir"):
        if isinstance(s.get(clave), bool):
            out[clave] = s[clave]
    valores = _sanear_valores(s.get("valores"))
    if valores:
        out["valores"] = valores
    return out


def sanear_contexto(ctx: Any) -> dict:
    base: dict[str, Any] = {"intencion_pendiente": None, "slots": {}, "accion": None, "ultima": None}
    if not isinstance(ctx, dict):
        return base
    if ctx.get("intencion_pendiente") in INTENCIONES:
        base["intencion_pendiente"] = ctx["intencion_pendiente"]
    base["slots"] = sanear_slots(ctx.get("slots"))
    acc = ctx.get("accion")
    if isinstance(acc, dict) and acc.get("tipo") in ACCIONES and isinstance(acc.get("params"), dict):
        base["accion"] = {
            "tipo": acc["tipo"],
            "params": {str(k)[:40]: str(v)[:60] for k, v in acc["params"].items()},
            "estado": "pendiente",
            "descripcion": str(acc.get("descripcion", ""))[:300],
        }
    ult = ctx.get("ultima")
    if isinstance(ult, dict) and ult.get("intencion") in ("proyectar", "anomalias"):
        base["ultima"] = {"intencion": ult["intencion"], "slots": sanear_slots(ult.get("slots"))}
    return base


def fusionar_slots(base: dict, nuevos: dict) -> dict:
    """Los datos nuevos reemplazan a los anteriores; lo que no se menciona se conserva."""
    out = dict(base)
    for k, v in nuevos.items():
        if v is not None:
            out[k] = v
    return out


def resolver_periodo(
    periodo: dict | None,
    referencia: date,
    por_defecto_dias: int | None = None,
    ultima: dict | None = None,
) -> tuple[date | None, date | None]:
    """
    Convierte el período interpretado en fechas concretas.
    referencia: fecha 'de hoy' para períodos relativos (para proyectar, el último día con datos).
    ultima: período explícito de la proyección anterior, para "ese período".
    """
    if not periodo:
        if por_defecto_dias:
            return referencia - timedelta(days=por_defecto_dias), referencia
        return None, None

    if periodo.get("ese_periodo"):
        if ultima and ultima.get("inicio") and ultima.get("fin"):
            return date.fromisoformat(ultima["inicio"]), date.fromisoformat(ultima["fin"])
        return None, None

    inicio = date.fromisoformat(periodo["inicio"]) if periodo.get("inicio") else None
    fin = date.fromisoformat(periodo["fin"]) if periodo.get("fin") else None
    if inicio or fin:
        if inicio and not fin:
            fin = referencia
        if fin and not inicio:
            inicio = fin - timedelta(days=por_defecto_dias or 365)
        return inicio, fin

    rel = periodo.get("rel")
    if rel:
        factor = {"dias": 1, "semanas": 7, "meses": 30, "anios": 365}[rel["unidad"]]
        return referencia - timedelta(days=rel["n"] * factor), referencia

    anio = periodo.get("anio")
    if anio:
        return date(anio, 1, 1), min(date(anio, 12, 31), referencia)

    return None, None


# ------------------------------------------------------------- intención principal
_SI = {"si", "sii", "siii", "confirmo", "confirmar", "confirma", "dale", "ok", "okay", "okey", "adelante",
       "ejecuta", "ejecutalo", "hazlo", "correcto", "claro", "acepto", "listo", "vale", "yes", "procede"}
_NO = {"no", "cancela", "cancelar", "cancelalo", "detente", "olvidalo", "nop"}


def _tokens(t: str) -> list[str]:
    return re.findall(r"[a-z]+", t)


def _es_si(t: str) -> bool:
    tk = _tokens(t)
    return 0 < len(tk) <= 5 and any(x in _SI for x in tk) and not any(x in _NO for x in tk)


def _es_no(t: str) -> bool:
    tk = _tokens(t)
    return 0 < len(tk) <= 5 and any(x in _NO for x in tk)


P_REPORTE = r"\b(reporte|reportes|informe|informes|pdf)\b"
P_MIS_REPORTES = (
    r"\bmis (reportes|informes)\b|\b(reportes|informes) (anteriores|generados)\b|\bhistorial de (reportes|informes)\b|"
    r"\blista de (reportes|informes)\b|\bver (los |mis )?(reportes|informes)\b|\b(que|cuales) (reportes|informes)\b"
)
P_IMPORTAR = r"\b(importa\w*|descarg\w*|trae|traer|trae\w*|actualiza\w*)\b"
P_DATOS = r"\b(dato|datos|open|meteo|openmeteo|historico|registros?|clima)\b"
P_ALERTA = r"\balertas?\b"
P_ACTIVAR = r"\b(activa\w*|suscrib\w*|quiero recibir|recibir)\b"
P_DESACTIVAR = r"\b(desactiva\w*|desuscrib\w*|dejar de recibir|no quiero recibir)\b"
P_PRUEBA = r"\bprueba\b"
P_CORREO = r"\b(alerta|alertas|correo|mail|gmail|email)\b"
P_REVISAR_ALERTAS = (
    r"\b(envia\w*|manda\w*|dispara\w*|simula\w*)\b.*\b(alertas?|avisos)\b|\b(envia\w*|manda\w*)\b.*\bsuscriptores\b|"
    r"\brevis\w+ y envi\w+\b|\bsimula\w* (la )?revision\b"
)
P_ENVIAR_MI_ALERTA = (
    r"\b(envia\w*|manda\w*)\b.*\b(alertas?|avisos?)\b.*\b(a mi|mi)\s+(correo|mail|gmail|email)\b|"
    r"\b(enviame|mandame)\b.*\b(alertas?|avisos?)\b|\b(alertas?|avisos?)\b.*\b(a mi|mi) (correo|mail|gmail|email)\b"
)
P_HISTORIAL_ALERTAS = r"\bhistorial\b.*\balertas?\b|\balertas?\b.*\b(enviadas|mandadas)\b|\bquien\b.*\balertas?\b"
P_NUEVO_EVENTO = r"\b(registra\w*|agrega\w*|anade|crea\w*|nuevo|nueva|dar de alta)\b.*\b(evento|fenomeno)\b"
P_REGISTRAR = r"\b(registra\w*|ingresa\w*|anota\w*|guarda\w*|agrega\w*|anade|cargar un dato)\b"
P_DATO_MANUAL = r"\b(dato|datos|lectura|medicion|registro|temperatura|humedad|viento)\b"
P_RESUMEN = (
    r"\bcuantos? (datos|registros|dias|lecturas)\b|\bhasta que fecha\b|\bdesde cuando\b|\bcobertura\b|"
    r"\bresumen de (mis )?datos\b|\bsuficientes datos\b|\bque (rango|datos tengo)\b|\bestado de (la base|los datos)\b"
)
P_VER_REGISTROS = (
    r"\b(muestra\w*|mostrar|ver|lista\w*|dame|ensena\w*|revisa\w*|cuales)\b.*\b(registros|lecturas|mediciones)\b|"
    r"\bultim[oa]s? \d* ?(registros|lecturas|mediciones)\b|\bregistros (recientes|guardados)\b|"
    r"\b(editar|eliminar|borrar|corregir)\b.*\bregistros?\b"
)
P_PROYECTAR = (
    r"\b(proyec\w*|predic\w*|pronostica\w*|estim\w*|futuro|tendencia)\b"
    r"|como (estara|sera|va a estar)"
    r"|\bproxim[oa]s?\s+(\d|un |una |dos |tres |cuatro |cinco |seis |siete |ocho |nueve |diez )"
)
P_METODOS = r"\b(metodos?|modelos?)\b"
P_EXPLICAR = r"\b(explica\w*|describe\w*|que son|cuales|que metodos|que modelos|como funcion\w*)\b"
P_ANOMALIAS = r"\banomal\w*"
P_ALERTA_PALABRAS = r"\b(alertas?|avis\w+|llover|llueve|lluvia|lluvias|helada|heladas|granizo|torrencial|pronostico)\b"
P_ENSO = r"\b(nino|nina|enso|supernino|fenomenos?|eventos? climaticos?)\b|\bevento en curso\b"
P_SEGUIMIENTO_ENSO = r"\b(incluy\w*|con|tomando|toma|considera\w*|repite|repetir|otra vez|de nuevo|ahora)\b"
P_ESTACION = (
    r"\b(estacion|aeropuerto|slcb|metar|sesgo)\b|\bcorreccion\b|\bdatos? (reales|medidos)\b|\blo medido\b|"
    r"\bque tan (acertad\w*|precis\w*|exact\w*)\b|\b(verifica\w*|acierto|aciertan|acerto|acertaron)\b"
)
P_VERIFICAR = r"\bque tan (acertad\w*|precis\w*|exact\w*)\b|\b(verifica\w*|acierto|aciertan|acerto|acertaron)\b"
P_AYUDA = (
    r"\b(hola|buenas|ayuda|ayudame|opciones|menu|empezar|inicio)\b|buen dia|buenos dias|buenas tardes|"
    r"buenas noches|que puedes|que sabes|que haces"
)

_SLOTS_DATOS = ("variable", "dias", "periodo", "usar_enso", "metodo", "tipo_alerta", "valores", "cantidad", "formato", "corregir")


def interpretar(texto: str, ctx: Any = None, hoy: date | None = None) -> dict:
    """
    Devuelve {"intencion": str, "slots": dict, "avisos": [str], "seguimiento": bool}.
    Intenciones: las de INTENCIONES más confirmar, cancelar y desconocido.
    """
    ctx = sanear_contexto(ctx)
    hoy = hoy or date.today()
    t = normalizar(texto)
    slots, avisos = extraer_slots(t, hoy)

    def r(intencion: str, seguimiento: bool = False) -> dict:
        return {"intencion": intencion, "slots": slots, "avisos": avisos, "seguimiento": seguimiento}

    tk = _tokens(t)
    if ctx["accion"]:
        if _es_si(t):
            return r("confirmar")
        if _es_no(t):
            return r("cancelar")
    elif len(tk) <= 2 and _es_si(t):
        return r("confirmar")
    elif tk == ["no"]:
        return r("cancelar")

    # «en Excel» / «en Word» como respuesta a un reporte que espera confirmación
    acc = ctx["accion"]
    if acc and acc["tipo"] == "generar_reporte" and "formato" in slots and not _tiene(t, P_REPORTE):
        return r("reporte", seguimiento=True)
    if _tiene(t, P_REPORTE):
        return r("mis_reportes" if _tiene(t, P_MIS_REPORTES) else "reporte")
    if slots.get("corregir") is False and (ctx["ultima"] or {}).get("intencion") == "proyectar" and not _tiene(t, P_PROYECTAR):
        return r("proyectar", seguimiento=True)  # «ahora sin corrección»
    if _tiene(t, P_ESTACION) and (not _tiene(t, P_PROYECTAR) or _tiene(t, P_VERIFICAR)):
        if _tiene(t, P_IMPORTAR) and _tiene(t, r"\b(estacion|aeropuerto|slcb|metar)\b"):
            return r("importar_estacion")
        return r("estacion")
    if _tiene(t, P_IMPORTAR) and (_tiene(t, r"\bimporta\w*") or _tiene(t, P_DATOS)):
        return r("importar")
    if _tiene(t, P_ALERTA) or _tiene(t, r"\bcorreos?\b"):
        if _tiene(t, P_DESACTIVAR):
            return r("desactivar_alertas")
        if _tiene(t, P_ACTIVAR):
            return r("activar_alertas")
    if _tiene(t, P_PRUEBA) and _tiene(t, P_CORREO):
        return r("prueba_alerta")
    if _tiene(t, P_ENVIAR_MI_ALERTA) and not _tiene(t, r"\b(todos|suscriptores|usuarios)\b"):
        return r("enviar_alerta_correo")
    if _tiene(t, P_HISTORIAL_ALERTAS):
        return r("historial_alertas")
    if _tiene(t, P_REVISAR_ALERTAS):
        return r("revisar_alertas")
    if _tiene(t, P_NUEVO_EVENTO):
        return r("nuevo_evento")
    if _tiene(t, P_REGISTRAR) and _tiene(t, P_DATO_MANUAL):
        return r("registrar")
    if _tiene(t, P_PROYECTAR):
        if _tiene(t, r"\b(lluvia|lluvias|llover|precipitacion)\b") and "variable" not in slots:
            avisos.append("Todavía no manejo la lluvia como variable de proyección (solo temperatura, humedad y viento).")
        return r("proyectar")
    if _tiene(t, P_METODOS) and _tiene(t, P_EXPLICAR):
        return r("metodos")
    if _tiene(t, P_RESUMEN):
        return r("resumen_datos")
    if _tiene(t, P_VER_REGISTROS):
        return r("ver_registros")
    if _tiene(t, P_ANOMALIAS):
        return r("anomalias")
    if _tiene(t, P_ALERTA_PALABRAS):
        return r("alertas")
    if _tiene(t, P_ENSO):
        if (ctx["ultima"] or {}).get("intencion") == "proyectar" and _tiene(t, P_SEGUIMIENTO_ENSO):
            return r("proyectar", seguimiento=True)
        return r("fenomenos")
    if "variable" in slots and "dias" in slots:
        return r("proyectar")

    datos = {k for k in slots if k in _SLOTS_DATOS}
    if datos:
        if ctx["intencion_pendiente"]:
            return r(ctx["intencion_pendiente"], seguimiento=True)
        if ctx["ultima"]:
            return r(ctx["ultima"]["intencion"], seguimiento=True)

    if _tiene(t, P_AYUDA):
        return r("ayuda")
    return r("desconocido")


def validar_interpretacion(datos: Any) -> dict | None:
    """Valida lo que devuelve un modelo de lenguaje: solo se aceptan valores de las listas blancas."""
    if not isinstance(datos, dict):
        return None
    intencion = datos.get("intencion")
    if intencion not in INTENCIONES:
        return None
    return {"intencion": intencion, "slots": sanear_slots(datos.get("slots")), "avisos": [], "seguimiento": False}
