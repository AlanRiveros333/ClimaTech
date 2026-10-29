'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CardTitle } from '@/components/page-shell'

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
    <form onSubmit={handleImportar} className="card flex flex-col p-5 sm:p-6">
      <CardTitle
        title="Importar desde Open-Meteo"
        description="Trae temperatura, humedad y viento históricos de Cochabamba. Máximo 366 días por importación."
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fecha_inicio" className="label">
              Desde
            </label>
            <input
              id="fecha_inicio"
              type="date"
              required
              max={hoy}
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="fecha_fin" className="label">
              Hasta
            </label>
            <input
              id="fecha_fin"
              type="date"
              required
              max={hoy}
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="input"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        {mensaje && (
          <p role="status" className="alert-success">
            {mensaje}
          </p>
        )}
      </div>

      <button type="submit" disabled={importando} className="btn-primary mt-5 w-full sm:w-auto sm:self-start">
        {importando ? 'Importando…' : 'Importar datos'}
      </button>
    </form>
  )
}
