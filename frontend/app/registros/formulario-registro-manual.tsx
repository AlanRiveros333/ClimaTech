'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CardTitle } from '@/components/page-shell'

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
    <form onSubmit={handleSubmit} className="card flex flex-col p-5 sm:p-6">
      <CardTitle title="Registro manual" description="Ingresa una lectura puntual. Deja vacío lo que no midas." />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fecha" className="label">
              Fecha
            </label>
            <input
              id="fecha"
              type="date"
              required
              max={hoy}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="hora" className="label">
              Hora
            </label>
            <input
              id="hora"
              type="time"
              required
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="temperatura" className="label">
              Temp. (°C)
            </label>
            <input
              id="temperatura"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="humedad" className="label">
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
              className="input"
            />
          </div>
          <div>
            <label htmlFor="viento" className="label">
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
              className="input"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        {exito && (
          <p role="status" className="alert-success">
            Registro guardado correctamente.
          </p>
        )}
      </div>

      <button type="submit" disabled={guardando} className="btn-primary mt-5 w-full sm:w-auto sm:self-start">
        {guardando ? 'Guardando…' : 'Guardar registro'}
      </button>
    </form>
  )
}
