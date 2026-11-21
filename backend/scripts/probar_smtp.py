r"""
Diagnostica el envío de correo de ClimaTech paso a paso (sin abrir el sistema completo).

Uso (Windows), con el entorno virtual del backend activo:
    cd C:\ClimaTech\backend
    venv\Scripts\activate
    python scripts\probar_smtp.py tu_correo@gmail.com

También funciona sin activar el venv, llamando a su Python directamente:
    C:\ClimaTech\backend\venv\Scripts\python.exe C:\ClimaTech\backend\scripts\probar_smtp.py tu_correo@gmail.com

Comprueba, en orden:
  1) que backend/.env tenga las variables SMTP (la contraseña no se imprime),
  2) que tu red pueda abrir conexión con el servidor en los puertos 587 y 465,
  3) un envío real de prueba usando la misma función que usa el sistema.
Así se distingue si el problema es de configuración, de red/antivirus o de credenciales.
"""

import os
import socket
import ssl
import sys
from pathlib import Path

# Permite ejecutarlo desde cualquier carpeta: se ubica la carpeta backend y su .env.
BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    print("Falta el paquete python-dotenv: estás usando un Python sin las dependencias del proyecto.")
    print(f"Activa el entorno virtual:  cd {BACKEND}  y luego  venv\\Scripts\\activate")
    raise SystemExit(1)

load_dotenv(BACKEND / ".env")


def _puerto_abierto(host: str, puerto: int) -> str:
    """Abre la conexión y espera el saludo «220» del servidor, como haría el envío real."""
    try:
        with socket.create_connection((host, puerto), timeout=8) as sock:
            if puerto == 465:
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=host)
            sock.settimeout(8)
            saludo = sock.recv(200).decode(errors="replace").strip()
    except ssl.SSLError as exc:
        return f"FALLA el cifrado SSL ({exc}). Suele ser un antivirus que intercepta el correo."
    except OSError as exc:
        return f"BLOQUEADO o inaccesible ({exc})"
    if saludo.startswith("220"):
        return f"OK ({saludo[:60]})"
    if not saludo:
        return ("conecta pero se CIERRA sin saludo: algo (antivirus, firewall o la red) corta la conexión. "
                "Prueba con los datos del celular o desactiva el escudo de correo del antivirus.")
    return f"respuesta inesperada: {saludo[:80]} (posible interceptación del antivirus)"


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python scripts\\probar_smtp.py destino@correo.com")
        return 1
    destino = sys.argv[1]

    host = (os.getenv("SMTP_HOST") or "").strip()
    puerto = os.getenv("SMTP_PORT", "587")
    usuario = (os.getenv("SMTP_USER") or "").strip()
    clave = (os.getenv("SMTP_PASSWORD") or "").replace(" ", "")

    print(f"1) Configuración leída de {BACKEND / '.env'}")
    if os.getenv("BREVO_API_KEY"):
        print("   BREVO_API_KEY está configurada: el sistema enviará por HTTPS (Brevo) y no por SMTP.")
    print(f"   SMTP_HOST     = {host or '(vacío)'}")
    print(f"   SMTP_PORT     = {puerto}")
    print(f"   SMTP_USER     = {usuario or '(vacío)'}")
    print(f"   SMTP_PASSWORD = {'(' + str(len(clave)) + ' caracteres)' if clave else '(vacío)'}")
    print(f"   SMTP_STARTTLS = {os.getenv('SMTP_STARTTLS', '1 (por defecto)')}")
    if not host and not os.getenv("BREVO_API_KEY"):
        print("   -> Falta SMTP_HOST. Para Gmail es smtp.gmail.com")
        return 1
    if host in ("gmail.com", "www.gmail.com"):
        print("   -> Con Gmail el servidor es smtp.gmail.com, no gmail.com")
    if "gmail" in host and len(clave) != 16:
        print(f"   -> PROBLEMA: las contraseñas de aplicación de Google tienen 16 letras y la tuya tiene {len(clave)}.")
        print("      Gmail no acepta tu contraseña normal. Crea una en https://myaccount.google.com/apppasswords")
        print("      (necesitas la verificación en dos pasos activada) y ponla en SMTP_PASSWORD.")
        print("      Si tu valor tiene el símbolo #, ponlo entre comillas: SMTP_PASSWORD=\"....\"")

    print("\n2) Conexión de red")
    for p in (587, 465) if host else ():
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