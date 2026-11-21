"""
Actualización de datos y modelos.

  GET  /actualizacion/estado     cualquier usuario: última actualización, si hay una en curso y días pendientes.
  POST /actualizacion/ejecutar   administrador: actualiza ahora (historial, estación, pronósticos pasados y modelos).
"""

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from app import actualizacion
from app.auth import UsuarioActual, get_current_user, requiere_admin

router = APIRouter(prefix="/actualizacion", tags=["actualizacion"])


@router.get("/estado")
async def estado(usuario: UsuarioActual = Depends(get_current_user)):
    return {**actualizacion.estado(), "pendientes": await run_in_threadpool(actualizacion.pendientes)}


@router.post("/ejecutar")
async def ejecutar(usuario: UsuarioActual = Depends(requiere_admin)):
    return await run_in_threadpool(actualizacion.actualizar_todo, "manual")
