"""
Estación del aeropuerto (SLCB): importar mediciones y ver el impacto de la corrección.

  POST /estacion/importar   (administrador) descarga los reportes METAR y guarda el resumen diario.
  GET  /estacion/impacto    compara Open-Meteo con lo medido, la corrección elegida y el
                            error real de las proyecciones guardadas.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import estacion, mos
from app.auth import UsuarioActual, get_current_user, requiere_admin, supabase_admin

router = APIRouter(prefix="/estacion", tags=["estacion"])

MAX_DIAS_IMPORTACION = 366 * 6


class ImportarRequest(BaseModel):
    fecha_inicio: date
    fecha_fin: date


@router.post("/importar")
def importar(datos: ImportarRequest, usuario: UsuarioActual = Depends(requiere_admin)):
    fin = min(datos.fecha_fin, date.today() - timedelta(days=1))
    if fin < datos.fecha_inicio:
        raise HTTPException(status_code=400, detail="El rango de fechas no es válido.")
    if (fin - datos.fecha_inicio).days + 1 > MAX_DIAS_IMPORTACION:
        raise HTTPException(status_code=400, detail="El rango máximo por importación es de 6 años.")
    try:
        horario = estacion.descargar_iem(datos.fecha_inicio, fin)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo descargar los datos de la estación: {exc}")
    dias = estacion.resumir_por_dia(horario)
    if not dias:
        raise HTTPException(status_code=404, detail="La estación no tiene reportes en ese período.")
    try:
        estacion.guardar_observaciones(dias)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo guardar. ¿Ejecutaste la migración 005_observaciones_estacion.sql en Supabase? ({exc})",
        )
    # Pronósticos pasados de Open-Meteo para el mismo período (modelo híbrido). Si falla, la estación igual queda guardada.
    previos, aviso_previos = 0, None
    try:
        filas = mos.descargar_previos(datos.fecha_inicio, fin)
        previos = mos.guardar_previos(filas) if filas else 0
    except Exception as exc:
        aviso_previos = f"No se pudieron importar los pronósticos pasados de Open-Meteo: {exc}"
    estacion.limpiar_cache()
    mos.limpiar_cache()
    supabase_admin.table("auditoria").insert(
        {
            "usuario_id": usuario.id,
            "accion": "importar_estacion",
            "tabla_afectada": "observaciones_estacion",
            "detalle": {"desde": datos.fecha_inicio.isoformat(), "hasta": fin.isoformat(), "dias": len(dias)},
        }
    ).execute()
    completos = sum(1 for d in dias if d["temperatura"] is not None)
    return {
        "mensaje": "Importación completada.",
        "lecturas": int(len(horario)),
        "dias": len(dias),
        "dias_completos": completos,
        "pronosticos_previos": previos,
        "aviso": aviso_previos,
    }


@router.get("/impacto")
def impacto(variable: str = "temperatura", usuario: UsuarioActual = Depends(get_current_user)):
    if variable not in estacion.VARIABLES:
        raise HTTPException(status_code=400, detail=f"Variable inválida. Usa una de: {list(estacion.VARIABLES)}")
    try:
        pares = estacion.pares_open_meteo_estacion(variable)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudieron leer las observaciones ({exc}). ¿Ejecutaste la migración 005?")
    try:
        resultado = estacion.evaluar_correccion(pares, variable)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    resultado["verificacion"] = estacion.verificar_proyecciones(variable)
    resultado["estacion"] = estacion.NOMBRE_ESTACION
    m = mos.obtener_mos(variable)
    resultado["mos"] = mos.informe_publico(m) if m else None
    return resultado
