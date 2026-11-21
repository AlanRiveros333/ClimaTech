r"""
Importa las mediciones de la estación del Aeropuerto Jorge Wilstermann (SLCB) y muestra
el impacto de usarlas para corregir el historial de Open-Meteo.

Uso (Windows), con el entorno virtual del backend activo:
    cd C:\ClimaTech\backend
    venv\Scripts\activate
    python scripts\importar_estacion.py              (importa el mismo período que tu historial)
    python scripts\importar_estacion.py --solo-informe
    python scripts\importar_estacion.py --solo-previos    (solo pronósticos pasados de todos los modelos)
    python scripts\importar_estacion.py --desde 2023-01-01 --hasta 2026-11-20

Antes, ejecuta una vez supabase/migrations/005_observaciones_estacion.sql en el SQL Editor de Supabase.
"""

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from app import estacion, mos  # noqa: E402
from app.auth import supabase_admin  # noqa: E402

MESES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
UNIDAD = {"temperatura": "°C", "humedad": "%", "velocidad_viento": "km/h"}


def periodo_del_historial() -> tuple[date, date]:
    def extremo(desc: bool) -> date:
        fila = supabase_admin.table("registros_diarios").select("fecha").order("fecha", desc=desc).limit(1).execute().data
        if not fila:
            raise SystemExit("No hay historial de Open-Meteo en la base. Importa datos primero.")
        return date.fromisoformat(fila[0]["fecha"])

    return extremo(False), extremo(True)


def informe(variable: str) -> None:
    u = UNIDAD[variable]
    print(f"\n==================== {variable.upper().replace('_', ' ')} ====================")
    try:
        r = estacion.evaluar_correccion(estacion.pares_open_meteo_estacion(variable), variable)
    except ValueError as exc:
        print(f"  {exc}")
        return
    print(f"  Días con dato en ambos: {r['dias_pares']} (del {r['desde'][:10]} al {r['hasta'][:10]})")
    print(f"  Prueba fuera de muestra: últimos {r['dias_prueba']} días (desde {r['prueba_desde'][:10]}), no usados para ajustar.\n")
    print(f"  {'Opción':34} {'MAE':>8} {'RMSE':>8} {'Sesgo':>8}")
    for o in r["opciones"]:
        marca = "  <- elegida" if o["metodo"] == r["elegido"] else ""
        print(f"  {o['nombre']:34} {o['mae']:>8.2f} {o['rmse']:>8.2f} {o['sesgo']:>+8.2f}{marca}")
    print(f"\n  Mejora frente a Open-Meteo sin corregir: {r['mejora_pct']:.0f} % menos error ({u}).")
    print("  (Sesgo positivo = la estación midió MÁS que Open-Meteo.)\n")
    print(f"  {'Mes':5} {'Días':>5} {'Open-Meteo':>11} {'Estación':>9} {'Corregido':>10} {'Sesgo':>7}")
    for m in r["mensual"]:
        print(
            f"  {MESES[m['mes']]:5} {m['dias']:>5} {m['open_meteo']:>11.1f} {m['estacion']:>9.1f} "
            f"{m['corregido']:>10.1f} {m['sesgo']:>+7.1f}"
        )
    informe_mos(variable)
    ver = estacion.verificar_proyecciones(variable)
    if ver:
        print(f"\n  Error REAL de las proyecciones guardadas (comparadas con la estación, en {u}):")
        for v in ver:
            tipo = "con corrección" if v["corregida"] else "sin corrección"
            print(f"  - {v['metodo']:18} {tipo:15} MAE {v['mae']:.2f}  sesgo {v['sesgo']:+.2f}  ({v['dias']} días, {v['proyecciones']} proyecciones)")


def informe_mos(variable: str) -> None:
    u = UNIDAD[variable]
    m = mos.obtener_mos(variable, forzar=True)
    if not m:
        print("\n  Modelo híbrido: sin datos suficientes (importa los pronósticos pasados y ejecuta las migraciones 006 y 007).")
        return
    print(f"\n  MODELO HÍBRIDO (pronóstico de Open-Meteo corregido con la estación)")
    print(f"  {m['fechas']} fechas con pronóstico pasado y medición; prueba en las últimas {m['fechas_prueba']} (desde {m['prueba_desde']}).")
    print(f"  Modelos meteorológicos usados ({len(m['modelos'])}): " + ", ".join(x["nombre"] for x in m["modelos"]))
    if m.get("descartados"):
        print(f"  Descartados (pocos datos para Cochabamba): {', '.join(m['descartados'])}")
    print(f"  {'Opción':44} {'MAE':>7} {'RMSE':>7} {'Sesgo':>7}   MAE por anticipación (1..7 días)")
    for o in m["opciones"]:
        marca = " <- elegida" if o["metodo"] == m["elegido"] else ""
        por_k = " ".join(f"{o['por_anticipacion'].get(k, float('nan')):.1f}" for k in mos.ANTICIPACIONES)
        print(f"  {o['nombre']:44} {o['mae']:>7.2f} {o['rmse']:>7.2f} {o['sesgo']:>+7.2f}   {por_k}{marca}")
    print(f"  Mejora frente a Open-Meteo sin corregir: {m['mejora_pct']:.0f} % ({u}).")
    imp = m.get("impacto_modelos")
    if imp:
        print(f"  IMPACTO DE USAR VARIOS MODELOS: un modelo {imp['un_modelo']['mae']:.2f} -> varios {imp['varios_modelos']['mae']:.2f} {u} ({imp['mejora_pct']:+.0f} %)")
    print(f"  Tramos: {m['fechas_entrenamiento']} fechas para aprender, {m['fechas_validacion']} para calcular los pesos, {m['fechas_prueba']} para calificar.")
    titulo = "Pesos usados en la combinación" if m["elegido"] == "ensamble" else "Pesos de la combinación (no se usa: no ganó)"
    print(f"  {titulo}: " + ", ".join(f"{p['nombre'].replace('Open-Meteo + ', '')} {p['peso'] * 100:.0f} %" for p in m["pesos"]))


def main() -> int:
    ap = argparse.ArgumentParser(description="Importa la estación SLCB y muestra el impacto de la corrección.")
    ap.add_argument("--desde", type=date.fromisoformat)
    ap.add_argument("--hasta", type=date.fromisoformat)
    ap.add_argument("--solo-informe", action="store_true", help="no descarga, solo muestra el informe")
    ap.add_argument("--sin-previos", action="store_true", help="no descarga los pronósticos pasados de Open-Meteo")
    ap.add_argument("--solo-previos", action="store_true", help="solo descarga los pronósticos pasados (no la estación)")
    args = ap.parse_args()

    if not args.solo_informe:
        inicio, fin = periodo_del_historial()
        inicio = args.desde or inicio
        fin = min(args.hasta or fin, date.today() - timedelta(days=1))
        if not args.solo_previos:
            print(f"Descargando reportes METAR de {estacion.NOMBRE_ESTACION} del {inicio} al {fin}...")
            print("(La Iowa Environmental Mesonet entrega un año por pedido; puede tardar un minuto.)")
            horario = estacion.descargar_iem(inicio, fin)
            dias = estacion.resumir_por_dia(horario)
            completos = sum(1 for d in dias if d["temperatura"] is not None)
            print(f"Lecturas horarias: {len(horario)} | días con reportes: {len(dias)} | días completos (>= {estacion.HORAS_MINIMAS} h): {completos}")
            if not dias:
                print("La estación no tiene reportes en ese período.")
                return 1
            try:
                estacion.guardar_observaciones(dias)
            except Exception as exc:
                print(f"No se pudo guardar: {exc}\n¿Ejecutaste la migración 005_observaciones_estacion.sql en Supabase?")
                return 1
            print("Guardado en la tabla observaciones_estacion.")

        if not args.sin_previos:
            print(f"\nDescargando pronósticos pasados de Open-Meteo (1 a 7 días de anticipación) desde {max(inicio, mos.INICIO_DATOS)}...")
            try:
                errores_modelos: dict = {}
                for modelo in [mos.PRINCIPAL] + mos.modelos_extra():
                    print(f"  - {mos.nombre_modelo(modelo)}...", end=" ", flush=True)
                    try:
                        filas = mos.descargar_previos_modelo(modelo, inicio, fin)
                        mos.guardar_previos(filas)
                        print(f"{len(filas)} filas")
                    except Exception as exc:
                        if modelo == mos.PRINCIPAL:
                            raise
                        errores_modelos[modelo] = str(exc)
                        print(f"no disponible ({str(exc)[:120]})")
            except Exception as exc:
                print(f"No se pudieron importar los pronósticos pasados: {exc}")
                print("¿Ejecutaste las migraciones 006 y 007 en Supabase?")

    for variable in estacion.VARIABLES:
        informe(variable)
    print("\nListo. Reinicia el backend para que las proyecciones usen los modelos nuevos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
