from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user, requiere_admin, UsuarioActual

app = FastAPI(title="ClimaTech API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # cambiar por el dominio real en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def me(usuario: UsuarioActual = Depends(get_current_user)):
    """Cualquier usuario autenticado puede ver su propia info."""
    return {"id": usuario.id, "email": usuario.email, "rol": usuario.rol}


@app.get("/admin/usuarios")
def listar_usuarios(usuario: UsuarioActual = Depends(requiere_admin)):
    """Solo accesible para administradores (RF-07)."""
    from app.auth import supabase_admin

    result = supabase_admin.table("profiles").select("*").execute()
    return result.data
