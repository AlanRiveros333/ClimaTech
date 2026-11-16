"""
Fenómenos climáticos (El Niño / La Niña) y su relación con los datos de Cochabamba.

  GET    /fenomenos/eventos          lista de eventos y evento en curso
  POST   /fenomenos/eventos          (admin) registra un evento
  DELETE /fenomenos/eventos/{id}     (admin) elimina un evento
  GET    /fenomenos/analisis         anomalías mensuales y comparación por fase
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.analisis_enso import analizar_anomalias, evento_actual
from app.auth import UsuarioActual, get_current_user, requiere_admin, supabase_admin
from app.datos import cargar_serie_diaria, listar_eventos

router = APIRouter(prefix="/fenomenos", tags=["fenomenos"])

FASES = {"el_nino", "la_nina"}
INTENSIDADES = {"debil", "moderado", "fuerte", "muy_fuerte"}


class EventoRequest(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    fase: str
    intensidad: str
    fecha_inicio: date
    fecha_fin: date | None = None
    notas: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def validar(self):
        if self.fase not in FASES:
            raise ValueError(f"fase debe ser una de: {sorted(FASES)}")
        if self.intensidad not in INTENSIDADES:
            raise ValueError(f"intensidad debe ser una de: {sorted(INTENSIDADES)}")
        if self.fecha_fin and self.fecha_fin < self.fecha_inicio:
            raise ValueError("fecha_fin no puede ser anterior a fecha_inicio")
        return self


@router.get("/eventos")
def eventos(usuario: UsuarioActual = Depends(get_current_user)):
    lista = listar_eventos()
    actual = evento_actual(lista)
    return {"eventos": lista, "evento_actual": actual["nombre"] if actual else None}


@router.post("/eventos")
def crear_evento(datos: EventoRequest, usuario: UsuarioActual = Depends(requiere_admin)):
    fila = {
        "nombre": datos.nombre,
        "fase": datos.fase,
        "intensidad": datos.intensidad,
        "fecha_inicio": datos.fecha_inicio.isoformat(),
        "fecha_fin": datos.fecha_fin.isoformat() if datos.fecha_fin else None,
        "notas": datos.notas,
    }
    try:
        resultado = supabase_admin.table("eventos_climaticos").insert(fila).execute()
    except Exception as exc:
        if "duplicate" in str(exc).lower() or "23505" in str(exc):
            raise HTTPException(status_code=400, detail="Ya existe un evento con ese nombre y fecha de inicio.")
        raise HTTPException(status_code=400, detail=f"No se pudo guardar el evento: {exc}")

    nuevo = resultado.data[0]
    supabase_admin.table("auditoria").insert(
        {
            "usuario_id": usuario.id,
            "accion": "crear_evento_climatico",
            "tabla_afectada": "eventos_climaticos",
            "registro_id": nuevo["id"],
            "detalle": {"nombre": datos.nombre},
        }
    ).execute()
    return {"mensaje": "Evento registrado.", "evento": nuevo}


@router.delete("/eventos/{evento_id}")
def eliminar_evento(evento_id: str, usuario: UsuarioActual = Depends(requiere_admin)):
    resultado = supabase_admin.table("eventos_climaticos").delete().eq("id", evento_id).execute()
    if not resultado.data:
        raise HTTPException(status_code=404, detail="Evento no encontrado.")
    supabase_admin.table("auditoria").insert(
        {
            "usuario_id": usuario.id,
            "accion": "eliminar_evento_climatico",
            "tabla_afectada": "eventos_climaticos",
            "registro_id": evento_id,
        }
    ).execute()
    return {"mensaje": "Evento eliminado."}


@router.get("/analisis")
def analisis(
    variable: str = "temperatura",
    inicio: date | None = None,
    fin: date | None = None,
    usuario: UsuarioActual = Depends(get_current_user),
):
    df = cargar_serie_diaria(variable, inicio, fin)
    lista = listar_eventos()
    resultado = analizar_anomalias(df, variable, lista)
    actual = evento_actual(lista)
    return {
        "variable": variable,
        "evento_actual": actual["nombre"] if actual else None,
        "primer_dia": df["fecha"].min().date().isoformat(),
        "ultimo_dia": df["fecha"].max().date().isoformat(),
        **resultado,
    }
