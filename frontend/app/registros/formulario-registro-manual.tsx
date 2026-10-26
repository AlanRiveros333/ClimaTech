'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function FormularioRegistroManual({ onGuardado }: { onGuardado: () => void }) {
  const supabase = createClient()

  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [temperatura, setTemperatura] = useState('')
  const [humedad, setHumedad] = useState('')
  const [velocidadViento, setVelocidadViento] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Fecha máxima seleccionable (hoy, en hora LOCAL). Se calcula tras montar el
  // componente para que servidor y cliente rendericen lo mismo (evita el warning
  // de hidratación) y para no usar UTC, que adelanta el día por las noches.
  const [hoy, setHoy] = useState<string | undefined>(undefined)
  useEffect(() => {
    const ahora = new Date()
    const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
    setHoy(local.toISOString().split('T')[0])
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setExito(false)
    setGuardando(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('registros_climaticos').insert({
      fecha,
      hora: `${hora}:00`,
      temperatura: temperatura ? Number(temperatura) : null,
      humedad: humedad ? Number(humedad) : null,
      velocidad_viento: velocidadViento ? Number(velocidadViento) : null,
      fuente: 'manual',
      registrado_por: user?.id,
    })

    setGuardando(false)

    if (error) {
      setError(
        error.code === '23505'
          ? 'Ya existe un registro manual para esa fecha y hora.'
          : `No se pudo guardar: ${error.message}`
      )
      return
    }

    setExito(true)
    setFecha('')
    setHora('')
    setTemperatura('')
    setHumedad('')
    setVelocidadViento('')
    onGuardado()
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col p-6">
      <div>
        <h2 className="card-title">Registro manual</h2>
        <p className="mt-1 text-sm text-ink-2">Ingresa una lectura puntual con su fecha y hora.</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="fecha" className="field-label">
            Fecha
          </label>
          <input
            id="fecha"
            type="date"
            required
            max={hoy}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="hora" className="field-label">
            Hora
          </label>
          <input
            id="hora"
            type="time"
            required
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="field"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="temperatura" className="field-label">
            Temperatura (°C)
          </label>
          <input
            id="temperatura"
            type="number"
            step="0.1"
            inputMode="decimal"
            value={temperatura}
            onChange={(e) => setTemperatura(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="humedad" className="field-label">
            Humedad (%)
          </label>
          <input
            id="humedad"
            type="number"
            step="0.1"
            min="0"
            max="100"
            inputMode="decimal"
            value={humedad}
            onChange={(e) => setHumedad(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="viento" className="field-label">
            Viento (km/h)
          </label>
          <input
            id="viento"
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={velocidadViento}
            onChange={(e) => setVelocidadViento(e.target.value)}
            className="field"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="alert alert-error mt-4">
          {error}
        </p>
      )}
      {exito && (
        <p role="status" className="alert alert-success mt-4">
          Registro guardado correctamente.
        </p>
      )}

      <div className="mt-auto pt-6">
        <button type="submit" disabled={guardando} className="btn btn-primary">
          {guardando ? 'Guardando...' : 'Guardar registro'}
        </button>
      </div>
    </form>
  )
}
