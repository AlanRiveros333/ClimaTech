"""
Paneles independientes del asistente.

Cada apartado del menú (Proyección, Estación del aeropuerto, Reportes, Métodos y
Fenómenos) carga su información con solo entrar, sin escribir en el chat. Para no
duplicar cálculos, estos endpoints reutilizan la misma lógica que usa el asistente
y devuelven el texto explicativo y las tarjetas con los datos.

  GET /paneles/proyeccion?variable=temperatura&dias=7
  GET /paneles/estacion?variable=temperatura
  GET /paneles/fenomenos?variable=temperatura
  GET /paneles/metodos?variable=temperatura
  GET /paneles/datos          resumen de todo lo registrado (para el reporte completo)
  GET /paneles/reportes       reportes generados (los propios primero)
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from app.asistente_nlu import sanear_contexto
from app.asistente_texto import DESCRIPCION_METODO, UNIDADES
from app.auth import UsuarioActual, get_current_user, supabase_admin
from app.datos import cargar_serie_diaria
from app.ia_modelos import comparar_metodos, preparar_serie
from app.routers import asistente

router = APIRouter(prefix="/paneles", tags=["paneles"])

VARIABLES = ("temperatura", "humedad", "velocidad_viento")
DIAS_PERMITIDOS = (3, 7, 10, 14)
DIAS_HISTORICO = 730
DIAS_PRUEBA_METODOS = 14
DIAS_GRAFICO = 30


def _variable(v: str) -> str:
    if v not in VARIABLES:
        raise HTTPException(status_code=400, detail=f"Variable inválida. Usa una de: {list(VARIABLES)}")
    return v


def _ejecutar(handler, slots: dict, usuario) -> dict:
    r = handler(slots, sanear_contexto(None), [], usuario)
    return {"texto": r["respuesta"], "tarjetas": r["tarjetas"]}


@router.get("/proyeccion")
async def proyeccion(
    variable: str = "temperatura",
    dias: int = Query(default=7, ge=1, le=14),
    usuario: UsuarioActual = Depends(get_current_user),
):
    slots = {"variable": _variable(variable), "dias": dias}
    return await run_in_threadpool(_ejecutar, asistente._h_proyectar, slots, usuario)


@router.get("/estacion")
async def estacion(variable: str = "temperatura", usuario: UsuarioActual = Depends(get_current_user)):
    return await run_in_threadpool(_ejecutar, asistente._h_estacion, {"variable": _variable(variable)}, usuario)


@router.get("/fenomenos")
async def fenomenos(variable: str = "temperatura", usuario: UsuarioActual = Depends(get_current_user)):
    r = await run_in_threadpool(_ejecutar, asistente._h_fenomenos, {"variable": _variable(variable)}, usuario)
    r["puede_editar"] = asistente._es_admin(usuario)
    return r


def _metodos(variable: str) -> dict:
    ultimo = asistente._ultima_fecha()
    if ultimo is None:
        raise HTTPException(status_code=404, detail="Todavía no hay datos históricos para comparar los métodos.")
    inicio = date.fromordinal(ultimo.toordinal() - DIAS_HISTORICO + 1)
    df = cargar_serie_diaria(variable, inicio, ultimo)
    serie, info = preparar_serie(df, variable)
    try:
        res = comparar_metodos(serie, DIAS_PRUEBA_METODOS, 7, None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not res["resultados"]:
        raise HTTPException(status_code=400, detail="Ningún método pudo ejecutarse con los datos disponibles.")
    historico = serie.tail(DIAS_GRAFICO + DIAS_PRUEBA_METODOS).head(DIAS_GRAFICO)
    return {
        "variable": variable,
        "unidad": UNIDADES[variable],
        "dias_entrenamiento": int(len(serie) - DIAS_PRUEBA_METODOS),
        "dias_prueba": DIAS_PRUEBA_METODOS,
        "desde": serie["fecha"].iloc[0].date().isoformat(),
        "hasta": serie["fecha"].iloc[-1].date().isoformat(),
        "metodos": [
            {
                "metodo": r["metodo"],
                "nombre": r["nombre"],
                "es_ml": r["es_ml"],
                "mae": r["mae"],
                "rmse": r["rmse"],
                "mejora_vs_referencia_pct": r.get("mejora_vs_referencia_pct"),
                "descripcion": DESCRIPCION_METODO.get(r["metodo"], ""),
                "prueba": r["prueba"],
            }
            for r in res["resultados"]
        ],
        "omitidos": res.get("omitidos", []),
        "historico": [{"fecha": f.date().isoformat(), "valor": round(float(v), 2)} for f, v in zip(historico["fecha"], historico["valor"])],
    }


@router.get("/metodos")
async def metodos(variable: str = "temperatura", usuario: UsuarioActual = Depends(get_current_user)):
    return await run_in_threadpool(_metodos, _variable(variable))


def _datos() -> dict:
    tabla = supabase_admin.table("registros_diarios")
    dias = tabla.select("fecha", count="exact").limit(1).execute().count or 0
    if dias == 0:
        return {"dias": 0, "desde": None, "hasta": None, "lecturas": 0, "manuales": 0}
    desde = supabase_admin.table("registros_diarios").select("fecha").order("fecha").limit(1).execute().data[0]["fecha"]
    hasta = supabase_admin.table("registros_diarios").select("fecha").order("fecha", desc=True).limit(1).execute().data[0]["fecha"]
    lecturas = supabase_admin.table("registros_climaticos").select("id", count="exact").limit(1).execute().count or 0
    manuales = (
        supabase_admin.table("registros_climaticos").select("id", count="exact").eq("fuente", "manual").limit(1).execute().count or 0
    )
    return {"dias": dias, "desde": desde, "hasta": hasta, "lecturas": lecturas, "manuales": manuales}


@router.get("/datos")
async def datos(usuario: UsuarioActual = Depends(get_current_user)):
    return await run_in_threadpool(_datos)


def _reportes(usuario_id: str) -> list[dict]:
    def consulta(campos: str):
        return supabase_admin.table("reportes").select(campos).order("created_at", desc=True).limit(200).execute().data or []

    try:
        filas = consulta("id,tipo,periodo_inicio,periodo_fin,archivo_url,created_at,generado_por,parametros")
    except Exception:
        filas = consulta("id,tipo,periodo_inicio,periodo_fin,archivo_url,created_at")
    for f in filas:
        f["mio"] = f.get("generado_por") == usuario_id
        f["completo"] = isinstance(f.get("parametros"), dict) and f["parametros"].get("alcance") == "completo"
        f.pop("parametros", None)
    return filas


@router.get("/reportes")
async def reportes(usuario: UsuarioActual = Depends(get_current_user)):
    return await run_in_threadpool(_reportes, usuario.id)
