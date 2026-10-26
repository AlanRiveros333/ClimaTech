'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function ImportadorOpenMeteo({ onImportado }: { onImportado: () => void }) {
  const supabase = createClient()

  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

  // Fecha máxima seleccionable (hoy, en hora LOCAL). Se calcula tras montar el
  // componente para que servidor y cliente rendericen lo mismo (evita el warning
  // de hidratación) y para no usar UTC, que adelanta el día por las noches.
  const [hoy, setHoy] = useState<string | undefined>(undefined)
  useEffect(() => {
    const ahora = new Date()
    const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
    setHoy(local.toISOString().split('T')[0])
  }, [])

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
    } catch (err) {
      console.error('Error al importar desde Open-Meteo:', err)
      setError('No se pudo conectar con el servidor backend.')
    } finally {
      setImportando(false)
    }
  }

  return (
    <form onSubmit={handleImportar} className="card flex flex-col p-6">
      <div>
        <h2 className="card-title">Importar desde Open-Meteo</h2>
        <p className="mt-1 text-sm text-ink-2">
          Trae temperatura, humedad y viento históricos para Cochabamba en el rango indicado.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="fecha_inicio" className="field-label">
            Desde
          </label>
          <input
            id="fecha_inicio"
            type="date"
            required
            max={hoy}
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="fecha_fin" className="field-label">
            Hasta
          </label>
          <input
            id="fecha_fin"
            type="date"
            required
            max={hoy}
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="field"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="alert alert-error mt-4">
          {error}
        </p>
      )}
      {mensaje && (
        <p role="status" className="alert alert-success mt-4">
          {mensaje}
        </p>
      )}

      <div className="mt-auto pt-6">
        <button type="submit" disabled={importando} className="btn btn-primary">
          {importando ? 'Importando...' : 'Importar datos'}
        </button>
      </div>
    </form>
  )
}
