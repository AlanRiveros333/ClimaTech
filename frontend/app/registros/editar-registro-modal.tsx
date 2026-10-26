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
    <div className="modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-editar-registro"
        className="modal-panel w-full max-w-md rounded-2xl bg-surface p-6 shadow-pop"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="titulo-editar-registro" className="text-lg font-semibold tracking-tight text-ink">
              Editar registro
            </h2>
            <p className="mt-0.5 text-sm text-ink-2">
              Los cambios quedan guardados en la auditoría.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="btn-icon -mr-2 -mt-1"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-fecha" className="field-label">
                Fecha
              </label>
              <input
                id="edit-fecha"
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="edit-hora" className="field-label">
                Hora
              </label>
              <input
                id="edit-hora"
                type="time"
                required
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="field"
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-temperatura" className="field-label">
              Temperatura (°C)
            </label>
            <input
              id="edit-temperatura"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="edit-humedad" className="field-label">
              Humedad (%)
            </label>
            <input
              id="edit-humedad"
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
            <label htmlFor="edit-viento" className="field-label">
              Viento (km/h)
            </label>
            <input
              id="edit-viento"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={velocidadViento}
              onChange={(e) => setVelocidadViento(e.target.value)}
              className="field"
            />
          </div>

          {error && (
            <p role="alert" className="alert alert-error">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onCerrar} className="btn btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="btn btn-primary flex-1">
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
