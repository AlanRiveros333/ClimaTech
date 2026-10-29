'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, FileType, FileSpreadsheet, Download, FileX } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, CardTitle, EmptyState, LoadingState } from '@/components/page-shell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const FORMATOS = [
  { value: 'pdf', label: 'PDF', Icono: FileText },
  { value: 'word', label: 'Word', Icono: FileType },
  { value: 'excel', label: 'Excel', Icono: FileSpreadsheet },
] as const

type Formato = (typeof FORMATOS)[number]['value']

function etiquetaFormato(tipo: string) {
  return FORMATOS.find((f) => f.value === tipo)?.label ?? 'PDF'
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
    <PageShell width="max-w-3xl">
      <PageHeader
        icon={FileText}
        title="Reportes"
        description="Genera un reporte en PDF, Word o Excel con el resumen histórico y las proyecciones del período."
      />

      <form onSubmit={handleGenerar} className="card p-5 sm:p-6">
        <CardTitle title="Nuevo reporte" />

        <div className="mb-4">
          <span id="formato-label" className="label">
            Formato
          </span>
          <div role="radiogroup" aria-labelledby="formato-label" className="grid grid-cols-3 gap-2 sm:max-w-sm">
            {FORMATOS.map((f) => {
              const activo = formato === f.value
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setFormato(f.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    activo
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <f.Icono size={16} aria-hidden />
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="rep-desde" className="label">
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
            <label htmlFor="rep-hasta" className="label">
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
          <button type="submit" disabled={generando} className="btn-primary w-full sm:w-auto">
            {generando ? 'Generando…' : `Generar ${etiquetaFormato(formato)}`}
          </button>
        </div>

        {error && (
          <p role="alert" className="alert-error mt-4">
            {error}
          </p>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Usa el mismo rango de fechas con el que generaste tus proyecciones para que el reporte las incluya
          automáticamente.
        </p>
      </form>

      <section className="card p-5 sm:p-6" aria-labelledby="anteriores">
        <div id="anteriores">
          <CardTitle title="Reportes anteriores" />
        </div>

        {cargandoLista ? (
          <LoadingState />
        ) : reportes.length === 0 ? (
          <EmptyState
            icon={FileX}
            title="Todavía no generaste ningún reporte"
            text="Elige un período arriba y genera tu primer PDF."
          />
        ) : (
          <ul className="-mb-2 divide-y divide-slate-100">
            {reportes.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-slate-800">
                  <span className="badge bg-brand-50 text-brand-800">{etiquetaFormato(r.tipo)}</span>
                  <span>
                    <span className="tabular-nums">{r.periodo_inicio}</span>
                    <span className="mx-1.5 text-slate-400">a</span>
                    <span className="tabular-nums">{r.periodo_fin}</span>
                  </span>
                </span>
                <a
                  href={r.archivo_url}
                  target="_blank"
                  rel="noopener noreferrer"
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
    </PageShell>
  )
}
