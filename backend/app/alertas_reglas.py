"""
Reglas de alerta sobre el pronóstico diario de Open-Meteo y redacción del correo.

Los umbrales son orientativos y definidos por el proyecto; se pueden ajustar
en UMBRALES con criterio de SENAMHI u otra fuente oficial. Las alertas se basan
en el PRONÓSTICO de Open-Meteo (un modelo meteorológico), no en los métodos
estadísticos de ClimaTech, que no pueden anticipar tormentas.
"""

from __future__ import annotations

PARAMETROS_DIARIOS = (
    "precipitation_sum",
    "precipitation_probability_max",
    "temperature_2m_max",
    "temperature_2m_min",
    "wind_gusts_10m_max",
)

UMBRALES = {
    "lluvia": {"alto_mm": 30.0, "medio_mm": 15.0, "prob_min": 60.0},
    "helada": {"alto_c": 0.0, "medio_c": 2.0},
    "calor": {"alto_c": 35.0, "medio_c": 32.0},
    "viento": {"alto_kmh": 70.0, "medio_kmh": 50.0},
}

TITULOS = {
    "lluvia": "Lluvia intensa",
    "helada": "Helada",
    "calor": "Calor extremo",
    "viento": "Ráfagas de viento fuertes",
}

AVISO = (
    "Este aviso se basa en el pronóstico de Open-Meteo, no en un pronóstico oficial. "
    "Para decisiones importantes consulta al SENAMHI."
)


def valor_en(lista, i):
    if not lista or i >= len(lista):
        return None
    return lista[i]


def evaluar_pronostico(diario: dict) -> list[dict]:
    """diario = bloque 'daily' de la respuesta de Open-Meteo. Devuelve lista de alertas."""
    fechas = diario.get("time") or []
    alertas: list[dict] = []

    for i, fecha in enumerate(fechas):
        mm = valor_en(diario.get("precipitation_sum"), i)
        prob = valor_en(diario.get("precipitation_probability_max"), i)
        tmax = valor_en(diario.get("temperature_2m_max"), i)
        tmin = valor_en(diario.get("temperature_2m_min"), i)
        rafaga = valor_en(diario.get("wind_gusts_10m_max"), i)

        u = UMBRALES["lluvia"]
        if mm is not None and (prob is None or prob >= u["prob_min"]):
            if mm >= u["alto_mm"]:
                alertas.append(_alerta("lluvia", "alto", fecha, mm, f"Se esperan {mm:.0f} mm de lluvia (posible lluvia torrencial)."))
            elif mm >= u["medio_mm"]:
                alertas.append(_alerta("lluvia", "medio", fecha, mm, f"Se esperan {mm:.0f} mm de lluvia."))

        u = UMBRALES["helada"]
        if tmin is not None:
            if tmin <= u["alto_c"]:
                alertas.append(_alerta("helada", "alto", fecha, tmin, f"Temperatura mínima de {tmin:.1f} °C (helada)."))
            elif tmin <= u["medio_c"]:
                alertas.append(_alerta("helada", "medio", fecha, tmin, f"Temperatura mínima de {tmin:.1f} °C (riesgo de helada)."))

        u = UMBRALES["calor"]
        if tmax is not None:
            if tmax >= u["alto_c"]:
                alertas.append(_alerta("calor", "alto", fecha, tmax, f"Temperatura máxima de {tmax:.1f} °C."))
            elif tmax >= u["medio_c"]:
                alertas.append(_alerta("calor", "medio", fecha, tmax, f"Temperatura máxima de {tmax:.1f} °C."))

        u = UMBRALES["viento"]
        if rafaga is not None:
            if rafaga >= u["alto_kmh"]:
                alertas.append(_alerta("viento", "alto", fecha, rafaga, f"Ráfagas de hasta {rafaga:.0f} km/h."))
            elif rafaga >= u["medio_kmh"]:
                alertas.append(_alerta("viento", "medio", fecha, rafaga, f"Ráfagas de hasta {rafaga:.0f} km/h."))

    return alertas


def _alerta(tipo: str, nivel: str, fecha: str, valor: float, mensaje: str) -> dict:
    return {
        "tipo": tipo,
        "titulo": TITULOS[tipo],
        "nivel": nivel,
        "fecha": fecha,
        "valor": round(float(valor), 1),
        "mensaje": mensaje,
    }


def componer_correo(nombre: str, alertas: list[dict]) -> tuple[str, str]:
    """Devuelve (asunto, cuerpo en texto plano)."""
    hay_alto = any(a["nivel"] == "alto" for a in alertas)
    asunto = (
        "ClimaTech: alerta climática para Cochabamba"
        if hay_alto
        else "ClimaTech: aviso climático para Cochabamba"
    )
    lineas = [f"Hola {nombre},", "", "ClimaTech detectó las siguientes condiciones previstas en Cochabamba:", ""]
    for a in sorted(alertas, key=lambda x: (x["fecha"], x["tipo"])):
        etiqueta = "ALERTA" if a["nivel"] == "alto" else "Aviso"
        lineas.append(f"- [{etiqueta}] {a['fecha']}: {a['titulo']}. {a['mensaje']}")
    lineas += [
        "",
        AVISO,
        "",
        "Recibes este correo porque activaste las alertas en tu cuenta de ClimaTech. "
        "Puedes desactivarlas desde la sección Alertas.",
    ]
    return asunto, "\n".join(lineas)
