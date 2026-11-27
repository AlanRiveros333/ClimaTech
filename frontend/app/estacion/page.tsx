'use client'

// Apartado «Estación del aeropuerto»: compara el historial estimado por Open-Meteo con lo que midió la
// estación del aeropuerto Jorge Wilstermann y muestra cuánto mejora la corrección. Carga solo al entrar.
import { useState } from 'react'
import { Droplets, Plane, RefreshCw, Satellite, SlidersHorizontal, Thermometer, Wind } from 'lucide-react'
import NavBar from '@/components/nav-bar'
import { CardEstacion, type TarjetaEstacion } from '@/components/tarjetas-clima'
import {
  CajaError,
  Cargando,
  EnPalabras,
  Encabezado,
  Pasos,
  Pildoras,
  Portada,
  useDatosPanel,
  useEsAdmin,
  type Variable,
} from '@/components/paneles/ui'
import { apiFetch } from '@/lib/api'

type Respuesta = { texto: string; tarjetas: { tipo: string }[] }
type Paso = { dias?: number; filas?: number; omitido?: string; error?: string }

const VARIABLES = [
  { valor: 'temperatura', texto: 'Temperatura', icono: <Thermometer size={15} /> },
  { valor: 'humedad', texto: 'Humedad', icono: <Droplets size={15} /> },
  { valor: 'velocidad_viento', texto: 'Viento', icono: <Wind size={15} /> },
] as const

const MENSAJES_CARGA = [
  'Juntando los días con dato de Open-Meteo y de la estación…',
  'Midiendo cuánto se desvía la estimación…',
  'Probando correcciones con días que no se usaron para calcularlas…',
  'Revisando qué tan acertadas fueron las proyecciones guardadas…',
]

const PASOS = [
  {
    icono: <Satellite size={20} />,
    color: '#64748b',
    titulo: 'La estimación',
    texto:
      'Open-Meteo calcula el clima con satélites y modelos para un área grande. Es útil, pero en el valle puede marcar algunos grados menos de lo real.',
  },
  {
    icono: <Plane size={20} />,
    color: '#0B4F6C',
    titulo: 'La medición',
    texto: 'La estación del aeropuerto Jorge Wilstermann (código SLCB) mide la temperatura, la humedad y el viento cada hora. Es lo que realmente pasó.',
  },
  {
    icono: <SlidersHorizontal size={20} />,
    color: '#10b981',
    titulo: 'La corrección',
    texto:
      'ClimaTech aprende la diferencia entre ambas, la prueba con días que no vio y, si reduce el error, corrige el historial y los pronósticos.',
  },
]

export default function EstacionPage() {
  const [variable, setVariable] = useState<Variable>('temperatura')
  const { datos, error, cargando, recargar } = useDatosPanel<Respuesta>(`/paneles/estacion?variable=${variable}`)
  const admin = useEsAdmin()
  const [actualizando, setActualizando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const tarjeta = datos?.tarjetas.find((t) => t.tipo === 'estacion') as TarjetaEstacion | undefined

  async function actualizar() {
    setActualizando(true)
    setResultado(null)
    try {
      const r = await apiFetch<{ omitida?: string; ok?: boolean; segundos?: number; pasos?: Record<string, Paso> }>('/actualizacion/ejecutar', {
        method: 'POST',
      })
      if (r.omitida) {
        setResultado({ ok: true, texto: r.omitida })
      } else {
        const est = r.pasos?.estacion
        setResultado({
          ok: !!r.ok,
          texto:
            `${r.ok ? 'Actualización completa' : 'Actualización terminada con errores'} en ${r.segundos ?? '—'} s. ` +
            (est?.error ? `Estación: falló (${est.error.slice(0, 100)}).` : est?.omitido ? `Estación: ${est.omitido}` : `Estación: ${est?.dias ?? 0} día(s) revisado(s).`),
        })
        recargar()
      }
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo actualizar.' })
    } finally {
      setActualizando(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <Portada
        etiqueta="Estación del aeropuerto · Jorge Wilstermann"
        icono={<Plane size={14} />}
        titulo="Lo estimado contra"
        resaltado="lo que realmente se midió"
        texto="Aquí ves cuánto se equivoca el historial de Open-Meteo frente a la estación del aeropuerto de Cochabamba, y cuánto mejora después de corregirlo."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Pildoras oscuro etiqueta="Variable" opciones={VARIABLES} valor={variable} onCambio={(v) => setVariable(v)} />
          {admin && (
            <button
              onClick={actualizar}
              disabled={actualizando}
              className="inline-flex items-center gap-2 rounded-full border border-white/40 px-4 py-1.5 text-sm text-white transition hover:bg-white/10 disabled:opacity-60"
            >
              <RefreshCw size={14} className={actualizando ? 'animate-spin' : ''} />
              {actualizando ? 'Actualizando (1 a 2 min)…' : 'Actualizar mediciones ahora'}
            </button>
          )}
        </div>
      </Portada>

      <main className="relative z-10 mx-auto -mt-14 max-w-6xl space-y-10 px-4 pb-16">
        {resultado && <p className={resultado.ok ? 'alert-success' : 'alert-error'}>{resultado.texto}</p>}
        {cargando && <Cargando mensajes={MENSAJES_CARGA} />}
        {error && <CajaError mensaje={error} onReintentar={recargar} />}

        {datos && !cargando && (
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="min-w-0 animate-aparecer rounded-3xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/60 sm:p-6">
              {tarjeta ? (
                <CardEstacion t={tarjeta} />
              ) : (
                <p className="p-2 text-sm text-slate-600">
                  Todavía no hay mediciones de la estación guardadas.
                  {admin ? ' Usa «Actualizar mediciones ahora» para descargarlas.' : ' Pide al administrador que las descargue.'}
                </p>
              )}
            </div>
            <aside className="space-y-4">
              <EnPalabras texto={datos.texto} />
              <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
                <p className="font-semibold text-slate-900">Glosario rápido</p>
                <dl className="mt-3 space-y-2">
                  <div>
                    <dt className="font-medium text-slate-800">MAE (error medio)</dt>
                    <dd>Cuánto se equivoca en promedio, sin importar si es hacia arriba o hacia abajo. Menos es mejor.</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-800">RMSE</dt>
                    <dd>Parecido al MAE, pero castiga más los errores grandes.</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-800">Sesgo</dt>
                    <dd>Si la estimación tiende a quedarse corta (positivo) o a pasarse (negativo).</dd>
                  </div>
                </dl>
              </div>
            </aside>
          </div>
        )}

        <section className="space-y-6">
          <Encabezado etiqueta="Por qué importa" titulo="De la estimación a la medición" texto="Corregir el historial hace que las proyecciones partan de datos más cercanos a la realidad." />
          <Pasos pasos={PASOS} />
        </section>
      </main>
    </div>
  )
}
