'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
  Activity as IconoGrafico,
  Info,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, CardTitle } from '@/components/page-shell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura (°C)', corto: 'Temperatura', unidad: '°C', Icono: Thermometer, color: '#c26a05' },
  { value: 'humedad', label: 'Humedad (%)', corto: 'Humedad', unidad: '%', Icono: Droplets, color: '#0f6a88' },
  {
    value: 'velocidad_viento',
    label: 'Velocidad del viento (km/h)',
    corto: 'Viento',
    unidad: 'km/h',
    Icono: Wind,
    color: '#0b4f6c',
  },
] as const

const METODOS = [
  { value: 'promedio_movil', label: 'Promedio móvil', ayuda: 'Proyecta el promedio de los últimos 7 días como un valor constante.' },
  { value: 'holt', label: 'Método de Holt', ayuda: 'Prolonga la tendencia reciente de la serie (mínimo 4 días de historial).' },
  {
    value: 'regresion_lineal',
    label: 'Regresión lineal múltiple',
    ayuda: 'Ajusta tendencia y un componente estacional anual; necesita un historial amplio (mínimo 5 días).',
  },
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

const DOMINIO_Y = [(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)] as [
  (min: number) => number,
  (max: number) => number,
]

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

  const [horasHoy, setHorasHoy] = useState<LecturaHora[]>([])
  const [fechaClimaHora, setFechaClimaHora] = useState<string | null>(null)

  const infoVariable = VARIABLES.find((v) => v.value === variable)!
  const infoMetodo = METODOS.find((m) => m.value === metodo)!

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

  // ---------- Cálculos para el resumen ----------
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
      ? 'bg-orange-50 text-orange-800'
      : tendencia === 'baja'
        ? 'bg-blue-50 text-blue-800'
        : 'bg-slate-100 text-slate-700'

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

  // Solo presentación: el último punto histórico también inicia la línea proyectada para que ambas se vean unidas.
  const ultimaFechaHistorica = historico.length > 0 ? historico[historico.length - 1].fecha : null
  const datosParaGrafico: PuntoGrafico[] = datosGrafico.map((p) =>
    p.fecha === ultimaFechaHistorica && p.historico !== undefined ? { ...p, proyectado: p.historico } : p
  )

  const horasConDato = horasHoy.filter((h) => h.valor !== null)
  const horaMin = horasConDato.length > 0 ? Math.min(...horasConDato.map((h) => h.valor as number)) : null
  const horaMax = horasConDato.length > 0 ? Math.max(...horasConDato.map((h) => h.valor as number)) : null
  const datosHora = horasConDato.map((h) => ({ hora: horaCorta(h.hora), valor: h.valor as number }))

  const hayResultado = proyeccion.length > 0

  const estadisticas = [
    { etiqueta: 'Rango proyectado', valor: proyMin !== null && proyMax !== null ? `${proyMin.toFixed(1)} – ${proyMax.toFixed(1)}${infoVariable.unidad}` : '—' },
    { etiqueta: 'Promedio reciente (7 días)', valor: promedioReciente !== null ? `${promedioReciente.toFixed(1)}${infoVariable.unidad}` : '—' },
    { etiqueta: 'Histórico mínimo', valor: histMin !== null ? `${histMin.toFixed(1)}${infoVariable.unidad}` : '—' },
    { etiqueta: 'Histórico máximo', valor: histMax !== null ? `${histMax.toFixed(1)}${infoVariable.unidad}` : '—' },
  ]

  return (
    <PageShell>
      <PageHeader
        icon={TrendingUp}
        title="Proyección climática"
        description="Estimación a corto plazo a partir del historial registrado de Cochabamba."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ---------- Panel de configuración ---------- */}
        <form onSubmit={handleGenerar} className="card p-5 lg:sticky lg:top-20">
          <CardTitle title="Configuración" />

          <div className="space-y-5">
            <div>
              <span id="var-label" className="label">
                Variable
              </span>
              <div role="radiogroup" aria-labelledby="var-label" className="grid grid-cols-3 gap-2">
                {VARIABLES.map((v) => {
                  const activa = variable === v.value
                  return (
                    <button
                      key={v.value}
                      type="button"
                      role="radio"
                      aria-checked={activa}
                      onClick={() => setVariable(v.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors ${
                        activa
                          ? 'border-brand-700 bg-brand-700 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <v.Icono size={18} aria-hidden />
                      {v.corto}
                    </button>
                  )
                })}
              </div>
            </div>

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
              <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-slate-600">
                <Info size={14} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
                {infoMetodo.ayuda}
              </p>
            </div>

            <fieldset>
              <legend className="label">Historial a usar</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hist-desde" className="mb-1 block text-xs text-slate-500">
                    Desde
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
                  <label htmlFor="hist-hasta" className="mb-1 block text-xs text-slate-500">
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
            </fieldset>

            <div>
              <label htmlFor="dias" className="label">
                Días a proyectar <span className="font-normal text-slate-500">(1 a 30)</span>
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

            {error && (
              <p role="alert" className="alert-error">
                {error}
              </p>
            )}

            <button type="submit" disabled={cargando} className="btn-primary w-full">
              {cargando ? 'Generando…' : 'Generar proyección'}
            </button>
          </div>
        </form>

        {/* ---------- Resultados ---------- */}
        <div className="min-w-0 space-y-6">
          {advertencia && (
            <div role="status" className="alert-warn flex items-start gap-3">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
              <p>{advertencia}</p>
            </div>
          )}

          {hayResultado ? (
            <>
              {/* Resumen */}
              <section className="card p-5 sm:p-6" aria-label="Resumen de la proyección">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="eyebrow">
                      {infoVariable.corto} · {infoMetodo.label}
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                      <p className="text-5xl font-semibold tabular-nums tracking-tight text-slate-900">
                        {promedioProyectado?.toFixed(1)}
                        <span className="ml-1 text-xl font-normal text-slate-500">{infoVariable.unidad}</span>
                      </p>
                      {tendencia && (
                        <span className={`badge gap-1 px-3 py-1 text-sm ${estiloTendencia}`}>
                          <IconoTendencia size={16} aria-hidden />
                          {tendencia === 'sube' ? 'En aumento' : tendencia === 'baja' ? 'En descenso' : 'Estable'}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600">{fraseAmigable()}</p>
                  </div>

                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 xl:w-[360px] xl:shrink-0">
                    {estadisticas.map((e) => (
                      <div key={e.etiqueta} className="bg-white px-3.5 py-3">
                        <dt className="text-xs text-slate-500">{e.etiqueta}</dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{e.valor}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>

              {/* Gráfico principal */}
              <section className="card p-5 sm:p-6" aria-label="Gráfico de histórico y proyección">
                <CardTitle
                  title="Histórico y proyección"
                  description="Pasa el cursor sobre la línea para ver el valor de cada día."
                />
                <div role="img" aria-label={`Gráfico de ${infoVariable.corto} histórico y proyectado`}>
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={datosParaGrafico} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        tickFormatter={fechaCorta}
                        minTickGap={28}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#475569' }}
                        tickLine={false}
                        axisLine={false}
                        domain={DOMINIO_Y}
                        unit={infoVariable.unidad === '%' ? '%' : ''}
                      />
                      <Tooltip
                        labelFormatter={(f) => `${nombreDia(String(f))} ${fechaCorta(String(f))}`}
                        formatter={(v) => `${Number(v).toFixed(1)} ${infoVariable.unidad}`}
                      />
                      <Legend verticalAlign="top" align="right" height={30} iconType="plainline" />
                      {ultimaFechaHistorica && (
                        <ReferenceLine
                          x={ultimaFechaHistorica}
                          stroke="#94a3b8"
                          strokeDasharray="2 4"
                          label={{ value: 'Inicio de proyección', position: 'insideTopLeft', fontSize: 11, fill: '#64748b' }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="historico"
                        stroke="#0f6a88"
                        strokeWidth={2.5}
                        name="Histórico"
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="proyectado"
                        stroke="#c26a05"
                        strokeWidth={2.5}
                        name="Proyectado"
                        strokeDasharray="6 4"
                        dot={{ r: 3, fill: '#c26a05', strokeWidth: 0 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* Métricas */}
                {metricas && (
                  <section className="card p-5 sm:p-6" aria-label="Métricas de error">
                    <CardTitle
                      title="Métricas de error"
                      description="Qué tan bien se ajusta el método al historial usado."
                    />
                    <dl className="grid grid-cols-3 gap-3">
                      {[
                        ['MAE', metricas.mae, 'Error absoluto medio'],
                        ['RMSE', metricas.rmse, 'Penaliza más los errores grandes'],
                        ['R²', metricas.r2 ?? '—', 'Solo regresión lineal'],
                      ].map(([sigla, valor, ayuda]) => (
                        <div key={sigla as string} className="rounded-lg bg-slate-50 px-3 py-3">
                          <dt className="text-xs font-medium text-slate-600">{sigla as string}</dt>
                          <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{valor as string | number}</dd>
                          <dd className="mt-1 text-[11px] leading-snug text-slate-500">{ayuda as string}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-4 text-xs leading-relaxed text-slate-500">
                      MAE y RMSE vienen en la unidad de la variable ({infoVariable.unidad}); mientras más bajos, mejor
                      ajuste al histórico. No miden la capacidad de predecir días que aún no ocurrieron.
                    </p>
                  </section>
                )}

                {/* Pronóstico día a día */}
                <section className="card p-5 sm:p-6" aria-label="Valores proyectados por día">
                  <CardTitle title="Día por día" description={`${proyeccion.length} días proyectados.`} />
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-2">
                    {proyeccion.map((p) => (
                      <li key={p.fecha} className="rounded-lg bg-slate-50 px-2 py-2.5 text-center">
                        <p className="text-xs font-medium text-slate-700">
                          {nombreDia(p.fecha)} <span className="font-normal text-slate-500">{fechaCorta(p.fecha)}</span>
                        </p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                          {p.valor.toFixed(1)}
                          <span className="text-xs font-normal text-slate-500">{infoVariable.unidad}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </>
          ) : (
            <section className="card p-6 sm:p-8" aria-label="Sin proyección todavía">
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <IconoGrafico size={22} aria-hidden />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Aún no generaste una proyección</h2>
                  <p className="mt-1 max-w-prose text-sm leading-relaxed text-slate-600">
                    Elige la variable, el método y el período de historial en el panel de la izquierda. Aquí verás el
                    valor esperado, la tendencia, el gráfico de histórico frente a proyección y las métricas MAE y
                    RMSE.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Contexto: último día registrado, por hora */}
          {datosHora.length > 0 && (
            <section className="card p-5 sm:p-6" aria-label="Último día registrado por hora">
              <CardTitle
                title={`Último día registrado${fechaClimaHora ? ` · ${fechaCorta(fechaClimaHora)}` : ''}`}
                description={`${infoVariable.corto} hora por hora.`}
                right={
                  horaMin !== null && horaMax !== null ? (
                    <span className="flex shrink-0 items-center gap-3 text-xs text-slate-600">
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
                  ) : undefined
                }
              />
              <div role="img" aria-label={`Gráfico por hora de ${infoVariable.corto}`}>
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart data={datosHora} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={2} />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} domain={DOMINIO_Y} />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(1)} ${infoVariable.unidad}`} />
                    <Area
                      type="monotone"
                      dataKey="valor"
                      name={infoVariable.corto}
                      stroke={infoVariable.color}
                      fill={infoVariable.color}
                      fillOpacity={0.14}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
      </div>
    </PageShell>
  )
}
