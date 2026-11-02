'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, FileType, FileSpreadsheet, Download, FileX, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, CardTitle, EmptyState, LoadingState } from '@/components/page-shell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const FORMATOS = [
  { value: 'pdf', label: 'PDF', Icono: FileText, texto: 'Para leer, imprimir o compartir.' },
  { value: 'word', label: 'Word', Icono: FileType, texto: 'Documento editable.' },
  { value: 'excel', label: 'Excel', Icono: FileSpreadsheet, texto: 'Tablas y registros del período.' },
] as const

type Formato = (typeof FORMATOS)[number]['value']

function etiquetaFormato(tipo: string) {
  return FORMATOS.find((f) => f.value === tipo)?.label ?? 'PDF'
}

function fechaEs(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function fechaHoraEs(iso: string) {
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return ''
  return f.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })
}

type Reporte = {
  id: string
  tipo: string
  periodo_inicio: string
  periodo_fin: string
  archivo_url: string
  created_at: string
}

export default function ReportesPage() {
  const supabase = createClient()

  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [formato, setFormato] = useState<Formato>('pdf')
  const [error, setError] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)

  // Fecha máxima seleccionable (hoy, en hora LOCAL). Se calcula tras montar el
  // componente para que servidor y cliente rendericen lo mismo (evita el warning
  // de hidratación) y para no usar UTC, que adelanta el día por las noches.
  const [hoy, setHoy] = useState<string | undefined>(undefined)
  useEffect(() => {
    const ahora = new Date()
    const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
    setHoy(local.toISOString().split('T')[0])
  }, [])
  const [reportes, setReportes] = useState<Reporte[]>([])
  const [cargandoLista, setCargandoLista] = useState(true)

  const cargarReportes = useCallback(async () => {
    setCargandoLista(true)
    const { data } = await supabase
      .from('reportes')
      .select('id, tipo, periodo_inicio, periodo_fin, archivo_url, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    setReportes(data ?? [])
    setCargandoLista(false)
  }, [supabase])

  useEffect(() => {
    cargarReportes()
  }, [cargarReportes])

  async function handleGenerar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGenerando(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      setError('Sesión expirada, vuelve a iniciar sesión.')
      setGenerando(false)
      return
    }

    try {
      const res = await fetch(`${API_URL}/reportes/generar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ periodo_inicio: periodoInicio, periodo_fin: periodoFin, formato }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'No se pudo generar el reporte.')
        setGenerando(false)
        return
      }

      window.open(data.archivo_url, '_blank')
      cargarReportes()
    } catch {
      setError('No se pudo conectar con el servidor backend.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        icon={FileText}
        title="Reportes"
        description="Resumen histórico y proyecciones de un período, en PDF, Word o Excel."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6 lg:sticky lg:top-20">
          <form onSubmit={handleGenerar} className="card p-5">
            <CardTitle title="Nuevo reporte" />

            <div className="space-y-5">
              <div>
                <span id="formato-label" className="label">
                  Formato
                </span>
                <div role="radiogroup" aria-labelledby="formato-label" className="space-y-2">
                  {FORMATOS.map((f) => {
                    const activo = formato === f.value
                    return (
                      <button
                        key={f.value}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        onClick={() => setFormato(f.value)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                          activo ? 'border-brand-700 bg-brand-50' : 'border-slate-300 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                            activo ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <f.Icono size={18} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-900">{f.label}</span>
                          <span className="block text-xs text-slate-600">{f.texto}</span>
                        </span>
                        {activo && <CheckCircle2 size={18} className="shrink-0 text-brand-700" aria-hidden />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <fieldset>
                <legend className="label">Período</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="rep-desde" className="mb-1 block text-xs text-slate-500">
                      Desde
                    </label>
                    <input
                      id="rep-desde"
                      type="date"
                      required
                      max={hoy}
                      value={periodoInicio}
                      onChange={(e) => setPeriodoInicio(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="rep-hasta" className="mb-1 block text-xs text-slate-500">
                      Hasta
                    </label>
                    <input
                      id="rep-hasta"
                      type="date"
                      required
                      max={hoy}
                      value={periodoFin}
                      onChange={(e) => setPeriodoFin(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Usa el mismo rango con el que generaste tus proyecciones para que el reporte las incluya.
                </p>
              </fieldset>

              {error && (
                <p role="alert" className="alert-error">
                  {error}
                </p>
              )}

              <button type="submit" disabled={generando} className="btn-primary w-full">
                {generando ? 'Generando…' : `Generar ${etiquetaFormato(formato)}`}
              </button>
            </div>
          </form>

          <section className="card p-5" aria-label="Contenido del reporte">
            <h2 className="text-sm font-semibold text-slate-900">Qué incluye</h2>
            <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
              <li className="flex gap-2.5">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                Estadística descriptiva: media, mínimo, máximo y desviación estándar.
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                Proyecciones del mismo rango con MAE, RMSE y R².
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                En Excel, además, una hoja con los registros del período.
              </li>
            </ul>
          </section>
        </div>

        <section className="card min-w-0 overflow-hidden" aria-labelledby="anteriores">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="anteriores" className="text-base font-semibold text-slate-900">
                Historial de reportes
              </h2>
              <p className="text-sm text-slate-600">Los 20 más recientes.</p>
            </div>
            {reportes.length > 0 && <span className="badge bg-slate-100 text-slate-700">{reportes.length}</span>}
          </div>

          {cargandoLista ? (
            <div className="px-5">
              <LoadingState />
            </div>
          ) : reportes.length === 0 ? (
            <EmptyState
              icon={FileX}
              title="Todavía no generaste ningún reporte"
              text="Elige un formato y un período en el panel de la izquierda."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {reportes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="badge w-14 justify-center bg-brand-50 text-brand-800">{etiquetaFormato(r.tipo)}</span>
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums text-slate-900">
                        {fechaEs(r.periodo_inicio)} <span className="font-normal text-slate-400">a</span> {fechaEs(r.periodo_fin)}
                      </p>
                      {r.created_at && <p className="text-xs text-slate-500">Generado el {fechaHoraEs(r.created_at)}</p>}
                    </div>
                  </div>
                  <a
                    href={r.archivo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Descargar reporte ${etiquetaFormato(r.tipo)} del ${fechaEs(r.periodo_inicio)} al ${fechaEs(r.periodo_fin)}`}
                    className="btn-secondary shrink-0"
                  >
                    <Download size={16} aria-hidden />
                    Descargar
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  )
}
