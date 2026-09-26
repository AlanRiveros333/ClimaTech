from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user, UsuarioActual
from app.routers import registros, proyecciones, reportes, usuarios

app = FastAPI(title="ClimaTech API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # cambiar por el dominio real en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(registros.router)
app.include_router(proyecciones.router)
app.include_router(reportes.router)
app.include_router(usuarios.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def me(usuario: UsuarioActual = Depends(get_current_user)):
    """Cualquier usuario autenticado puede ver su propia info."""
    return {"id": usuario.id, "email": usuario.email, "rol": usuario.rol}
