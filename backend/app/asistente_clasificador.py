"""
Clasificador LOCAL de intenciones (Machine Learning liviano, sin internet ni costo).

Se usa como respaldo cuando las reglas de asistente_nlu no entienden una frase
(faltas de ortografía, redacciones distintas...). Aprende de los ejemplos de
asistente_datos.py con TF-IDF de n-gramas de caracteres + regresión logística,
lo que lo hace tolerante a errores de escritura. Se entrena una sola vez, al
primer uso (toma una fracción de segundo).

Solo decide la INTENCIÓN. Los datos (variable, días, fechas...) los sigue
extrayendo asistente_nlu, y toda acción que modifica datos sigue pidiendo confirmación.
"""

from __future__ import annotations

from threading import Lock

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, make_pipeline

from app.asistente_datos import EJEMPLOS
from app.asistente_nlu import INTENCIONES, normalizar

UMBRAL_CONFIANZA = 0.30  # por debajo, se considera "no entendí"
_modelo: Pipeline | None = None
_candado = Lock()


def construir_modelo(ejemplos: list[tuple[str, str]] | None = None) -> Pipeline:
    datos = ejemplos or EJEMPLOS
    X = [normalizar(f) for f, _ in datos]
    y = [i for _, i in datos]
    modelo = make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True),
        LogisticRegression(max_iter=2000, C=20),
    )
    return modelo.fit(X, y)


def _obtener() -> Pipeline:
    global _modelo
    with _candado:
        if _modelo is None:
            _modelo = construir_modelo()
        return _modelo


def clasificar(texto: str, umbral: float = UMBRAL_CONFIANZA) -> tuple[str | None, float]:
    """Devuelve (intención, confianza), o (None, confianza) si no se entiende o es otro tema."""
    modelo = _obtener()
    t = normalizar(texto)
    if not t:
        return None, 0.0
    probas = modelo.predict_proba([t])[0]
    i = int(probas.argmax())
    intencion, confianza = str(modelo.classes_[i]), float(probas[i])
    if intencion == "desconocido" or intencion not in INTENCIONES or confianza < umbral:
        return None, confianza
    return intencion, confianza
