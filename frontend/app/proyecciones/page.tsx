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
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura (°C)' },
  { value: 'humedad', label: 'Humedad (%)' },
  { value: 'velocidad_viento', label: 'Velocidad del viento (km/h)' },
]

const METODOS = [
  { value: 'promedio_movil', label: 'Promedio móvil' },
  { value: 'holt', label: 'Método de Holt' },
  { value: 'regresion_lineal', label: 'Regresión lineal múltiple' },
]

type PuntoGrafico = { fecha: string; historico?: number; proyectado?: number }

export default function ProyeccionesPage() {
  const supabase = createClient()

  const [variable, setVariable] = useState('temperatura')
  const [metodo, setMetodo] = useState('promedio_movil')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [diasAProyectar, setDiasAProyectar] = useState(7)

  const [datosGrafico, setDatosGrafico] = useState<PuntoGrafico[]>([])
  const [metricas, setMetricas] = useState<{ mae: number; rmse: number; r2: number | null } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function handleGenerar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
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

      const historico: PuntoGrafico[] = data.historico.map((p: any) => ({
        fecha: p.fecha,
        historico: p.valor,
      }))
      const proyeccion: PuntoGrafico[] = data.proyeccion.map((p: any) => ({
        fecha: p.fecha,
        proyectado: p.valor,
      }))

      setDatosGrafico([...historico, ...proyeccion])
      setMetricas(data.metricas)
    } catch {
      setError('No se pudo conectar con el servidor backend.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Proyección estadística</h1>
          <p className="text-sm text-slate-500">
            Compara promedio móvil, Holt y regresión lineal múltiple
          </p>
        </div>

        <form
          onSubmit={handleGenerar}
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2"
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

          <div className="flex items-end">
            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
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

        {metricas && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs text-slate-500">MAE</p>
              <p className="text-xl font-semibold text-slate-900">{metricas.mae}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs text-slate-500">RMSE</p>
              <p className="text-xl font-semibold text-slate-900">{metricas.rmse}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <p className="text-xs text-slate-500">R²</p>
              <p className="text-xl font-semibold text-slate-900">{metricas.r2 ?? '—'}</p>
            </div>
          </div>
        )}

        {datosGrafico.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Histórico vs. proyección
            </h2>
            <ResponsiveContainer width="100%" height={350}>
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
        )}
      </div>
    </div>
  )
}
