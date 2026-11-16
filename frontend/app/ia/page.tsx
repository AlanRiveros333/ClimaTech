'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Brain, Sparkles } from 'lucide-react'
import NavBar from '@/components/nav-bar'
import { apiFetch } from '@/lib/api'

const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura (°C)', unidad: '°C' },
  { value: 'humedad', label: 'Humedad (%)', unidad: '%' },
  { value: 'velocidad_viento', label: 'Velocidad del viento (km/h)', unidad: 'km/h' },
]

const COLORES: Record<string, string> = {
  real: '#0f172a',
  historico: '#0f172a',
  persistencia: '#94a3b8',
  promedio_movil: '#0ea5e9',
  holt: '#16a34a',
  regresion_lineal: '#d97706',
  random_forest: '#7c3aed',
  gradient_boosting: '#db2777',
}

type PuntoPrueba = { fecha: string; real: number; predicho: number }
type PuntoValor = { fecha: string; valor: number }
type Resultado = {
  metodo: string
  nombre: string
  es_ml: boolean
  mae: number
  rmse: number
  mejora_vs_referencia_pct: number | null
  prueba: PuntoPrueba[]
  proyeccion: PuntoValor[]
}
type Respuesta = {
  variable: string
  dias_entrenamiento: number
  dias_prueba: number
  resultados: Resultado[]
  omitidos: { metodo: string; nombre: string; motivo: string }[]
  mejor_metodo: string | null
  supera_referencia: boolean
  historico: PuntoValor[]
  enso: { usado: boolean; varia: boolean | null; evento_actual: string | null }
  advertencias: string[]
}

type Fila = { fecha: string } & Record<string, number | string | undefined>

// Une varias series (clave -> puntos) en filas por fecha, ordenadas.
function fusionar(series: Record<string, { fecha: string; v: number }[]>): Fila[] {
  const mapa = new Map<string, Fila>()
  for (const [clave, puntos] of Object.entries(series)) {
    for (const p of puntos) {
      const fila = mapa.get(p.fecha) ?? { fecha: p.fecha }
      fila[clave] = p.v
      mapa.set(p.fecha, fila)
    }
  }
  return [...mapa.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export default function IaPage() {
  const [variable, setVariable] = useState('temperatura')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [diasProyectar, setDiasProyectar] = useState(7)
  const [diasPrueba, setDiasPrueba] = useState(7)
  const [usarEnso, setUsarEnso] = useState(false)

  const [resultado, setResultado] = useState<Respuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [explicacion, setExplicacion] = useState<{ texto: string; origen: string } | null>(null)
  const [explicando, setExplicando] = useState(false)

  const unidad = VARIABLES.find((v) => v.value === variable)?.unidad ?? ''

  async function handleComparar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setExplicacion(null)
    setCargando(true)
    try {
      const data = await apiFetch<Respuesta>('/ia/comparar', {
        method: 'POST',
        body: JSON.stringify({
          variable,
          periodo_inicio: periodoInicio,
          periodo_fin: periodoFin,
          dias_a_proyectar: diasProyectar,
          dias_prueba: diasPrueba,
          usar_enso: usarEnso,
        }),
      })
      setResultado(data)
    } catch (err) {
      setResultado(null)
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setCargando(false)
    }
  }

  async function handleExplicar() {
    if (!resultado) return
    setExplicando(true)
    try {
      const mejor = resultado.resultados.find((r) => r.metodo === resultado.mejor_metodo)
      const data = await apiFetch<{ texto: string; origen: string }>('/ia/explicar', {
        method: 'POST',
        body: JSON.stringify({
          variable: resultado.variable,
          dias_prueba: resultado.dias_prueba,
          mejor_metodo: mejor?.nombre ?? null,
          supera_referencia: resultado.supera_referencia,
          usar_enso: resultado.enso.usado,
          metodos: resultado.resultados.map((r) => ({ nombre: r.nombre, mae: r.mae, rmse: r.rmse })),
        }),
      })
      setExplicacion(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setExplicando(false)
    }
  }

  // Gráfico 1: últimos días de prueba, real vs. predicho por cada método
  const datosPrueba = resultado
    ? fusionar({
        real: resultado.resultados[0].prueba.map((p) => ({ fecha: p.fecha, v: p.real })),
        ...Object.fromEntries(
          resultado.resultados.map((r) => [r.metodo, r.prueba.map((p) => ({ fecha: p.fecha, v: p.predicho }))])
        ),
      })
    : []

  // Gráfico 2: histórico reciente + proyección a futuro de cada método
  const datosFuturo = resultado
    ? fusionar({
        historico: resultado.historico.map((p) => ({ fecha: p.fecha, v: p.valor })),
        ...Object.fromEntries(
          resultado.resultados.map((r) => [r.metodo, r.proyeccion.map((p) => ({ fecha: p.fecha, v: p.valor }))])
        ),
      })
    : []

  const nombres: Record<string, string> = resultado
    ? { real: 'Real', historico: 'Histórico', ...Object.fromEntries(resultado.resultados.map((r) => [r.metodo, r.nombre])) }
    : {}

  const claves = resultado ? resultado.resultados.map((r) => r.metodo) : []

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#7c3aed]/10">
            <Brain size={22} color="#7c3aed" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Comparador de modelos (IA)</h1>
            <p className="text-sm text-slate-500">
              Compara métodos estadísticos y de Machine Learning reservando los últimos días como prueba
            </p>
          </div>
        </div>

        <form
          onSubmit={handleComparar}
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Variable</label>
            <select
              value={variable}
              onChange={(e) => setVariable(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {VARIABLES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Histórico desde</label>
            <input
              type="date"
              required
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Hasta</label>
            <input
              type="date"
              required
              value={periodoFin}
              onChange={(e) => setPeriodoFin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Días a proyectar</label>
            <input
              type="number"
              min={1}
              max={30}
              value={diasProyectar}
              onChange={(e) => setDiasProyectar(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Días de prueba (no se usan para entrenar)
            </label>
            <input
              type="number"
              min={3}
              max={60}
              value={diasPrueba}
              onChange={(e) => setDiasPrueba(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={usarEnso}
              onChange={(e) => setUsarEnso(e.target.checked)}
              className="h-4 w-4"
            />
            Incluir fase de El Niño / La Niña
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#0E7C9B] py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {cargando ? 'Entrenando y comparando modelos...' : 'Comparar modelos'}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 md:col-span-3">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-400 md:col-span-3">
            Recomendado: al menos 90 días de histórico (idealmente uno o más años). Los modelos de IA se omiten si
            hay menos de 60 días de entrenamiento.
          </p>
        </form>

        {resultado && (
          <>
            {resultado.advertencias.map((a) => (
              <div key={a} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                ⚠️ {a}
              </div>
            ))}

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Resultados en los últimos {resultado.dias_prueba} días</h2>
              <p className="mb-4 text-sm text-slate-500">
                Entrenados con {resultado.dias_entrenamiento} días. Menor error = mejor. La referencia simple repite
                el último valor observado.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4">Método</th>
                      <th className="py-2 pr-4">MAE ({unidad})</th>
                      <th className="py-2 pr-4">RMSE ({unidad})</th>
                      <th className="py-2 pr-4">Mejora vs. referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.resultados.map((r) => {
                      const esMejor = r.metodo === resultado.mejor_metodo
                      return (
                        <tr
                          key={r.metodo}
                          className={`border-b border-slate-100 ${esMejor ? 'bg-emerald-50 font-medium' : ''} text-slate-700`}
                        >
                          <td className="py-2 pr-4">
                            <span
                              className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: COLORES[r.metodo] }}
                            />
                            {r.nombre}
                            {esMejor && <span className="ml-2 text-xs text-emerald-700">★ mejor</span>}
                          </td>
                          <td className="py-2 pr-4">{r.mae}</td>
                          <td className="py-2 pr-4">{r.rmse}</td>
                          <td className="py-2 pr-4">
                            {r.mejora_vs_referencia_pct === null ? '—' : `${r.mejora_vs_referencia_pct}%`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {!resultado.supera_referencia && (
                <p className="mt-3 text-sm text-amber-700">
                  Ningún método superó a la referencia: con estos datos, los modelos más complejos no mejoran el
                  resultado.
                </p>
              )}
              {resultado.omitidos.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-xs text-slate-500">
                  {resultado.omitidos.map((o) => (
                    <li key={o.metodo}>
                      {o.nombre} no se ejecutó: {o.motivo}
                    </li>
                  ))}
                </ul>
              )}
              {resultado.enso.usado && (
                <p className="mt-3 text-xs text-slate-500">
                  Fase ENSO incluida{resultado.enso.evento_actual ? ` (evento en curso: ${resultado.enso.evento_actual})` : ''}
                  {resultado.enso.varia === false ? '. No cambió dentro del período, por lo que no aportó información.' : '.'}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">Prueba: real vs. predicho</h2>
              <p className="mb-4 text-sm text-slate-500">Lo que cada modelo predijo para los días que no vio al entrenar.</p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={datosPrueba}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Legend formatter={(v) => nombres[String(v)] ?? String(v)} />
                  <Line type="monotone" dataKey="real" stroke={COLORES.real} strokeWidth={3} dot name="real" />
                  {claves.map((k) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={COLORES[k]} dot={false} name={k} strokeDasharray={k === 'persistencia' ? '4 4' : undefined} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">Proyección a futuro</h2>
              <p className="mb-4 text-sm text-slate-500">Cada modelo reentrenado con toda la serie.</p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={datosFuturo}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Legend formatter={(v) => nombres[String(v)] ?? String(v)} />
                  <Line type="monotone" dataKey="historico" stroke={COLORES.historico} strokeWidth={2} dot={false} name="historico" />
                  {claves.map((k) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={COLORES[k]} dot={false} name={k} strokeDasharray="5 5" />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Explicación en lenguaje sencillo</h2>
                <button
                  type="button"
                  onClick={handleExplicar}
                  disabled={explicando}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  {explicando ? 'Generando...' : 'Explicar resultados'}
                </button>
              </div>
              {explicacion && (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700">{explicacion.texto}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {explicacion.origen === 'llm' ? 'Generado con un modelo de lenguaje.' : 'Generado con la plantilla local del sistema.'}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
