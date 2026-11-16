"""
Endpoints del módulo de IA:
  POST /ia/comparar  compara 6 métodos con evaluación fuera de muestra.
  POST /ia/explicar  explica el resultado en lenguaje sencillo (LLM opcional,
                     con plantilla local de respaldo que no necesita internet).
"""

import os
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.analisis_enso import construir_funcion_enso, evento_actual
from app.auth import UsuarioActual, get_current_user
from app.datos import cargar_serie_diaria, listar_eventos
from app.ia_modelos import comparar_metodos, enso_varia, preparar_serie

router = APIRouter(prefix="/ia", tags=["ia"])

MAX_DIAS_PROYECTAR = 30
DIAS_HISTORICO_GRAFICO = 45
MINIMO_RECOMENDADO_ML = 90


class CompararRequest(BaseModel):
    variable: str
    periodo_inicio: date
    periodo_fin: date
    dias_a_proyectar: int = Field(default=7, ge=1, le=MAX_DIAS_PROYECTAR)
    dias_prueba: int = Field(default=7, ge=3, le=60)
    usar_enso: bool = False


@router.post("/comparar")
def comparar(datos: CompararRequest, usuario: UsuarioActual = Depends(get_current_user)):
    if datos.periodo_fin < datos.periodo_inicio:
        raise HTTPException(status_code=400, detail="periodo_fin no puede ser anterior a periodo_inicio.")

    df = cargar_serie_diaria(datos.variable, datos.periodo_inicio, datos.periodo_fin)
    serie, info = preparar_serie(df, datos.variable)

    advertencias: list[str] = []
    if info["dias_descartados"]:
        advertencias.append(
            f"Había un hueco grande de datos: se usó solo el último tramo continuo "
            f"({info['dias_serie']} días) y se descartaron {info['dias_descartados']} días anteriores."
        )
    elif info["dias_faltantes"]:
        advertencias.append(f"Se rellenaron {info['dias_faltantes']} día(s) sin dato por interpolación.")
    if len(serie) < MINIMO_RECOMENDADO_ML:
        advertencias.append(
            f"La serie tiene {len(serie)} días. Los modelos de IA rinden mejor con {MINIMO_RECOMENDADO_ML} "
            "días o más (idealmente uno o más años)."
        )

    eventos = listar_eventos()
    enso_fn = construir_funcion_enso(eventos) if datos.usar_enso else None
    enso_info = {"usado": datos.usar_enso, "varia": None, "evento_actual": None}
    if datos.usar_enso:
        fechas_chequeo = list(serie["fecha"]) + [serie["fecha"].iloc[-1]]
        enso_info["varia"] = enso_varia(fechas_chequeo, enso_fn)
        actual = evento_actual(eventos)
        enso_info["evento_actual"] = actual["nombre"] if actual else None
        if not enso_info["varia"]:
            advertencias.append(
                "La fase ENSO es la misma durante todo el período elegido, así que no aporta información "
                "a los modelos. Usa un histórico que incluya años con y sin evento."
            )

    try:
        resultado = comparar_metodos(serie, datos.dias_prueba, datos.dias_a_proyectar, enso_fn)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not resultado["resultados"]:
        raise HTTPException(status_code=400, detail="Ningún método pudo ejecutarse con los datos disponibles.")

    historico = serie.tail(DIAS_HISTORICO_GRAFICO)
    return {
        "variable": datos.variable,
        **resultado,
        "historico": [
            {"fecha": f.date().isoformat(), "valor": round(float(v), 4)}
            for f, v in zip(historico["fecha"], historico["valor"])
        ],
        "enso": enso_info,
        "advertencias": advertencias,
    }


# ------------------------------------------------------------------ explicación
class MetodoResumen(BaseModel):
    nombre: str = Field(max_length=80)
    mae: float
    rmse: float


class ExplicarRequest(BaseModel):
    variable: str = Field(max_length=40)
    dias_prueba: int
    mejor_metodo: str | None = Field(default=None, max_length=80)
    supera_referencia: bool
    usar_enso: bool = False
    metodos: list[MetodoResumen] = Field(max_length=10)


UNIDADES = {"temperatura": "°C", "humedad": "%", "velocidad_viento": "km/h"}


def _texto_plantilla(d: ExplicarRequest) -> str:
    unidad = UNIDADES.get(d.variable, "")
    ordenados = sorted(d.metodos, key=lambda m: m.rmse)
    partes = [
        f"Para {d.variable.replace('_', ' ')} se reservaron los últimos {d.dias_prueba} días como prueba "
        f"y se compararon {len(ordenados)} métodos."
    ]
    if d.mejor_metodo:
        mejor = next((m for m in ordenados if m.nombre == d.mejor_metodo), ordenados[0])
        partes.append(
            f"El método con menor error fue {mejor.nombre}: en promedio se equivoca por {mejor.mae:.2f} {unidad} "
            f"(MAE) y {mejor.rmse:.2f} {unidad} (RMSE)."
        )
    if d.supera_referencia:
        partes.append("Mejora a la referencia simple de repetir el último valor, es decir, aporta algo más que no cambiar nada.")
    else:
        partes.append(
            "Ningún método superó a la referencia simple de repetir el último valor: con estos datos, "
            "los métodos complejos no aportan una mejora clara."
        )
    if d.usar_enso:
        partes.append("Se incluyó la fase de El Niño / La Niña como variable; solo ayuda si cambia dentro del período analizado.")
    partes.append(
        "Estos resultados describen qué tan bien acertó cada método en días recientes; no son un pronóstico "
        "meteorológico oficial."
    )
    return " ".join(partes)


def _explicar_con_llm(d: ExplicarRequest, base: str) -> str | None:
    clave = os.getenv("ANTHROPIC_API_KEY")
    if not clave:
        return None
    resumen = "; ".join(f"{m.nombre}: MAE {m.mae:.2f}, RMSE {m.rmse:.2f}" for m in d.metodos)
    pedido = (
        f"Variable: {d.variable}. Días de prueba: {d.dias_prueba}. Resultados: {resumen}. "
        f"Mejor método: {d.mejor_metodo}. Supera la referencia (repetir último valor): {d.supera_referencia}. "
        f"Se usó la fase El Niño/La Niña: {d.usar_enso}."
    )
    try:
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": clave,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
                "max_tokens": 400,
                "system": (
                    "Eres el asistente de ClimaTech, un sistema académico de proyección estadística del clima "
                    "de Cochabamba. Explica en español sencillo, en máximo 120 palabras, qué significan los "
                    "resultados. Usa solo los datos entregados, no inventes cifras y aclara que no es un "
                    "pronóstico meteorológico profesional."
                ),
                "messages": [{"role": "user", "content": pedido}],
            },
            timeout=30.0,
        )
        r.raise_for_status()
        texto = "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
        return texto.strip() or None
    except (httpx.HTTPError, ValueError, KeyError):
        return None


@router.post("/explicar")
def explicar(datos: ExplicarRequest, usuario: UsuarioActual = Depends(get_current_user)):
    base = _texto_plantilla(datos)
    texto_llm = _explicar_con_llm(datos, base)
    if texto_llm:
        return {"texto": texto_llm, "origen": "llm"}
    return {"texto": base, "origen": "plantilla"}
