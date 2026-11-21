"""
Diagnostica el envío de correo de ClimaTech paso a paso (sin abrir el sistema completo).

Uso, desde la carpeta backend con el entorno virtual activo:
    python -m scripts.probar_smtp tu_correo@gmail.com

Comprueba, en orden:
  1) que backend/.env tenga las variables SMTP (la contraseña no se imprime),
  2) que tu red pueda abrir conexión con el servidor en los puertos 587 y 465,
  3) un envío real de prueba usando la misma función que usa el sistema.
Así se distingue si el problema es de configuración, de red/antivirus o de credenciales.
"""

import os
import socket
import sys

from dotenv import load_dotenv

load_dotenv()


def _puerto_abierto(host: str, puerto: int) -> str:
    try:
        with socket.create_connection((host, puerto), timeout=8):
            return "abierto"
    except OSError as exc:
        return f"BLOQUEADO o inaccesible ({exc})"


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python -m scripts.probar_smtp destino@correo.com")
        return 1
    destino = sys.argv[1]

    host = (os.getenv("SMTP_HOST") or "").strip()
    puerto = os.getenv("SMTP_PORT", "587")
    usuario = (os.getenv("SMTP_USER") or "").strip()
    clave = (os.getenv("SMTP_PASSWORD") or "").replace(" ", "")

    print("1) Configuración leída de backend/.env")
    print(f"   SMTP_HOST     = {host or '(vacío)'}")
    print(f"   SMTP_PORT     = {puerto}")
    print(f"   SMTP_USER     = {usuario or '(vacío)'}")
    print(f"   SMTP_PASSWORD = {'(' + str(len(clave)) + ' caracteres)' if clave else '(vacío)'}")
    print(f"   SMTP_STARTTLS = {os.getenv('SMTP_STARTTLS', '1 (por defecto)')}")
    if not host:
        print("   -> Falta SMTP_HOST. Para Gmail es smtp.gmail.com")
        return 1
    if host in ("gmail.com", "www.gmail.com"):
        print("   -> Con Gmail el servidor es smtp.gmail.com, no gmail.com")
    if "gmail" in host and len(clave) != 16:
        print(f"   -> Las contraseñas de aplicación de Google tienen 16 caracteres y la tuya tiene {len(clave)}.")

    print("\n2) Conexión de red")
    for p in (587, 465):
        print(f"   {host}:{p} -> {_puerto_abierto(host, p)}")

    print("\n3) Envío de prueba")
    from app.routers.alertas import enviar_correo

    try:
        enviar_correo(destino, "[PRUEBA] ClimaTech: diagnóstico de correo", "Si lees esto, el envío de correo funciona.")
    except Exception as exc:
        print(f"   FALLÓ: {exc}")
        return 1
    print(f"   OK: correo enviado a {destino}. Revisa la bandeja y la carpeta de spam.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
