import asyncio
import os
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import get_current_user, UsuarioActual
from app.routers import registros, proyecciones, reportes, usuarios, ia, alertas, fenomenos, asistente


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Revisión automática de alertas: se activa con ALERTAS_AUTO=1 en backend/.env
    tarea = None
    if os.getenv("ALERTAS_AUTO") == "1":
        tarea = asyncio.create_task(alertas.bucle_automatico())
    yield
    if tarea:
        tarea.cancel()


app = FastAPI(title="ClimaTech API", lifespan=lifespan)


# IMPORTANTE: este filtro debe registrarse ANTES que CORSMiddleware. Así, un error interno
# (500) sale con las cabeceras de CORS y el navegador muestra el mensaje real en vez de
# un engañoso "blocked by CORS policy". El detalle completo queda en la terminal del backend.
@app.middleware("http")
async def capturar_errores(request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error interno del servidor ({type(exc).__name__}): {exc}"},
        )


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
app.include_router(ia.router)
app.include_router(alertas.router)
app.include_router(fenomenos.router)
app.include_router(asistente.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/me")
def me(usuario: UsuarioActual = Depends(get_current_user)):
    """Cualquier usuario autenticado puede ver su propia info."""
    return {"id": usuario.id, "email": usuario.email, "rol": usuario.rol}
