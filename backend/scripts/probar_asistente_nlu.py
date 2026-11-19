"""
Prueba rápida (sin base de datos ni internet) del motor de interpretación del asistente.
Uso, desde la carpeta backend con el entorno virtual activo:
    python -m scripts.probar_asistente_nlu
Imprime OK o la lista de frases que no se interpretaron como se esperaba.
"""

from datetime import date

from app.asistente_nlu import interpretar

HOY = date(2026, 11, 17)
CTX_ACCION = {"accion": {"tipo": "importar_open_meteo", "params": {}}}
CTX_PROY = {"ultima": {"intencion": "proyectar", "slots": {"variable": "temperatura", "dias": 7}}}

# (frase, contexto, intención esperada, datos esperados)
CASOS = [
    ("Hola", None, "ayuda", {}),
    ("proyéctame la temperatura de los próximos 10 días tomando en cuenta El Niño", None, "proyectar",
     {"variable": "temperatura", "dias": 10, "usar_enso": True}),
    ("proyecta la humedad para la próxima semana", None, "proyectar", {"variable": "humedad", "dias": 7}),
    ("proyecta temperatura 60 días sin el niño", None, "proyectar", {"dias": 30, "usar_enso": False}),
    ("proyecta el viento con random forest", None, "proyectar", {"variable": "velocidad_viento", "metodo": "random_forest"}),
    ("pronóstico de lluvia", None, "alertas", {}),
    ("¿va a llover mañana?", None, "alertas", {}),
    ("importa los últimos 30 días", None, "importar", {}),
    ("importa datos de Open-Meteo del 2025", None, "importar", {}),
    ("genera un reporte del último año", None, "reporte", {}),
    ("genera un reporte de ese período", None, "reporte", {}),
    ("activa mis alertas por correo", None, "activar_alertas", {}),
    ("desactiva las alertas", None, "desactivar_alertas", {}),
    ("quiero un correo de prueba de helada", None, "prueba_alerta", {"tipo_alerta": "helada"}),
    ("explícame los métodos", None, "metodos", {}),
    ("¿hay algún evento climático en curso?", None, "fenomenos", {}),
    ("¿qué anomalías tuvo la temperatura este año?", None, "anomalias", {"variable": "temperatura"}),
    ("sí", CTX_ACCION, "confirmar", {}),
    ("no, mejor no", CTX_ACCION, "cancelar", {}),
    ("repítelo con El Niño", CTX_PROY, "proyectar", {"usar_enso": True}),
    ("ahora con humedad", CTX_PROY, "proyectar", {"variable": "humedad"}),
    ("jajaja qué tal el fútbol", None, "desconocido", {}),
    ("quiero registrar un dato", None, "registrar", {}),
    ("registra temperatura 18.5 y humedad 60 a las 14:30", None, "registrar",
     {"valores": {"temperatura": 18.5, "humedad": 60.0, "hora": "14:30"}}),
    ("muéstrame los últimos 15 registros", None, "ver_registros", {"cantidad": 15}),
    ("quiero editar un registro", None, "ver_registros", {}),
    ("¿cuántos datos tengo?", None, "resumen_datos", {}),
    ("¿hasta qué fecha hay datos?", None, "resumen_datos", {}),
    ("muéstrame mis reportes anteriores", None, "mis_reportes", {}),
    ("agrega un evento climático", None, "nuevo_evento", {}),
    ("registra un evento de El Niño", None, "nuevo_evento", {}),
    ("envía las alertas ahora", None, "revisar_alertas", {}),
    ("simula la revisión de alertas", None, "revisar_alertas", {"simular": True}),
    ("historial de alertas enviadas", None, "historial_alertas", {}),
    ("mándame una alerta de prueba a mi correo", None, "prueba_alerta", {}),
]


def main() -> int:
    fallos = []
    for frase, ctx, intencion, datos in CASOS:
        r = interpretar(frase, ctx, HOY)
        faltan = {k: v for k, v in datos.items() if r["slots"].get(k) != v}
        if r["intencion"] != intencion or faltan:
            fallos.append(f"  «{frase}» -> {r['intencion']} {r['slots']} (esperado: {intencion} {datos})")
    if fallos:
        print(f"{len(fallos)} de {len(CASOS)} casos fallaron:")
        print("\n".join(fallos))
        return 1
    print(f"OK: {len(CASOS)} frases interpretadas correctamente.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
