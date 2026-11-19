"""
Evalúa el clasificador local de intenciones del asistente (sin base de datos ni internet).

Uso, desde la carpeta backend con el entorno virtual activo:
    python -m scripts.probar_clasificador

Hace dos pruebas:
  1) Validación cruzada de 5 particiones sobre los ejemplos de app/asistente_datos.py
     (mide qué tan bien generaliza a frases que no vio al entrenar).
  2) Frases nuevas escritas aparte, con faltas de ortografía y redacciones informales.
Sirve también para comprobar que el modelo sigue bien después de agregar ejemplos.
"""

from sklearn.model_selection import cross_val_score

from app.asistente_clasificador import UMBRAL_CONFIANZA, clasificar, construir_modelo
from app.asistente_datos import EJEMPLOS
from app.asistente_nlu import normalizar

# (frase que el modelo NO vio, intención esperada; None = debe responder "no entendí / otro tema")
FRASES_NUEVAS = [
    ("proyecsion de la tempertura pa la otra semana", "proyectar"),
    ("necesito saber cuanta humedad va a haber", "proyectar"),
    ("podrias predecir el viento", "proyectar"),
    ("trae datos del clima de este año", "importar"),
    ("quiero bajar informacion historica", "importar"),
    ("hazme un pdf con todo", "reporte"),
    ("donde puedo ver los informes que ya hice", "mis_reportes"),
    ("que tan anormal estuvo la temperatura", "anomalias"),
    ("estamos en el niño", "fenomenos"),
    ("va a caer mucha lluvia", "alertas"),
    ("avisenme por mail cuando haya tormenta", "activar_alertas"),
    ("no quiero mas correos de alertas", "desactivar_alertas"),
    ("mandame un correo para probar", "prueba_alerta"),
    ("como se calcula el error de cada modelo", "metodos"),
    ("holaa", "ayuda"),
    ("quiero meter una lectura a mano", "registrar"),
    ("enseñame lo que hay guardado", "ver_registros"),
    ("de cuando a cuando tengo datos", "resumen_datos"),
    ("crear un nuevo evento enso", "nuevo_evento"),
    ("mandar los avisos a la gente", "revisar_alertas"),
    ("a quienes se les mando alertas", "historial_alertas"),
    ("cuentame un cuento", None),
    ("quien gano el mundial", None),
]


def main() -> int:
    X = [normalizar(f) for f, _ in EJEMPLOS]
    y = [i for _, i in EJEMPLOS]
    precision = cross_val_score(construir_modelo(EJEMPLOS), X, y, cv=5).mean()
    print(f"Ejemplos de entrenamiento: {len(EJEMPLOS)} en {len(set(y))} intenciones")
    print(f"Validación cruzada (5 particiones): {precision:.0%} de aciertos\n")

    aciertos = 0
    for frase, esperada in FRASES_NUEVAS:
        obtenida, confianza = clasificar(frase)
        ok = obtenida == esperada
        aciertos += ok
        marca = "OK " if ok else "MAL"
        print(f"  {marca} «{frase}» -> {obtenida or 'no entendí'} ({confianza:.0%}), esperado: {esperada or 'no entendí'}")
    print(f"\nFrases nuevas: {aciertos}/{len(FRASES_NUEVAS)} correctas (umbral de confianza: {UMBRAL_CONFIANZA:.0%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
