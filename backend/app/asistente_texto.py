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
    "hibrido_mos": "Modelo híbrido (técnica MOS): toma el pronóstico de Open-Meteo, que simula la atmósfera y anticipa olas de calor o frentes fríos, y lo corrige con un modelo matemático que aprendió cómo se equivoca Open-Meteo en Cochabamba, comparando sus pronósticos pasados con lo medido en la estación del aeropuerto.",
}

DESCARGO = "Es una estimación estadística basada en el comportamiento pasado, no un pronóstico meteorológico oficial."


def _f(x: float | None, dec: int = 1) -> str:
    return "—" if x is None else f"{x:.{dec}f}"


def _fecha(iso: str) -> str:
    a, m, d = iso.split("-")
    return f"{d}/{m}/{a}"


# ------------------------------------------------------------------ proyección
DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def nombre_dia(iso: str) -> str:
    from datetime import date

    return DIAS_SEMANA[date.fromisoformat(iso).weekday()]


def nombre_mes(numero: int) -> str:
    return MESES[numero - 1]


def descriptor(variable: str, valor: float) -> str:
    """Palabra sencilla para el valor (umbrales orientativos para el clima de Cochabamba)."""
    if variable == "temperatura":
        for limite, nombre in ((10, "Frío"), (14, "Fresco"), (19, "Templado"), (24, "Cálido")):
            if valor < limite:
                return nombre
        return "Caluroso"
    if variable == "humedad":
        for limite, nombre in ((30, "Muy seca"), (50, "Seca"), (70, "Confortable"), (85, "Húmeda")):
            if valor < limite:
                return nombre
        return "Muy húmeda"
    for limite, nombre in ((6, "Calma"), (15, "Brisa suave"), (30, "Viento moderado")):
        if valor < limite:
            return nombre
    return "Viento fuerte"


def texto_enso(info: dict, metodo_elegido: str) -> str:
    """info: modo (auto|forzado|excluido), usado, varia, evento_actual, rmse_con, rmse_sin."""
    ev = f" Evento en curso: {info['evento_actual']}." if info.get("evento_actual") else ""
    modo = info["modo"]
    if info["usado"]:
        if modo == "forzado":
            base = "Incluí la fase de El Niño / La Niña porque lo pediste."
        else:
            base = (
                "Probé la proyección con y sin la fase de El Niño / La Niña, y con ella el error fue menor "
                f"(RMSE {_f(info['rmse_con'], 2)} frente a {_f(info['rmse_sin'], 2)} sin ella), así que la incluí."
            )
        return base + " Esto no prueba que el evento cause el cambio: es una variable más que el modelo puede aprovechar." + ev
    if modo == "excluido":
        return "No incluí fenómenos climáticos, como pediste." + ev
    if info.get("varia") is False:
        prefijo = "Pediste incluir El Niño / La Niña, pero" if modo == "forzado" else "No pude evaluar el efecto de El Niño / La Niña:"
        return (
            f"{prefijo} el histórico usado no incluye períodos con y sin evento, así que no aporta información. "
            "Con más años de datos podré tomarlo en cuenta." + ev
        )
    return (
        "Probé incluir la fase de El Niño / La Niña, pero no mejoró el error de forma apreciable "
        f"(RMSE {_f(info['rmse_con'], 2)} frente a {_f(info['rmse_sin'], 2)} sin ella), así que no la usé." + ev
    )


def texto_proyeccion(
    variable: str,
    dias: int,
    resultado: dict,
    elegido: dict,
    mejor: dict | None,
    serie: dict,
    enso: dict,
    advertencias: list[str],
    criterio: str = "error",
    openmeteo: dict | None = None,
    correccion: dict | None = None,
    sin_corregir_pedido: bool = False,
    mos: dict | None = None,
) -> str:
    """Justificación completa (método, error, datos y fenómenos). Se muestra en «¿Cómo lo calculé?»."""
    u = UNIDADES[variable]
    lineas = [f"Método usado: {elegido['nombre']}.", DESCRIPCION_METODO[elegido["metodo"]], ""]

    n = len(resultado["resultados"])
    dp = resultado["dias_prueba"]
    om = openmeteo or {}
    if criterio == "mos" and mos:
        crudo = next(o for o in mos["opciones"] if o["metodo"] == "openmeteo_crudo")
        pd_ = mos["prueba_desde"]
        lineas.append(
            f"Por qué lo elegí: usé {mos['fechas']} fechas en las que hay pronóstico pasado de Open-Meteo (de 1 a 7 días de "
            f"anticipación) y medición de la estación, en tres tramos según el tiempo: con las {mos['fechas_entrenamiento']} más "
            f"antiguas aprendieron las correcciones (regresión lineal, Random Forest y Gradient Boosting, con un solo modelo "
            f"meteorológico y con varios); con las "
            f"{mos['fechas_validacion']} siguientes calculé cómo combinarlas; y con las últimas {mos['fechas_prueba']} "
            f"(desde el {pd_[8:10]}/{pd_[5:7]}/{pd_[:4]}), que nadie vio antes, califiqué todas las opciones."
        )
        lineas.append(
            f"Error medio contra lo medido: Open-Meteo sin corregir {_f(crudo['mae'], 2)} {u}; la opción elegida "
            f"{_f(elegido['mae'], 2)} {u} ({mos['mejora_pct']:.0f} % menos)."
            if mos["elegido"] != "openmeteo_crudo"
            else f"Ninguna corrección mejoró al pronóstico de Open-Meteo ({_f(crudo['mae'], 2)} {u} de error medio), así que lo usé tal cual."
        )
        nombres_mod = [m["nombre"] for m in mos.get("modelos", [])]
        if len(nombres_mod) > 1:
            lineas.append(f"Modelos meteorológicos usados ({len(nombres_mod)}): {', '.join(nombres_mod)}.")
            if mos.get("descartados"):
                lineas.append(f"Descartados por no tener suficientes datos para Cochabamba: {', '.join(mos['descartados'])}.")
            imp = mos.get("impacto_modelos")
            if imp:
                lineas.append(
                    f"Con un solo modelo, la mejor corrección se equivocó {_f(imp['un_modelo']['mae'], 2)} {u}; con varios, "
                    f"{_f(imp['varios_modelos']['mae'], 2)} {u}"
                    + (f" ({imp['mejora_pct']:.0f} % menos)." if imp["mejora_pct"] > 0 else " (no mejoró, por eso no se usan).")
                )
        if mos["elegido"] == "ensamble":
            mezcla = ", ".join(f"{p['nombre'].replace('Open-Meteo + ', '')} {p['peso'] * 100:.0f} %" for p in mos["pesos"] if p["peso"] >= 0.01)
            lineas.append(
                f"La combinación ganó a cada modelo por separado. Mezcla: {mezcla}. Los pesos salen de mínimos cuadrados no "
                f"negativos (suman 100 %) sobre el tramo más reciente: pesa más el que mejor acertó últimamente."
            )
        por_k = next(o for o in mos["opciones"] if o["metodo"] == mos["elegido"])["por_anticipacion"]
        if por_k:
            detalle = ", ".join(f"{k} día{'s' if int(k) > 1 else ''}: {v:.1f}" for k, v in sorted(por_k.items(), key=lambda x: int(x[0])))
            lineas.append(f"Error según la anticipación ({u}): {detalle}. Mientras más lejos, mayor el error.")
        if elegido.get("relleno"):
            lineas.append(
                f"El pronóstico de Open-Meteo cubre {elegido['dias_hibrido']} de los {dias} días; los siguientes los proyecté con "
                f"{elegido['relleno']}, el mejor método estadístico para esos datos."
            )
    elif criterio == "openmeteo":
        lineas.append(
            f"Por qué lo elegí: comparé la proyección de los {n} métodos con el pronóstico de Open-Meteo para las mismas "
            f"fechas ({om.get('dias')} día(s) en común). Open-Meteo usa modelos meteorológicos físicos, que pueden "
            f"anticipar olas de calor o frentes fríos; los métodos estadísticos solo ven el pasado. {elegido['nombre']} "
            f"fue el que más se acercó: se diferencia en promedio {_f(elegido.get('dif_openmeteo'), 2)} {u}."
        )
        if mejor:
            lineas.append(
                f"En la prueba con los últimos {dp} días reales, su error fue MAE {_f(elegido['mae'], 2)} {u} y RMSE "
                f"{_f(elegido['rmse'], 2)} {u}; el de menor error en esa prueba fue {mejor['nombre']} "
                f"(RMSE {_f(mejor['rmse'], 2)} {u})."
            )
    elif mejor and elegido["metodo"] == mejor["metodo"]:
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
    if not resultado["supera_referencia"] and criterio != "mos":
        lineas.append("Ningún método superó a esa referencia: con estos datos conviene tomar la proyección con mucha cautela.")

    if om.get("ok"):
        lineas.append(
            f"Open-Meteo estima un promedio de {_f(om['promedio'])} {u} para esos días."
            + (
                f" Ojo: en ClimaTech la temperatura de un día es el PROMEDIO de sus 24 horas; las máximas que muestran "
                f"las páginas de clima ({_f(om['tmax_min'], 0)} a {_f(om['tmax_max'], 0)} °C según Open-Meteo) son más altas."
                if variable == "temperatura" and om.get("tmax_max") is not None
                else ""
            )
        )
    elif criterio != "pedido":
        lineas.append("No pude consultar el pronóstico de Open-Meteo, así que elegí por el menor error en la prueba.")

    if correccion:
        lineas.append(
            f"Corrección con la estación del aeropuerto: antes de proyectar ajusté el historial de Open-Meteo con "
            f"«{correccion['metodo']}», calculada con {correccion['dias_pares']} días medidos en la estación "
            f"({correccion['mejora_pct']:.0f} % menos error en la prueba)."
            + (
                f" En {correccion['mes']}, Open-Meteo marca en promedio {abs(correccion['sesgo_mes']):.1f} {u} "
                f"{'menos' if correccion['sesgo_mes'] > 0 else 'más'} que lo medido."
                if correccion.get("sesgo_mes") is not None
                else ""
            )
        )
    elif sin_corregir_pedido:
        lineas.append("Como pediste, usé el historial de Open-Meteo sin la corrección de la estación.")

    lineas += [
        "",
        f"Datos: {serie['dias_serie']} días de histórico (del {_fecha(serie['inicio'])} al {_fecha(serie['fin'])}).",
        texto_enso(enso, elegido["metodo"]),
    ]
    for o in resultado.get("omitidos", []):
        lineas.append(f"Nota: {o['nombre']} no se ejecutó: {o['motivo']}")
    for a in advertencias:
        lineas.append(f"Ojo: {a}")
    lineas += [
        "",
        "Combina un pronóstico meteorológico con una corrección estadística; no es un pronóstico oficial."
        if criterio == "mos"
        else DESCARGO,
    ]
    return "\n".join(lineas)


def texto_proyeccion_corto(
    variable: str,
    dias: int,
    resumen: dict,
    habitual: dict | None,
    enso: dict,
    alertas: list[dict] | None,
    pronostico_ok: bool,
    elegido: dict | None = None,
    criterio: str = "error",
    openmeteo: dict | None = None,
    correccion: dict | None = None,
    mos: dict | None = None,
) -> str:
    """Resumen breve en lenguaje sencillo, para el mensaje del chat."""
    u = UNIDADES[variable]
    prom = resumen["promedio"]
    promedio_txt = "la temperatura promedio del día" if variable == "temperatura" else NOMBRE_VARIABLE[variable]
    lineas = [
        f"Proyección de {promedio_txt} para los próximos {dias} día(s): promedio de "
        f"{_f(prom)} {u} ({descriptor(variable, prom).lower()}), con valores entre {_f(resumen['minimo'])} y {_f(resumen['maximo'])} {u}."
    ]
    if correccion and correccion.get("sesgo_mes") is not None and abs(correccion["sesgo_mes"]) >= 0.1:
        lineas.append(
            f"El historial está corregido con las mediciones de la estación del aeropuerto "
            f"(en {correccion['mes']} Open-Meteo suele marcar {abs(correccion['sesgo_mes']):.1f} {u} "
            f"{'menos' if correccion['sesgo_mes'] > 0 else 'más'} de lo medido)."
        )
    om = openmeteo or {}
    if om.get("ok"):
        texto_om = f"El pronóstico de Open-Meteo para esas fechas da un promedio de {_f(om['promedio'])} {u}"
        if variable == "temperatura" and om.get("tmax_max") is not None:
            texto_om += f", con máximas de {_f(om['tmax_min'], 0)} a {_f(om['tmax_max'], 0)} °C"
        lineas.append(texto_om + ".")
        if criterio == "mos" and elegido and mos and mos["elegido"] != "openmeteo_crudo":
            crudo = next(o for o in mos["opciones"] if o["metodo"] == "openmeteo_crudo")
            lineas.append(
                f"Usé el modelo híbrido: el pronóstico de Open-Meteo corregido por IA con lo medido en la estación del "
                f"aeropuerto{', combinando varios modelos según su acierto reciente' if mos['elegido'] == 'ensamble' else ''}. "
                f"En la prueba se equivocó {_f(elegido['mae'])} {u} en promedio, frente a {_f(crudo['mae'])} {u} "
                f"de Open-Meteo sin corregir."
            )
        elif criterio == "openmeteo" and elegido:
            lineas.append(
                f"Usé {elegido['nombre']} porque es el método que más se acerca a ese pronóstico "
                f"(diferencia media de {_f(elegido.get('dif_openmeteo'))} {u})."
            )
    if habitual:
        d = habitual["diferencia"]
        if abs(d) < 0.3 * (1 if variable == "temperatura" else 3):
            lineas.append(f"Es lo habitual para {habitual['mes']}.")
        else:
            mas = {"temperatura": ("más cálido", "más fresco"), "humedad": ("más húmedo", "más seco"), "velocidad_viento": ("más ventoso", "más calmo")}[variable]
            lineas.append(f"Es {_f(abs(d))} {u} {mas[0] if d > 0 else mas[1]} de lo habitual para {habitual['mes']}.")
    if enso["modo"] == "excluido":
        lineas.append("No incluí fenómenos climáticos, como pediste.")
    elif enso.get("evento_actual"):
        if enso["usado"]:
            lineas.append(f"Tomé en cuenta el evento climático en curso ({enso['evento_actual']}), porque mejoró la proyección.")
        elif enso.get("varia") is False:
            lineas.append(
                f"Hay un evento en curso ({enso['evento_actual']}), pero el histórico no incluye períodos con y sin evento "
                "y no pude evaluar su efecto."
            )
        else:
            lineas.append(f"Hay un evento en curso ({enso['evento_actual']}), pero no mejoró la proyección con estos datos.")
    if not pronostico_ok:
        lineas.append("No pude consultar las alertas del pronóstico (¿sin conexión a internet?).")
    elif alertas:
        nombres = ", ".join(f"{a['titulo'].lower()} ({_fecha(a['fecha'])[:5]})" for a in alertas[:4])
        lineas.append(f"Alertas probables en los próximos días: {nombres}. Puedo enviártelas por correo.")
    else:
        lineas.append("No hay alertas probables en los próximos días según el pronóstico.")
    lineas.append("Toca «¿Cómo lo calculé?» para ver el método y la justificación.")
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
        "• Proyectar temperatura, humedad o viento: tomo en cuenta El Niño / La Niña si mejora el resultado, te muestro "
        "las alertas probables y puedo enviártelas por correo.\n"
        "• Registrar un dato a mano, ver los últimos registros y, si eres administrador, editarlos o eliminarlos.\n"
        "• Importar datos históricos de Open-Meteo y saber cuántos datos tienes.\n"
        "• Generar reportes en PDF y volver a abrir los anteriores.\n"
        "• Ver los fenómenos climáticos (El Niño / La Niña) junto con las anomalías de los datos.\n"
        "• Activar tus alertas por correo y enviarte un correo de prueba.\n"
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
        return "Este es tu reporte más reciente. Pulsa el enlace para abrir el archivo."
    return f"Estos son tus {len(filas)} reportes más recientes. Pulsa el enlace para abrir el archivo."


def texto_historial_alertas(filas: list[dict]) -> str:
    if not filas:
        return "Todavía no se envió ninguna alerta."
    if len(filas) == 1:
        return "Esta es la única alerta enviada hasta ahora."
    return f"Estas son las últimas {len(filas)} alertas enviadas."


def texto_eventos(eventos: list[dict], actual: dict | None, cierre: bool = True) -> str:
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
    if cierre:
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
