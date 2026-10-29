'use client'

import { useEffect, useState } from 'react'
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
import {
  Thermometer,
  Droplets,
  Wind,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  TriangleAlert,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, CardTitle } from '@/components/page-shell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura (°C)', unidad: '°C', Icono: Thermometer, color: '#c26a05' },
  { value: 'humedad', label: 'Humedad (%)', unidad: '%', Icono: Droplets, color: '#0f6a88' },
  {
    value: 'velocidad_viento',
    label: 'Velocidad del viento (km/h)',
    unidad: 'km/h',
    Icono: Wind,
    color: '#0b4f6c',
  },
] as const

const METODOS = [
  { value: 'promedio_movil', label: 'Promedio móvil' },
  { value: 'holt', label: 'Método de Holt' },
  { value: 'regresion_lineal', label: 'Regresión lineal múltiple' },
]

type Punto = { fecha: string; valor: number }
type PuntoGrafico = { fecha: string; historico?: number; proyectado?: number }
type LecturaHora = { hora: string; valor: number | null }

function nombreDia(fechaIso: string) {
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const fecha = new Date(fechaIso + 'T00:00:00')
  return dias[fecha.getDay()]
}

function fechaCorta(fechaIso: string) {
  const fecha = new Date(fechaIso + 'T00:00:00')
  return `${fecha.getDate()}/${fecha.getMonth() + 1}`
}

function horaCorta(horaStr: string) {
  return horaStr.slice(0, 5) // "14:00:00" -> "14:00"
}

export default function ProyeccionesPage() {
  const supabase = createClient()

  const [variable, setVariable] = useState<(typeof VARIABLES)[number]['value']>('temperatura')
  const [metodo, setMetodo] = useState('promedio_movil')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [diasAProyectar, setDiasAProyectar] = useState(7)

  const [historico, setHistorico] = useState<Punto[]>([])
  const [proyeccion, setProyeccion] = useState<Punto[]>([])
  const [datosGrafico, setDatosGrafico] = useState<PuntoGrafico[]>([])
  const [metricas, setMetricas] = useState<{ mae: number; rmse: number; r2: number | null } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [advertencia, setAdvertencia] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [verDetalleTecnico, setVerDetalleTecnico] = useState(false)

  const [horasHoy, setHorasHoy] = useState<LecturaHora[]>([])
  const [fechaClimaHora, setFechaClimaHora] = useState<string | null>(null)

  const infoVariable = VARIABLES.find((v) => v.value === variable)!

  // ---------- Clima por hora: última fecha con datos registrados ----------
  useEffect(() => {
    async function cargarClimaPorHora() {
      const { data: ultimo } = await supabase
        .from('registros_climaticos')
        .select('fecha')
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!ultimo) return

      const { data: horas } = await supabase
        .from('registros_climaticos')
        .select(`hora, ${variable}`)
        .eq('fecha', ultimo.fecha)
        .order('hora', { ascending: true })

      setFechaClimaHora(ultimo.fecha)
      setHorasHoy(
        ((horas as unknown as Record<string, number | null>[]) ?? []).map((h) => ({
          hora: h.hora as unknown as string,
          valor: h[variable] as number | null,
        }))
      )
    }
    cargarClimaPorHora()
  }, [variable, supabase])

  async function handleGenerar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAdvertencia(null)
    setCargando(true)
    setMetricas(null)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      setError('Sesión expirada, vuelve a iniciar sesión.')
      setCargando(false)
      return
    }

    try {
      const res = await fetch(`${API_URL}/proyecciones/generar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          variable,
          metodo,
          periodo_inicio: periodoInicio,
          periodo_fin: periodoFin,
          dias_a_proyectar: diasAProyectar,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'No se pudo generar la proyección.')
        setCargando(false)
        return
      }

      const historicoData: Punto[] = data.historico
      const proyeccionData: Punto[] = data.proyeccion

      setHistorico(historicoData)
      setProyeccion(proyeccionData)

      const historicoGrafico: PuntoGrafico[] = historicoData.map((p) => ({
        fecha: p.fecha,
        historico: p.valor,
      }))
      const proyeccionGrafico: PuntoGrafico[] = proyeccionData.map((p) => ({
        fecha: p.fecha,
        proyectado: p.valor,
      }))

      setDatosGrafico([...historicoGrafico, ...proyeccionGrafico])
      setMetricas(data.metricas)
      setAdvertencia(data.advertencia ?? null)
    } catch {
      setError('No se pudo conectar con el servidor backend.')
    } finally {
      setCargando(false)
    }
  }

  // ---------- Cálculos para el resumen "tipo clima" ----------
  const ultimosHistoricos = historico.slice(-7)
  const promedioReciente =
    ultimosHistoricos.length > 0
      ? ultimosHistoricos.reduce((acc, p) => acc + p.valor, 0) / ultimosHistoricos.length
      : null
  const promedioProyectado =
    proyeccion.length > 0 ? proyeccion.reduce((acc, p) => acc + p.valor, 0) / proyeccion.length : null

  const proyMin = proyeccion.length > 0 ? Math.min(...proyeccion.map((p) => p.valor)) : null
  const proyMax = proyeccion.length > 0 ? Math.max(...proyeccion.map((p) => p.valor)) : null
  const histMin = historico.length > 0 ? Math.min(...historico.map((p) => p.valor)) : null
  const histMax = historico.length > 0 ? Math.max(...historico.map((p) => p.valor)) : null

  let tendencia: 'sube' | 'baja' | 'estable' | null = null
  if (promedioReciente !== null && promedioProyectado !== null) {
    const diferencia = promedioProyectado - promedioReciente
    const umbral = infoVariable.value === 'humedad' ? 2 : infoVariable.value === 'velocidad_viento' ? 1 : 0.5
    tendencia = diferencia > umbral ? 'sube' : diferencia < -umbral ? 'baja' : 'estable'
  }

  const IconoTendencia = tendencia === 'sube' ? TrendingUp : tendencia === 'baja' ? TrendingDown : Minus
  const colorTendencia =
    tendencia === 'sube' ? 'text-orange-700' : tendencia === 'baja' ? 'text-blue-700' : 'text-slate-600'

  const fraseAmigable = () => {
    if (promedioProyectado === null || promedioReciente === null) return null
    const valorTexto = `${promedioProyectado.toFixed(1)}${infoVariable.unidad}`
    const refTexto = `${promedioReciente.toFixed(1)}${infoVariable.unidad}`
    if (tendencia === 'sube') {
      return `Se espera que ${infoVariable.label.toLowerCase()} suba a un promedio de ${valorTexto} en los próximos ${diasAProyectar} días, por encima del promedio reciente de ${refTexto}.`
    }
    if (tendencia === 'baja') {
      return `Se espera que ${infoVariable.label.toLowerCase()} baje a un promedio de ${valorTexto} en los próximos ${diasAProyectar} días, por debajo del promedio reciente de ${refTexto}.`
    }
    return `Se espera que ${infoVariable.label.toLowerCase()} se mantenga estable, alrededor de ${valorTexto} en los próximos ${diasAProyectar} días.`
  }

  const horasConDato = horasHoy.filter((h) => h.valor !== null)
  const horaMin = horasConDato.length > 0 ? Math.min(...horasConDato.map((h) => h.valor as number)) : null
  const horaMax = horasConDato.length > 0 ? Math.max(...horasConDato.map((h) => h.valor as number)) : null

  return (
    <PageShell width="max-w-4xl">
      <PageHeader
        icon={TrendingUp}
        title="Proyección climática"
        description="Estimación a futuro basada en el historial registrado de Cochabamba."
      />

      {/* ---------- Selector de variable ---------- */}
      <div role="radiogroup" aria-label="Variable climática" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {VARIABLES.map((v) => {
          const activa = variable === v.value
          return (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setVariable(v.value)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                activa
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <v.Icono size={16} aria-hidden />
              {v.label.split(' (')[0]}
            </button>
          )
        })}
      </div>

      {/* ---------- Clima por hora (último día registrado) ---------- */}
      {horasHoy.length > 0 && (
        <section className="card p-5" aria-label="Clima por hora">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Por hora — último día registrado {fechaClimaHora && `(${fechaCorta(fechaClimaHora)})`}
            </h2>
            {horaMin !== null && horaMax !== null && (
              <span className="flex items-center gap-3 text-xs text-slate-600">
                <span className="flex items-center gap-0.5">
                  <ArrowUp size={12} className="text-orange-600" aria-hidden />
                  <span className="sr-only">Máximo</span>
                  {horaMax.toFixed(1)}
                  {infoVariable.unidad}
                </span>
                <span className="flex items-center gap-0.5">
                  <ArrowDown size={12} className="text-blue-600" aria-hidden />
                  <span className="sr-only">Mínimo</span>
                  {horaMin.toFixed(1)}
                  {infoVariable.unidad}
                </span>
              </span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {horasHoy
              .filter((h) => h.valor !== null)
              .map((h) => (
                <div
                  key={h.hora}
                  className="flex min-w-[68px] flex-col items-center gap-1 rounded-lg bg-slate-50 px-2 py-2.5"
                >
                  <span className="text-xs text-slate-500">{horaCorta(h.hora)}</span>
                  <infoVariable.Icono size={16} color={infoVariable.color} aria-hidden />
                  <span className="text-sm font-medium tabular-nums text-slate-900">
                    {h.valor?.toFixed(1)}
                    {infoVariable.unidad}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ---------- Formulario ---------- */}
      <form onSubmit={handleGenerar} className="card p-5 sm:p-6">
        <CardTitle
          title="Configurar proyección"
          description="Elige el método, el historial a usar y cuántos días proyectar."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="metodo" className="label">
              Método
            </label>
            <select id="metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)} className="input">
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dias" className="label">
              Días a proyectar (1 a 30)
            </label>
            <input
              id="dias"
              type="number"
              min={1}
              max={30}
              inputMode="numeric"
              value={diasAProyectar}
              onChange={(e) => setDiasAProyectar(Number(e.target.value))}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="hist-desde" className="label">
              Histórico desde
            </label>
            <input
              id="hist-desde"
              type="date"
              required
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="hist-hasta" className="label">
              Hasta
            </label>
            <input
              id="hist-hasta"
              type="date"
              required
              value={periodoFin}
              onChange={(e) => setPeriodoFin(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="alert-error mt-4">
            {error}
          </p>
        )}

        <button type="submit" disabled={cargando} className="btn-primary mt-5 w-full sm:w-auto">
          {cargando ? 'Generando…' : 'Generar proyección'}
        </button>
      </form>

      {/* ---------- Advertencia por datos insuficientes ---------- */}
      {advertencia && (
        <div role="status" className="alert-warn flex items-start gap-3">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>{advertencia}</p>
        </div>
      )}

      {/* ---------- Resumen de la proyección ---------- */}
      {proyeccion.length > 0 && (
        <section className="space-y-4" aria-label="Resultado de la proyección">
          <div className="card p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${infoVariable.color}1a` }}
              >
                <infoVariable.Icono size={24} color={infoVariable.color} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
                    {promedioProyectado?.toFixed(1)}
                    <span className="ml-0.5 text-lg font-normal text-slate-500">{infoVariable.unidad}</span>
                  </p>
                  {tendencia && (
                    <span className={`flex items-center gap-1 text-sm font-medium ${colorTendencia}`}>
                      <IconoTendencia size={16} aria-hidden />
                      {tendencia === 'sube' ? 'En aumento' : tendencia === 'baja' ? 'En descenso' : 'Estable'}
                    </span>
                  )}
                  {proyMax !== null && proyMin !== null && (
                    <span className="flex items-center gap-3 text-sm text-slate-600">
                      <span className="flex items-center gap-0.5">
                        <ArrowUp size={12} className="text-orange-600" aria-hidden />
                        <span className="sr-only">Máximo proyectado</span>
                        {proyMax.toFixed(1)}
                        {infoVariable.unidad}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <ArrowDown size={12} className="text-blue-600" aria-hidden />
                        <span className="sr-only">Mínimo proyectado</span>
                        {proyMin.toFixed(1)}
                        {infoVariable.unidad}
                      </span>
                    </span>
                  )}
                </div>
                <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">{fraseAmigable()}</p>
              </div>
            </div>

            {histMin !== null && histMax !== null && (
              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-slate-100 pt-4 text-sm">
                <div>
                  <dt className="inline text-slate-500">Histórico mínimo: </dt>
                  <dd className="inline font-medium tabular-nums text-slate-800">
                    {histMin.toFixed(1)}
                    {infoVariable.unidad}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-slate-500">Histórico máximo: </dt>
                  <dd className="inline font-medium tabular-nums text-slate-800">
                    {histMax.toFixed(1)}
                    {infoVariable.unidad}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {/* Tira de pronóstico diario */}
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {proyeccion.map((p) => (
              <div
                key={p.fecha}
                className="card flex min-w-[88px] flex-col items-center gap-0.5 px-3 py-3"
              >
                <span className="text-xs font-medium text-slate-700">{nombreDia(p.fecha)}</span>
                <span className="text-xs text-slate-500">{fechaCorta(p.fecha)}</span>
                <infoVariable.Icono size={18} color={infoVariable.color} className="my-1.5" aria-hidden />
                <span className="text-sm font-semibold tabular-nums text-slate-900">
                  {p.valor.toFixed(1)}
                  {infoVariable.unidad}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Detalle técnico (colapsable) ---------- */}
      {datosGrafico.length > 0 && (
        <section className="card">
          <button
            type="button"
            onClick={() => setVerDetalleTecnico((v) => !v)}
            aria-expanded={verDetalleTecnico}
            aria-controls="detalle-tecnico"
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-slate-800 sm:px-6"
          >
            Detalle técnico: gráfico y métricas de error
            <ChevronDown
              size={18}
              className={`shrink-0 text-slate-500 transition-transform ${verDetalleTecnico ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>

          {verDetalleTecnico && (
            <div id="detalle-tecnico" className="space-y-6 border-t border-slate-100 px-5 pb-6 pt-5 sm:px-6">
              {metricas && (
                <dl className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3 text-center sm:p-4">
                    <dt className="text-xs text-slate-600">MAE</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 sm:text-xl">{metricas.mae}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-center sm:p-4">
                    <dt className="text-xs text-slate-600">RMSE</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 sm:text-xl">{metricas.rmse}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-center sm:p-4">
                    <dt className="text-xs text-slate-600">R²</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 sm:text-xl">{metricas.r2 ?? '—'}</dd>
                  </div>
                </dl>
              )}
              <p className="text-xs leading-relaxed text-slate-500">
                MAE y RMSE se expresan en la unidad de la variable; mientras más bajos, mejor ajuste al histórico.
                R² solo aplica a la regresión lineal.
              </p>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Histórico vs. proyección</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={datosGrafico} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#475569' }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="historico"
                      stroke="#0f6a88"
                      strokeWidth={2}
                      name="Histórico"
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="proyectado"
                      stroke="#c26a05"
                      strokeWidth={2}
                      name="Proyectado"
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      )}
    </PageShell>
  )
}
