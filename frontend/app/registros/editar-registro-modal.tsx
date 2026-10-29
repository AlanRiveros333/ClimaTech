'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Registro = {
  id: string
  fecha: string
  hora: string
  temperatura: number | null
  humedad: number | null
  velocidad_viento: number | null
  fuente: string
}

export default function EditarRegistroModal({
  registro,
  accessToken,
  onCerrar,
  onGuardado,
}: {
  registro: Registro
  accessToken: string
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [fecha, setFecha] = useState(registro.fecha)
  const [hora, setHora] = useState(registro.hora.slice(0, 5))
  const [temperatura, setTemperatura] = useState(registro.temperatura?.toString() ?? '')
  const [humedad, setHumedad] = useState(registro.humedad?.toString() ?? '')
  const [velocidadViento, setVelocidadViento] = useState(registro.velocidad_viento?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)

    try {
      const res = await fetch(`${API_URL}/registros/${registro.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          fecha,
          hora: `${hora}:00`,
          temperatura: temperatura ? Number(temperatura) : null,
          humedad: humedad ? Number(humedad) : null,
          velocidad_viento: velocidadViento ? Number(velocidadViento) : null,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'No se pudo actualizar el registro.')
        setGuardando(false)
        return
      }

      onGuardado()
    } catch {
      setError('No se pudo conectar con el servidor backend.')
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-editar"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-editar" className="text-lg font-semibold text-slate-900">
              Editar registro
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">Los cambios quedan anotados en la auditoría.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="icon-btn -mr-2 -mt-1 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ed-fecha" className="label">
                Fecha
              </label>
              <input
                id="ed-fecha"
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="ed-hora" className="label">
                Hora
              </label>
              <input
                id="ed-hora"
                type="time"
                required
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ed-temp" className="label">
              Temperatura (°C)
            </label>
            <input
              id="ed-temp"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value)}
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ed-hum" className="label">
                Humedad (%)
              </label>
              <input
                id="ed-hum"
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
              <label htmlFor="ed-viento" className="label">
                Viento (km/h)
              </label>
              <input
                id="ed-viento"
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

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCerrar} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="btn-primary flex-1">
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
