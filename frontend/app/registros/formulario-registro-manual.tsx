'use client'

import { useState } from 'react'
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
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-900">Registro manual</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="fecha" className="mb-1 block text-sm font-medium text-slate-700">
            Fecha
          </label>
          <input
            id="fecha"
            type="date"
            required
            max={new Date().toISOString().split('T')[0]}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="hora" className="mb-1 block text-sm font-medium text-slate-700">
            Hora
          </label>
          <input
            id="hora"
            type="time"
            required
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="temperatura" className="mb-1 block text-sm font-medium text-slate-700">
            Temperatura (°C)
          </label>
          <input
            id="temperatura"
            type="number"
            step="0.1"
            value={temperatura}
            onChange={(e) => setTemperatura(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="humedad" className="mb-1 block text-sm font-medium text-slate-700">
            Humedad (%)
          </label>
          <input
            id="humedad"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={humedad}
            onChange={(e) => setHumedad(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="viento" className="mb-1 block text-sm font-medium text-slate-700">
            Viento (km/h)
          </label>
          <input
            id="viento"
            type="number"
            step="0.1"
            min="0"
            value={velocidadViento}
            onChange={(e) => setVelocidadViento(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {exito && <p className="text-sm text-green-600">Registro guardado correctamente.</p>}

      <button
        type="submit"
        disabled={guardando}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {guardando ? 'Guardando...' : 'Guardar registro'}
      </button>
    </form>
  )
}
