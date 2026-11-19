"""
Redacción de las respuestas del asistente. Todo el texto sale de plantillas y de
los resultados reales (métricas, fechas, eventos): ningún modelo de lenguaje
inventa cifras ni justificaciones. Lógica pura.
"""

from __future__ import annotations

UNIDADES = {"temperatura": "°C", "humedad": "%", "velocidad_viento": "km/h"}
NOMBRE_VARIABLE = {
    "temperatura": "la temperatura",
    "humedad": "la humedad",
    "velocidad_viento": "la velocidad del viento",
}
ETIQUETA_FASE = {"el_nino": "El Niño", "la_nina": "La Niña", "neutro": "Neutro"}
ETIQUETA_INTENSIDAD = {"debil": "débil", "moderado": "moderado", "fuerte": "fuerte", "muy_fuerte": "muy fuerte"}

# Métodos que sí usan la fase ENSO como variable explicativa.
USA_ENSO = {"regresion_lineal", "random_forest", "gradient_boosting"}

DESCRIPCION_METODO = {
    "persistencia": "Repite el último valor observado. Sirve de referencia para saber si un método realmente aporta algo.",
    "promedio_movil": "Promedia los últimos 7 días y usa ese valor para todos los días siguientes. Es simple y estable, pero no capta tendencias.",
    "holt": "Suavizamiento exponencial con tendencia: da más peso a los datos recientes y prolonga la tendencia reciente.",
    "regresion_lineal": "Regresión lineal múltiple: ajusta una tendencia en el tiempo y un ciclo anual (estacionalidad) por mínimos cuadrados. Puede incluir la fase de El Niño / La Niña.",
    "random_forest": "Machine Learning (conjunto de árboles de decisión): aprende patrones de los últimos 7 días y de la época del año. Puede incluir la fase de El Niño / La Niña.",
    "gradient_boosting": "Machine Learning: construye árboles de decisión en secuencia, cada uno corrigiendo los errores del anterior. Puede incluir la fase de El Niño / La Niña.",
}

DESCARGO = "Es una estimación estadística basada en el comportamiento pasado, no un pronóstico meteorológico oficial."


def _f(x: float | None, dec: int = 1) -> str:
    return "—" if x is None else f"{x:.{dec}f}"


def _fecha(iso: str) -> str:
    a, m, d = iso.split("-")
    return f"{d}/{m}/{a}"


# ------------------------------------------------------------------ proyección
def texto_enso(usado: bool, varia: bool | None, evento_actual: str | None, metodo_elegido: str) -> str:
    if not usado:
        base = "No incluí fenómenos climáticos en esta proyección."
        if evento_actual:
            base += f" Hay un evento en curso ({evento_actual}); puedo repetirla incluyéndolo."
        return base

    if varia is False:
        return (
            "Incluí la fase de El Niño / La Niña como variable, pero en el histórico usado fue siempre la misma, "
            "así que no aportó información. Para que aporte, usa un histórico más largo con años con y sin evento."
        )
    partes = ["Incluí la fase de El Niño / La Niña (según los eventos registrados) como variable explicativa"]
    if evento_actual:
        partes.append(f"; evento en curso: {evento_actual}")
    partes.append(". ")
    if metodo_elegido in USA_ENSO:
        partes.append("El método elegido sí la usa. ")
    else:
        partes.append("El método elegido no la usa (solo la regresión, Random Forest y Gradient Boosting lo hacen). ")
    partes.append("Esto no prueba que el evento cause el cambio: es una variable más que el modelo puede aprovechar.")
    return "".join(partes)


def texto_proyeccion(
    variable: str,
    dias: int,
    resultado: dict,
    elegido: dict,
    mejor: dict | None,
    serie: dict,
    enso: dict,
    advertencias: list[str],
) -> str:
    u = UNIDADES[variable]
    valores = [p["valor"] for p in elegido["proyeccion"]]
    prom, vmin, vmax = sum(valores) / len(valores), min(valores), max(valores)
    primero, ultimo = elegido["proyeccion"][0]["fecha"], elegido["proyeccion"][-1]["fecha"]

    lineas = [
        f"Proyección de {NOMBRE_VARIABLE[variable]} del {_fecha(primero)} al {_fecha(ultimo)} ({dias} día(s)): "
        f"entre {_f(vmin)} y {_f(vmax)} {u}, con un promedio de {_f(prom)} {u}"
        + (f" (los últimos 7 días promediaron {_f(serie['reciente'])} {u})." if serie.get("reciente") is not None else "."),
        "",
        f"Método usado: {elegido['nombre']}.",
        DESCRIPCION_METODO[elegido["metodo"]],
        "",
    ]

    n = len(resultado["resultados"])
    dp = resultado["dias_prueba"]
    if mejor and elegido["metodo"] == mejor["metodo"]:
        lineas.append(
            f"Por qué lo elegí: reservé los últimos {dp} días del histórico como prueba, entrené {n} métodos con el resto "
            f"y este fue el que menos se equivocó: {_f(elegido['mae'], 2)} {u} de error absoluto medio (MAE) y "
            f"{_f(elegido['rmse'], 2)} {u} de RMSE."
        )
    elif mejor:
        lineas.append(
            f"Usé {elegido['nombre']} porque lo pediste (MAE {_f(elegido['mae'], 2)} {u}, RMSE {_f(elegido['rmse'], 2)} {u}). "
            f"En la prueba de los últimos {dp} días el de menor error fue {mejor['nombre']} "
            f"(MAE {_f(mejor['mae'], 2)} {u}, RMSE {_f(mejor['rmse'], 2)} {u})."
        )

    m = elegido.get("mejora_vs_referencia_pct")
    if m is not None:
        if m >= 1:
            lineas.append(f"Frente a la referencia simple (repetir el último valor) reduce el error en {m:.0f} %.")
        elif m > -1:
            lineas.append("Rinde prácticamente igual que la referencia simple de repetir el último valor.")
        else:
            lineas.append("No mejora a la referencia simple de repetir el último valor.")
    if not resultado["supera_referencia"]:
        lineas.append("Ningún método superó a esa referencia: con estos datos conviene tomar la proyección con mucha cautela.")

    lineas += [
        "",
        f"Datos: {serie['dias_serie']} días de histórico (del {_fecha(serie['inicio'])} al {_fecha(serie['fin'])}).",
        texto_enso(enso["usado"], enso["varia"], enso["evento_actual"], elegido["metodo"]),
    ]
    for o in resultado.get("omitidos", []):
        lineas.append(f"Nota: {o['nombre']} no se ejecutó: {o['motivo']}")
    for a in advertencias:
        lineas.append(f"Ojo: {a}")
    lineas += ["", DESCARGO]
    return "\n".join(lineas)


# ------------------------------------------------------------------ otros temas
def texto_metodos() -> str:
    lineas = ["Estos son los métodos que uso para proyectar y cómo funcionan:", ""]
    nombres = {
        "persistencia": "Referencia (último valor)",
        "promedio_movil": "Promedio móvil",
        "holt": "Método de Holt",
        "regresion_lineal": "Regresión lineal múltiple",
        "random_forest": "Random Forest (IA)",
        "gradient_boosting": "Gradient Boosting (IA)",
    }
    for clave, nombre in nombres.items():
        lineas.append(f"• {nombre}: {DESCRIPCION_METODO[clave]}")
    lineas += [
        "",
        "Siempre los comparo reservando los últimos días como prueba y elijo el de menor error (MAE y RMSE), "
        "salvo que me pidas uno en concreto.",
    ]
    return "\n".join(lineas)


def texto_ayuda() -> str:
    return (
        "Hola, soy el asistente de ClimaTech. Desde aquí puedes hacer todo, escribiendo o con los botones:\n"
        "• Proyectar temperatura, humedad o viento (con o sin El Niño / La Niña) y entender qué método usé y por qué.\n"
        "• Registrar un dato a mano, ver los últimos registros y, si eres administrador, editarlos o eliminarlos.\n"
        "• Importar datos históricos de Open-Meteo y saber cuántos datos tienes.\n"
        "• Generar reportes en PDF y volver a abrir los anteriores.\n"
        "• Ver el evento climático en curso (El Niño / La Niña) y las anomalías de los datos.\n"
        "• Ver el pronóstico, activar tus alertas por correo y enviarte un correo de prueba.\n"
        "Antes de importar datos, generar reportes o enviar correos siempre te pido confirmación."
    )


def texto_resumen(n: int, primero: str, ultimo: str, rango: int) -> str:
    cobertura = n / rango * 100 if rango else 0
    return "\n".join(
        [
            f"Tienes datos de {n} día(s) entre el {_fecha(primero)} y el {_fecha(ultimo)} (cobertura del {cobertura:.0f} % de ese rango).",
            "",
            f"• Proyecciones con los métodos clásicos: {'listo' if n >= 14 else 'necesitas al menos 14 días'}.",
            f"• Modelos de IA (Random Forest, Gradient Boosting): {'listo' if n >= 90 else 'conviene tener 90 días o más'}.",
            f"• Anomalías de El Niño / La Niña: {'listo' if n >= 730 else 'conviene tener 2 años o más'}.",
        ]
    )


def texto_registros(filas: list[dict], puede_editar: bool) -> str:
    cuantos = "el registro más reciente" if len(filas) == 1 else f"los {len(filas)} registros más recientes"
    base = f"Este es {cuantos}" if len(filas) == 1 else f"Estos son {cuantos}"
    base += " (los manuales y los de Open-Meteo aparecen juntos)."
    if puede_editar:
        return base + " Como administrador, puedes editar o eliminar cada uno con los íconos de la fila."
    return base + " Solo un administrador puede editar o eliminar registros."


def texto_reportes(filas: list[dict]) -> str:
    if not filas:
        return "Todavía no generaste ningún reporte. ¿Quieres generar uno?"
    if len(filas) == 1:
        return "Este es tu reporte más reciente. Pulsa el enlace para abrir el PDF."
    return f"Estos son tus {len(filas)} reportes más recientes. Pulsa el enlace para abrir el PDF."


def texto_historial_alertas(filas: list[dict]) -> str:
    if not filas:
        return "Todavía no se envió ninguna alerta."
    if len(filas) == 1:
        return "Esta es la única alerta enviada hasta ahora."
    return f"Estas son las últimas {len(filas)} alertas enviadas."


def texto_eventos(eventos: list[dict], actual: dict | None) -> str:
    lineas = []
    if actual:
        lineas.append(
            f"Evento en curso: {actual['nombre']} ({ETIQUETA_FASE[actual['fase']]}, intensidad "
            f"{ETIQUETA_INTENSIDAD.get(actual['intensidad'], actual['intensidad'])}), desde {_fecha(str(actual['inicio']))}."
        )
        lineas.append(
            "Un evento así hace más probables ciertos impactos, pero no los garantiza: en Bolivia sus efectos varían según la región y el evento."
        )
    else:
        lineas.append("No hay un evento de El Niño o La Niña en curso según los eventos registrados.")
    recientes = eventos[:5]
    if recientes:
        lineas += ["", "Eventos registrados más recientes:"]
        for e in recientes:
            fin = _fecha(str(e["fecha_fin"])) if e.get("fecha_fin") else "en curso"
            lineas.append(
                f"• {e['nombre']}: {ETIQUETA_FASE[e['fase']]}, {ETIQUETA_INTENSIDAD.get(e['intensidad'], e['intensidad'])} "
                f"({_fecha(str(e['fecha_inicio']))} – {fin})"
            )
    lineas += ["", "Si quieres, comparo cómo se comportó la temperatura, la humedad o el viento de Cochabamba durante esos eventos."]
    return "\n".join(lineas)


def texto_anomalias(variable: str, analisis: dict, evento_actual: str | None) -> str:
    u = UNIDADES[variable]
    meses = analisis["mensual"]
    if not meses:
        return "No hay meses completos con datos para calcular anomalías. " + " ".join(analisis["advertencias"])

    lineas = [f"Anomalías de {NOMBRE_VARIABLE[variable]} respecto al promedio de cada mes en los años disponibles ({analisis['anios_con_datos']} año(s))."]
    con_dato = [m for m in meses if m["anomalia"] is not None]
    if con_dato:
        ult = con_dato[-1]
        sentido = "por encima" if ult["anomalia"] > 0 else "por debajo"
        lineas.append(
            f"El último mes completo ({ult['mes']}) estuvo {_f(abs(ult['anomalia']), 2)} {u} {sentido} de lo habitual "
            f"(fase: {ETIQUETA_FASE.get(ult['fase'], ult['fase'])})."
        )
    if analisis["por_fase"]:
        lineas += ["", "Anomalía media según la fase de El Niño / La Niña:"]
        for f in analisis["por_fase"]:
            lineas.append(f"• {f['etiqueta']}: {_f(f['anomalia_media'], 2)} {u} en {f['meses']} mes(es).")
    if evento_actual:
        lineas.append(f"\nEvento en curso: {evento_actual}.")
    for a in analisis["advertencias"]:
        lineas.append(f"Ojo: {a}")
    return "\n".join(lineas)


def texto_pronostico(dias: list[dict], alertas: list[dict]) -> str:
    if not dias:
        return "No obtuve datos del pronóstico."
    lineas = ["Pronóstico de Open-Meteo para Cochabamba (modelo meteorológico externo, no de ClimaTech):"]
    for d in dias:
        lluvia = "—" if d["lluvia_mm"] is None else f"{d['lluvia_mm']:.1f} mm"
        prob = "" if d["prob_lluvia"] is None else f" ({d['prob_lluvia']:.0f} %)"
        lineas.append(f"• {_fecha(d['fecha'])}: lluvia {lluvia}{prob}, máx {_f(d['tmax'])} °C, mín {_f(d['tmin'])} °C, ráfagas {_f(d['rafaga'], 0)} km/h.")
    if alertas:
        lineas += ["", "Alertas detectadas:"]
        for a in alertas:
            etiqueta = "ALERTA" if a["nivel"] == "alto" else "Aviso"
            lineas.append(f"• [{etiqueta}] {_fecha(a['fecha'])}: {a['titulo']}. {a['mensaje']}")
    else:
        lineas += ["", "No hay alertas para estos días según los umbrales del sistema."]
    return "\n".join(lineas)
