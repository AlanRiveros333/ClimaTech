'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function ImportadorOpenMeteo({ onImportado }: { onImportado: () => void }) {
  const supabase = createClient()

  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

  async function handleImportar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    setImportando(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      setError('Sesión expirada, vuelve a iniciar sesión.')
      setImportando(false)
      return
    }

    try {
      const res = await fetch(`${API_URL}/registros/importar-open-meteo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ fecha_inicio: fechaInicio, fecha_fin: fechaFin }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'No se pudo completar la importación.')
        return
      }

      setMensaje(`Importación completada: ${data.registros_procesados} registros procesados.`)
      onImportado()
    } catch {
      setError('No se pudo conectar con el servidor backend.')
    } finally {
      setImportando(false)
    }
  }

  return (
    <form
      onSubmit={handleImportar}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Importar desde Open-Meteo</h2>
        <p className="text-sm text-slate-500">
          Trae temperatura, humedad y viento históricos para Cochabamba en el rango indicado.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="fecha_inicio" className="mb-1 block text-sm font-medium text-slate-700">
            Desde
          </label>
          <input
            id="fecha_inicio"
            type="date"
            required
            max={new Date().toISOString().split('T')[0]}
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="fecha_fin" className="mb-1 block text-sm font-medium text-slate-700">
            Hasta
          </label>
          <input
            id="fecha_fin"
            type="date"
            required
            max={new Date().toISOString().split('T')[0]}
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {mensaje && <p className="text-sm text-green-600">{mensaje}</p>}

      <button
        type="submit"
        disabled={importando}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
      >
        {importando ? 'Importando...' : 'Importar datos'}
      </button>
    </form>
  )
}
