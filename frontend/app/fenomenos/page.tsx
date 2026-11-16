'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Waves, Trash2 } from 'lucide-react'
import NavBar from '@/components/nav-bar'
import { apiFetch } from '@/lib/api'

const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura (°C)', unidad: '°C' },
  { value: 'humedad', label: 'Humedad (%)', unidad: '%' },
  { value: 'velocidad_viento', label: 'Velocidad del viento (km/h)', unidad: 'km/h' },
]

const ETIQUETA_FASE: Record<string, string> = { el_nino: 'El Niño', la_nina: 'La Niña', neutro: 'Neutro' }
const ETIQUETA_INTENSIDAD: Record<string, string> = {
  debil: 'Débil',
  moderado: 'Moderado',
  fuerte: 'Fuerte',
  muy_fuerte: 'Muy fuerte',
}

type Evento = {
  id: string
  nombre: string
  fase: 'el_nino' | 'la_nina'
  intensidad: string
  fecha_inicio: string
  fecha_fin: string | null
  notas: string | null
}
type Mes = {
  mes: string
  valor: number | null
  climatologia: number | null
  anomalia: number | null
  fase: string
  evento: string | null
}
type Analisis = {
  variable: string
  evento_actual: string | null
  primer_dia: string
  ultimo_dia: string
  mensual: Mes[]
  por_fase: { fase: string; etiqueta: string; meses: number; valor_medio: number | null; anomalia_media: number | null }[]
  anios_con_datos: number
  advertencias: string[]
}

export default function FenomenosPage() {
  const [esAdmin, setEsAdmin] = useState(false)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [eventoActual, setEventoActual] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [variable, setVariable] = useState('temperatura')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [analizando, setAnalizando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [fase, setFase] = useState('el_nino')
  const [intensidad, setIntensidad] = useState('moderado')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [guardando, setGuardando] = useState(false)

  const unidad = VARIABLES.find((v) => v.value === variable)?.unidad ?? ''

  const cargarEventos = useCallback(async () => {
    try {
      const data = await apiFetch<{ eventos: Evento[]; evento_actual: string | null }>('/fenomenos/eventos')
      setEventos(data.eventos)
      setEventoActual(data.evento_actual)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    }
  }, [])

  useEffect(() => {
    cargarEventos()
    apiFetch<{ rol: string }>('/me')
      .then((me) => setEsAdmin(me.rol === 'administrador'))
      .catch(() => {})
  }, [cargarEventos])

  async function handleAnalizar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAnalizando(true)
    try {
      const params = new URLSearchParams({ variable })
      if (inicio) params.set('inicio', inicio)
      if (fin) params.set('fin', fin)
      setAnalisis(await apiFetch<Analisis>(`/fenomenos/analisis?${params.toString()}`))
    } catch (err) {
      setAnalisis(null)
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setAnalizando(false)
    }
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      await apiFetch('/fenomenos/eventos', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          fase,
          intensidad,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin || null,
        }),
      })
      setNombre('')
      setFechaInicio('')
      setFechaFin('')
      await cargarEventos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminar(id: string) {
    if (!window.confirm('¿Eliminar este evento?')) return
    setError(null)
    try {
      await apiFetch(`/fenomenos/eventos/${id}`, { method: 'DELETE' })
      await cargarEventos()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    }
  }

  // Una serie de barras por fase para colorear las anomalías
  const datosAnomalia = (analisis?.mensual ?? []).map((m) => ({
    mes: m.mes,
    el_nino: m.fase === 'el_nino' ? m.anomalia : null,
    la_nina: m.fase === 'la_nina' ? m.anomalia : null,
    neutro: m.fase === 'neutro' ? m.anomalia : null,
  }))

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0E7C9B]/10">
            <Waves size={22} color="#0E7C9B" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Fenómenos climáticos</h1>
            <p className="text-sm text-slate-500">El Niño y La Niña frente a los datos históricos de Cochabamba</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {eventoActual && (
          <div className="rounded-2xl bg-gradient-to-r from-[#0B4F6C] to-[#d97706] p-5 text-white shadow">
            <p className="text-xs uppercase tracking-wide text-white/80">Evento en curso</p>
            <p className="text-xl font-semibold">{eventoActual}</p>
            <p className="mt-1 text-sm text-white/80">
              Un evento de esta magnitud hace más probables ciertos impactos, pero no los garantiza. Compara abajo cómo
              se comportaron los datos locales en eventos anteriores.
            </p>
          </div>
        )}

        <form
          onSubmit={handleAnalizar}
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4"
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Desde (opcional)</label>
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Hasta (opcional)</label>
            <input
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={analizando}
              className="w-full rounded-lg bg-gradient-to-r from-[#0B4F6C] to-[#0E7C9B] py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {analizando ? 'Analizando...' : 'Analizar anomalías'}
            </button>
          </div>
          <p className="text-xs text-slate-400 md:col-span-4">
            Para ver anomalías necesitas varios años de datos (carga el histórico con el script cargar_historico).
          </p>
        </form>

        {analisis && (
          <>
            {analisis.advertencias.map((a) => (
              <div key={a} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                ⚠️ {a}
              </div>
            ))}

            {analisis.mensual.length > 0 && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">Promedio mensual vs. climatología</h2>
                  <p className="mb-4 text-sm text-slate-500">
                    Datos del {analisis.primer_dia} al {analisis.ultimo_dia} ({analisis.anios_con_datos} año(s)). La
                    climatología es el promedio de cada mes en los años disponibles.
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={analisis.mensual}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="valor" name={`Promedio mensual (${unidad})`} stroke="#0B4F6C" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="climatologia" name="Climatología" stroke="#94a3b8" strokeDasharray="5 5" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">Anomalía mensual por fase</h2>
                  <p className="mb-4 text-sm text-slate-500">
                    Diferencia respecto a la climatología ({unidad}). Los colores indican la fase ENSO del mes.
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={datosAnomalia}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <ReferenceLine y={0} stroke="#64748b" />
                      <Bar dataKey="el_nino" name="El Niño" stackId="a" fill="#d97706" />
                      <Bar dataKey="la_nina" name="La Niña" stackId="a" fill="#1d4ed8" />
                      <Bar dataKey="neutro" name="Neutro" stackId="a" fill="#94a3b8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {analisis.por_fase.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-3 text-lg font-semibold text-slate-900">Resumen por fase</h2>
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-2 pr-4">Fase</th>
                          <th className="py-2 pr-4">Meses</th>
                          <th className="py-2 pr-4">Valor medio ({unidad})</th>
                          <th className="py-2 pr-4">Anomalía media ({unidad})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analisis.por_fase.map((f) => (
                          <tr key={f.fase} className="border-b border-slate-100 text-slate-700">
                            <td className="py-2 pr-4">{f.etiqueta}</td>
                            <td className="py-2 pr-4">{f.meses}</td>
                            <td className="py-2 pr-4">{f.valor_medio ?? '—'}</td>
                            <td className="py-2 pr-4">{f.anomalia_media ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Eventos registrados</h2>
          <p className="mb-4 text-sm text-slate-500">
            Períodos de El Niño y La Niña según la clasificación de NOAA CPC. Las fechas son aproximadas (a nivel de mes).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Evento</th>
                  <th className="py-2 pr-4">Fase</th>
                  <th className="py-2 pr-4">Intensidad</th>
                  <th className="py-2 pr-4">Inicio</th>
                  <th className="py-2 pr-4">Fin</th>
                  {esAdmin && <th className="py-2 pr-4" />}
                </tr>
              </thead>
              <tbody>
                {eventos.map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-100 text-slate-700">
                    <td className="py-2 pr-4">{ev.nombre}</td>
                    <td className="py-2 pr-4">{ETIQUETA_FASE[ev.fase]}</td>
                    <td className="py-2 pr-4">{ETIQUETA_INTENSIDAD[ev.intensidad] ?? ev.intensidad}</td>
                    <td className="py-2 pr-4">{ev.fecha_inicio}</td>
                    <td className="py-2 pr-4">{ev.fecha_fin ?? 'En curso'}</td>
                    {esAdmin && (
                      <td className="py-2 pr-4">
                        <button
                          onClick={() => handleEliminar(ev.id)}
                          aria-label="Eliminar evento"
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {esAdmin && (
            <form onSubmit={handleCrear} className="mt-6 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-6">
              <input
                required
                minLength={3}
                placeholder="Nombre del evento"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2"
              />
              <select
                value={fase}
                onChange={(e) => setFase(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="el_nino">El Niño</option>
                <option value="la_nina">La Niña</option>
              </select>
              <select
                value={intensidad}
                onChange={(e) => setIntensidad(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {Object.entries(ETIQUETA_INTENSIDAD).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                type="date"
                required
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                title="Fin (vacío = en curso)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-gradient-to-r from-[#0B4F6C] to-[#0E7C9B] py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 md:col-span-6"
              >
                {guardando ? 'Guardando...' : 'Agregar evento'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
