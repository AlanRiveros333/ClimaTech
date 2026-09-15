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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/nav-bar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura (°C)', unidad: '°C', Icono: Thermometer, color: '#d97706' },
  { value: 'humedad', label: 'Humedad (%)', unidad: '%', Icono: Droplets, color: '#1d4ed8' },
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
  const colorTendencia =
    tendencia === 'sube' ? 'text-orange-600' : tendencia === 'baja' ? 'text-blue-600' : 'text-slate-500'

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
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Proyección climática</h1>
          <p className="text-sm text-slate-500">
            Estimación a futuro basada en el historial registrado — Cochabamba
          </p>
        </div>

        {/* ---------- Selector de variable (chips) ---------- */}
        <div className="flex gap-2">
          {VARIABLES.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setVariable(v.value)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                variable === v.value
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              <v.Icono size={16} />
              {v.label.split(' (')[0]}
            </button>
          ))}
        </div>

        {/* ---------- Clima por hora (último día registrado) ---------- */}
        {horasHoy.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                Clima por hora — {fechaClimaHora && fechaCorta(fechaClimaHora)}
              </h2>
              {horaMin !== null && horaMax !== null && (
                <span className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-0.5">
                    <ArrowUp size={12} className="text-orange-500" />
                    {horaMax.toFixed(1)}
                    {infoVariable.unidad}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <ArrowDown size={12} className="text-blue-500" />
                    {horaMin.toFixed(1)}
                    {infoVariable.unidad}
                  </span>
                </span>
              )}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {horasHoy
                .filter((h) => h.valor !== null)
                .map((h) => (
                  <div key={h.hora} className="flex min-w-[64px] flex-col items-center gap-1">
                    <span className="text-xs text-slate-400">{horaCorta(h.hora)}</span>
                    <infoVariable.Icono size={16} color={infoVariable.color} />
                    <span className="text-sm font-medium text-slate-900">
                      {h.valor?.toFixed(1)}
                      {infoVariable.unidad}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <form
          onSubmit={handleGenerar}
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Método</label>
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Días a proyectar
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={diasAProyectar}
              onChange={(e) => setDiasAProyectar(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Histórico desde
            </label>
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

          <div className="flex items-end md:col-span-2">
            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-lg bg-gradient-to-r from-[#0B4F6C] to-[#0E7C9B] py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {cargando ? 'Generando...' : 'Generar proyección'}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 md:col-span-2">
              {error}
            </p>
          )}
        </form>

        {/* ---------- Advertencia por datos insuficientes ---------- */}
        {advertencia && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <span className="mt-0.5">⚠️</span>
            <p>{advertencia}</p>
          </div>
        )}

        {/* ---------- Resumen tipo "app de clima" ---------- */}
        {proyeccion.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${infoVariable.color}1a` }}
                >
                  <infoVariable.Icono size={28} color={infoVariable.color} />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-3xl font-semibold text-slate-900">
                      {promedioProyectado?.toFixed(1)}
                      <span className="text-lg font-normal text-slate-500">{infoVariable.unidad}</span>
                    </p>
                    {tendencia && (
                      <span className={`flex items-center gap-1 text-sm font-medium ${colorTendencia}`}>
                        <IconoTendencia size={16} />
                        {tendencia === 'sube' ? 'En aumento' : tendencia === 'baja' ? 'En descenso' : 'Estable'}
                      </span>
                    )}
                    {proyMax !== null && proyMin !== null && (
                      <span className="flex items-center gap-2 text-sm text-slate-500">
                        <span className="flex items-center gap-0.5">
                          <ArrowUp size={12} className="text-orange-500" />
                          {proyMax.toFixed(1)}
                          {infoVariable.unidad}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <ArrowDown size={12} className="text-blue-500" />
                          {proyMin.toFixed(1)}
                          {infoVariable.unidad}
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{fraseAmigable()}</p>
                </div>
              </div>

              {histMin !== null && histMax !== null && (
                <div className="mt-4 flex gap-6 border-t border-slate-100 pt-4 text-sm">
                  <div>
                    <span className="text-slate-400">Histórico mínimo: </span>
                    <span className="font-medium text-slate-700">
                      {histMin.toFixed(1)}
                      {infoVariable.unidad}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Histórico máximo: </span>
                    <span className="font-medium text-slate-700">
                      {histMax.toFixed(1)}
                      {infoVariable.unidad}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Tira de pronóstico diario */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {proyeccion.map((p) => (
                <div
                  key={p.fecha}
                  className="flex min-w-[92px] flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <span className="text-xs font-medium uppercase text-slate-500">
                    {nombreDia(p.fecha)}
                  </span>
                  <span className="text-xs text-slate-400">{fechaCorta(p.fecha)}</span>
                  <infoVariable.Icono size={20} color={infoVariable.color} className="my-1" />
                  <span className="text-sm font-semibold text-slate-900">
                    {p.valor.toFixed(1)}
                    {infoVariable.unidad}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------- Detalle técnico (colapsable) ---------- */}
        {datosGrafico.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setVerDetalleTecnico((v) => !v)}
              className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium text-slate-700"
            >
              Ver detalle técnico (gráfico y métricas de error)
              <span className="text-slate-400">{verDetalleTecnico ? '−' : '+'}</span>
            </button>

            {verDetalleTecnico && (
              <div className="space-y-6 border-t border-slate-100 px-6 pb-6 pt-4">
                {metricas && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                      <p className="text-xs text-slate-500">MAE</p>
                      <p className="text-xl font-semibold text-slate-900">{metricas.mae}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                      <p className="text-xs text-slate-500">RMSE</p>
                      <p className="text-xl font-semibold text-slate-900">{metricas.rmse}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                      <p className="text-xs text-slate-500">R²</p>
                      <p className="text-xl font-semibold text-slate-900">{metricas.r2 ?? '—'}</p>
                    </div>
                  </div>
                )}

                <div>
                  <h2 className="mb-4 text-sm font-semibold text-slate-700">
                    Histórico vs. proyección
                  </h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={datosGrafico}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="historico"
                        stroke="#1d4ed8"
                        name="Histórico"
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="proyectado"
                        stroke="#d97706"
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
          </div>
        )}
      </div>
    </div>
  )
}
