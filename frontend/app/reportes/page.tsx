'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/nav-bar'

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
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#5C6BC0]/10">
            <FileText size={22} color="#5C6BC0" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Reportes</h1>
            <p className="text-sm text-slate-500">
              Genera un PDF con el resumen histórico y las proyecciones del período
            </p>
          </div>
        </div>

        <form
          onSubmit={handleGenerar}
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Desde</label>
            <input
              type="date"
              required
              max={new Date().toISOString().split('T')[0]}
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
              max={new Date().toISOString().split('T')[0]}
              value={periodoFin}
              onChange={(e) => setPeriodoFin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={generando}
              className="w-full rounded-lg bg-gradient-to-r from-[#5C6BC0] to-[#0E7C9B] py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {generando ? 'Generando...' : 'Generar PDF'}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 md:col-span-3">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-400 md:col-span-3">
            Consejo: usa el mismo rango de fechas que utilizaste para generar tus proyecciones,
            así el reporte las incluye automáticamente.
          </p>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Reportes anteriores</h2>

          {cargandoLista ? (
            <p className="text-sm text-slate-400">Cargando...</p>
          ) : reportes.length === 0 ? (
            <p className="text-sm text-slate-400">Todavía no generaste ningún reporte.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reportes.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-slate-700">
                    {r.periodo_inicio} — {r.periodo_fin}
                  </span>
                  <a
                    href={r.archivo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-900 underline hover:text-slate-600"
                  >
                    Descargar PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
