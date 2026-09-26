"""
Endpoints exclusivos del administrador para gestionar usuarios:
listar (con email, cruzando profiles + auth.users), cambiar rol
y activar/desactivar cuentas.
"""

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException

from app.auth import requiere_admin, supabase_admin, UsuarioActual

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

ROLES_VALIDOS = {"administrador", "usuario_estandar"}
ESTADOS_VALIDOS = {"activo", "inactivo"}


class ActualizarUsuarioRequest(BaseModel):
    rol: str | None = None
    estado: str | None = None


@router.get("")
async def listar_usuarios(usuario: UsuarioActual = Depends(requiere_admin)):
    """Lista todos los usuarios con su email, rol y estado (solo admin)."""
    perfiles = supabase_admin.table("profiles").select("*").order("created_at").execute()

    # auth.admin.list_users() trae el email, que no vive en la tabla profiles
    respuesta_auth = supabase_admin.auth.admin.list_users()
    usuarios_auth = respuesta_auth if isinstance(respuesta_auth, list) else getattr(
        respuesta_auth, "users", []
    )
    emails_por_id = {u.id: u.email for u in usuarios_auth}

    resultado = [
        {
            "id": p["id"],
            "nombre_completo": p["nombre_completo"],
            "email": emails_por_id.get(p["id"], "—"),
            "rol": p["rol"],
            "estado": p["estado"],
            "created_at": p["created_at"],
        }
        for p in perfiles.data
    ]
    return resultado


@router.patch("/{user_id}")
async def actualizar_usuario(
    user_id: str,
    datos: ActualizarUsuarioRequest,
    usuario: UsuarioActual = Depends(requiere_admin),
):
    """Cambia el rol y/o estado de un usuario (solo admin, no a sí mismo)."""
    if user_id == usuario.id:
        raise HTTPException(
            status_code=400, detail="No puedes modificar tu propio usuario desde aquí."
        )

    cambios: dict[str, str] = {}
    if datos.rol is not None:
        if datos.rol not in ROLES_VALIDOS:
            raise HTTPException(status_code=400, detail=f"Rol inválido. Usa uno de: {ROLES_VALIDOS}")
        cambios["rol"] = datos.rol
    if datos.estado is not None:
        if datos.estado not in ESTADOS_VALIDOS:
            raise HTTPException(status_code=400, detail=f"Estado inválido. Usa uno de: {ESTADOS_VALIDOS}")
        cambios["estado"] = datos.estado

    if not cambios:
        raise HTTPException(status_code=400, detail="No se envió ningún cambio (rol o estado).")

    resultado = (
        supabase_admin.table("profiles").update(cambios).eq("id", user_id).execute()
    )

    if not resultado.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    supabase_admin.table("auditoria").insert(
        {
            "usuario_id": usuario.id,
            "accion": "actualizar_usuario",
            "tabla_afectada": "profiles",
            "registro_id": user_id,
            "detalle": cambios,
        }
    ).execute()

    return {"mensaje": "Usuario actualizado correctamente.", "usuario": resultado.data[0]}
