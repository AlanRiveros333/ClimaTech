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
  TriangleAlert,
  ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/nav-bar'
import PageHeader from '@/components/page-header'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura (°C)', unidad: '°C', Icono: Thermometer, color: '#c2570c' },
  { value: 'humedad', label: 'Humedad (%)', unidad: '%', Icono: Droplets, color: '#1f5fbf' },
  {
    value: 'velocidad_viento',
    label: 'Velocidad del viento (km/h)',
    unidad: 'km/h',
    Icono: Wind,
    color: '#0f766e',
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
  const estiloTendencia =
    tendencia === 'sube'
      ? 'bg-warn-soft text-warn'
      : tendencia === 'baja'
        ? 'bg-accent-soft text-accent-strong'
        : 'bg-canvas text-ink-2'

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

  // Altura de la barra de cada hora, relativa al rango del día (solo presentación)
  const alturaBarra = (valor: number) => {
    if (horaMin === null || horaMax === null) return 8
    const rango = horaMax - horaMin || 1
    return 8 + ((valor - horaMin) / rango) * 32
  }

  return (
    <div className="min-h-dvh">
      <NavBar />
      <main id="contenido" className="page space-y-8 py-8 sm:py-10">
        <PageHeader
          titulo="Proyección climática"
          descripcion="Estimación a futuro basada en el historial registrado de Cochabamba. Son métodos estadísticos básicos, no un pronóstico meteorológico."
        />

        {/* ---------- Selector de variable (control segmentado) ---------- */}
        <div
          role="group"
          aria-label="Variable climática"
          className="inline-flex w-full gap-1 rounded-xl bg-line/60 p-1 sm:w-auto"
        >
          {VARIABLES.map((v) => {
            const activa = variable === v.value
            return (
              <button
                key={v.value}
                type="button"
                aria-pressed={activa}
                onClick={() => setVariable(v.value)}
                className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-out-strong active:scale-[0.97] sm:flex-none ${
                  activa
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-ink-2 hover:bg-surface/60 hover:text-ink'
                }`}
              >
                <v.Icono size={16} strokeWidth={1.75} color={activa ? v.color : undefined} />
                {v.label.split(' (')[0]}
              </button>
            )
          })}
        </div>

        {/* ---------- Clima por hora (último día registrado) ---------- */}
        {horasHoy.length > 0 && (
          <section aria-labelledby="titulo-por-hora" className="card p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titulo-por-hora" className="card-title">
                Clima por hora
                {fechaClimaHora && (
                  <span className="ml-2 text-sm font-normal text-ink-2">
                    {fechaCorta(fechaClimaHora)}
                  </span>
                )}
              </h2>
              {horaMin !== null && horaMax !== null && (
                <p className="flex items-center gap-4 text-xs tabular-nums text-ink-2">
                  <span className="flex items-center gap-1">
                    <ArrowUp size={12} strokeWidth={2} className="text-warn" />
                    <span className="sr-only">Máximo</span>
                    {horaMax.toFixed(1)}
                    {infoVariable.unidad}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowDown size={12} strokeWidth={2} className="text-accent" />
                    <span className="sr-only">Mínimo</span>
                    {horaMin.toFixed(1)}
                    {infoVariable.unidad}
                  </span>
                </p>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {horasHoy
                .filter((h) => h.valor !== null)
                .map((h) => (
                  <div
                    key={h.hora}
                    className="flex min-w-[56px] flex-col items-center justify-end gap-1.5 rounded-lg px-1 py-2 transition-colors duration-150 hover:bg-canvas"
                  >
                    <span className="text-xs font-medium tabular-nums text-ink">
                      {h.valor?.toFixed(1)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="w-1.5 rounded-full"
                      style={{
                        height: alturaBarra(h.valor as number),
                        backgroundColor: infoVariable.color,
                        opacity: 0.8,
                      }}
                    />
                    <span className="text-xs tabular-nums text-ink-3">{horaCorta(h.hora)}</span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* ---------- Formulario ---------- */}
        <form onSubmit={handleGenerar} className="card grid gap-5 p-6 md:grid-cols-2">
          <div>
            <label htmlFor="metodo" className="field-label">
              Método
            </label>
            <select
              id="metodo"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className="field"
            >
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dias" className="field-label">
              Días a proyectar
            </label>
            <input
              id="dias"
              type="number"
              min={1}
              max={30}
              value={diasAProyectar}
              onChange={(e) => setDiasAProyectar(Number(e.target.value))}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="periodo-inicio" className="field-label">
              Histórico desde
            </label>
            <input
              id="periodo-inicio"
              type="date"
              required
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="periodo-fin" className="field-label">
              Hasta
            </label>
            <input
              id="periodo-fin"
              type="date"
              required
              value={periodoFin}
              onChange={(e) => setPeriodoFin(e.target.value)}
              className="field"
            />
          </div>

          {error && (
            <p role="alert" className="alert alert-error md:col-span-2">
              {error}
            </p>
          )}

          <div className="md:col-span-2">
            <button type="submit" disabled={cargando} className="btn btn-primary w-full sm:w-auto">
              {cargando ? 'Generando...' : 'Generar proyección'}
            </button>
          </div>
        </form>

        {/* ---------- Advertencia por datos insuficientes ---------- */}
        {advertencia && (
          <div role="status" className="alert alert-warn reveal">
            <TriangleAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <p>{advertencia}</p>
          </div>
        )}

        {/* ---------- Resumen tipo "app de clima" ---------- */}
        {proyeccion.length > 0 && (
          <section aria-label="Resumen de la proyección" className="reveal space-y-4">
            <div className="card p-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-xl"
                  style={{ backgroundColor: `${infoVariable.color}1a` }}
                >
                  <infoVariable.Icono size={22} strokeWidth={1.75} color={infoVariable.color} />
                </span>
                <p className="text-4xl font-semibold tabular-nums tracking-tight text-ink">
                  {promedioProyectado?.toFixed(1)}
                  <span className="ml-1 text-lg font-normal text-ink-2">{infoVariable.unidad}</span>
                </p>
                {tendencia && (
                  <span className={`badge py-1 text-sm ${estiloTendencia}`}>
                    <IconoTendencia size={14} strokeWidth={2} />
                    {tendencia === 'sube' ? 'En aumento' : tendencia === 'baja' ? 'En descenso' : 'Estable'}
                  </span>
                )}
                {proyMax !== null && proyMin !== null && (
                  <p className="flex items-center gap-3 text-sm tabular-nums text-ink-2">
                    <span className="flex items-center gap-1">
                      <ArrowUp size={13} strokeWidth={2} className="text-warn" />
                      <span className="sr-only">Máxima proyectada</span>
                      {proyMax.toFixed(1)}
                      {infoVariable.unidad}
                    </span>
                    <span className="flex items-center gap-1">
                      <ArrowDown size={13} strokeWidth={2} className="text-accent" />
                      <span className="sr-only">Mínima proyectada</span>
                      {proyMin.toFixed(1)}
                      {infoVariable.unidad}
                    </span>
                  </p>
                )}
              </div>

              <p className="mt-4 max-w-[65ch] text-sm leading-relaxed text-ink-2">{fraseAmigable()}</p>

              {histMin !== null && histMax !== null && (
                <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-ink-2">Histórico mínimo</dt>
                    <dd className="font-medium tabular-nums text-ink">
                      {histMin.toFixed(1)}
                      {infoVariable.unidad}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-ink-2">Histórico máximo</dt>
                    <dd className="font-medium tabular-nums text-ink">
                      {histMax.toFixed(1)}
                      {infoVariable.unidad}
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Tira de pronóstico diario */}
            <ol className="flex snap-x gap-2 overflow-x-auto pb-2">
              {proyeccion.map((p) => (
                <li
                  key={p.fecha}
                  className="card flex min-w-[88px] snap-start flex-col items-center gap-0.5 px-3 py-3"
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-2">
                    {nombreDia(p.fecha)}
                  </span>
                  <span className="text-xs tabular-nums text-ink-3">{fechaCorta(p.fecha)}</span>
                  <span className="mt-2 text-base font-semibold tabular-nums text-ink">
                    {p.valor.toFixed(1)}
                    <span className="text-xs font-normal text-ink-2">{infoVariable.unidad}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ---------- Detalle técnico (colapsable) ---------- */}
        {datosGrafico.length > 0 && (
          <section className="card reveal">
            <button
              type="button"
              onClick={() => setVerDetalleTecnico((v) => !v)}
              aria-expanded={verDetalleTecnico}
              aria-controls="detalle-tecnico"
              className="flex w-full items-center justify-between gap-4 rounded-xl px-6 py-4 text-left transition-colors duration-150 hover:bg-canvas/70"
            >
              <span>
                <span className="block text-sm font-medium text-ink">Detalle técnico</span>
                <span className="block text-xs text-ink-2">Gráfico y métricas de error</span>
              </span>
              <ChevronDown
                size={18}
                strokeWidth={1.75}
                className={`shrink-0 text-ink-3 transition-transform duration-200 ease-out-strong ${
                  verDetalleTecnico ? 'rotate-180' : ''
                }`}
              />
            </button>

            {verDetalleTecnico && (
              <div id="detalle-tecnico" className="space-y-6 border-t border-line px-6 pb-6 pt-5">
                {metricas && (
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-canvas p-4">
                      <dt className="text-xs font-medium text-ink-2">MAE</dt>
                      <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {metricas.mae}
                      </dd>
                      <p className="mt-0.5 text-xs text-ink-3">Error absoluto medio</p>
                    </div>
                    <div className="rounded-lg bg-canvas p-4">
                      <dt className="text-xs font-medium text-ink-2">RMSE</dt>
                      <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {metricas.rmse}
                      </dd>
                      <p className="mt-0.5 text-xs text-ink-3">Raíz del error cuadrático medio</p>
                    </div>
                    <div className="rounded-lg bg-canvas p-4">
                      <dt className="text-xs font-medium text-ink-2">R²</dt>
                      <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {metricas.r2 ?? '—'}
                      </dd>
                      <p className="mt-0.5 text-xs text-ink-3">Solo regresión lineal</p>
                    </div>
                  </dl>
                )}

                <div>
                  <h2 className="mb-3 text-sm font-medium text-ink">Histórico vs. proyección</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={datosGrafico} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#dde5e8" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fontSize: 11, fill: '#5b727c' }}
                        tickLine={false}
                        axisLine={{ stroke: '#c3d0d5' }}
                        tickFormatter={(v: string) => fechaCorta(v)}
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#5b727c' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid #dde5e8',
                          boxShadow: '0 6px 16px -8px rgb(12 59 76 / 0.2)',
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="historico"
                        stroke="#0b6a86"
                        strokeWidth={2}
                        name="Histórico"
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="proyectado"
                        stroke={infoVariable.color}
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
      </main>
    </div>
  )
}
