'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/nav-bar'
import PageHeader from '@/components/page-header'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
        body: JSON.stringify({ periodo_inicio: periodoInicio, periodo_fin: periodoFin }),
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
    <div className="min-h-dvh">
      <NavBar />
      <main id="contenido" className="page max-w-3xl space-y-8 py-8 sm:py-10">
        <PageHeader
          titulo="Reportes"
          descripcion="Genera un PDF con el resumen histórico y las proyecciones del período."
        />

        <form onSubmit={handleGenerar} className="card p-6">
          <div className="grid gap-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label htmlFor="rep-desde" className="field-label">
                Desde
              </label>
              <input
                id="rep-desde"
                type="date"
                required
                max={hoy}
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="rep-hasta" className="field-label">
                Hasta
              </label>
              <input
                id="rep-hasta"
                type="date"
                required
                max={hoy}
                value={periodoFin}
                onChange={(e) => setPeriodoFin(e.target.value)}
                className="field"
              />
            </div>
            <button type="submit" disabled={generando} className="btn btn-primary">
              {generando ? 'Generando...' : 'Generar PDF'}
            </button>
          </div>

          {error && (
            <p role="alert" className="alert alert-error mt-4">
              {error}
            </p>
          )}
          <p className="mt-4 max-w-[65ch] text-sm leading-relaxed text-ink-2">
            Usa el mismo rango de fechas que utilizaste para generar tus proyecciones, así el
            reporte las incluye automáticamente.
          </p>
        </form>

        <section aria-labelledby="titulo-anteriores" className="card overflow-hidden">
          <h2 id="titulo-anteriores" className="card-title px-6 pb-4 pt-5">
            Reportes anteriores
          </h2>

          {cargandoLista ? (
            <ul className="divide-y divide-line border-t border-line" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center justify-between gap-4 px-6 py-3.5">
                  <div className="skeleton h-5 w-48" />
                  <div className="skeleton h-9 w-28" />
                </li>
              ))}
            </ul>
          ) : reportes.length === 0 ? (
            <div className="border-t border-line px-6 py-12 text-center">
              <span className="mx-auto grid size-10 place-items-center rounded-lg bg-canvas text-ink-3">
                <FileText size={20} strokeWidth={1.75} />
              </span>
              <p className="mt-3 font-medium text-ink">Todavía no generaste ningún reporte</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">
                Elige un rango de fechas arriba y genera tu primer PDF.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {reportes.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 transition-colors duration-150 hover:bg-canvas/70"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums text-ink">
                      {r.periodo_inicio} — {r.periodo_fin}
                    </p>
                    <p className="text-xs text-ink-3">
                      Generado el {new Date(r.created_at).toLocaleDateString('es-BO')}
                    </p>
                  </div>
                  <a
                    href={r.archivo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary min-h-9 shrink-0 px-3"
                  >
                    <Download size={16} strokeWidth={1.75} />
                    Descargar PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
