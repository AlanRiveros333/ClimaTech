"""
Verificación de autenticación para endpoints de FastAPI usando el
JWT que emite Supabase Auth. El frontend manda el access_token en
el header Authorization: Bearer <token> en cada request al backend.
"""

import os
from dataclasses import dataclass

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client, Client

load_dotenv()  # Lee el archivo .env y carga sus variables en os.environ

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]  # Project Settings > API > JWT Secret

# Cliente con permisos totales (usado solo en el backend, nunca en el frontend)
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

security = HTTPBearer()


@dataclass
class UsuarioActual:
    id: str
    email: str | None
    rol: str
    estado: str


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado.",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UsuarioActual:
    """Dependencia: valida el JWT y trae el perfil (rol, estado) desde profiles."""
    payload = _decode_token(credentials.credentials)
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(status_code=401, detail="Token sin identificador de usuario.")

    result = (
        supabase_admin.table("profiles")
        .select("id, rol, estado")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=401, detail="Perfil de usuario no encontrado.")

    if result.data["estado"] != "activo":
        raise HTTPException(status_code=403, detail="Usuario inactivo.")

    return UsuarioActual(
        id=user_id,
        email=payload.get("email"),
        rol=result.data["rol"],
        estado=result.data["estado"],
    )


def requiere_admin(usuario: UsuarioActual = Depends(get_current_user)) -> UsuarioActual:
    """Dependencia adicional: exige que el usuario autenticado sea administrador."""
    if usuario.rol != "administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta acción requiere rol de administrador.",
        )
    return usuario