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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Editar registro</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Fecha</label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Hora</label>
              <input
                type="time"
                required
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Temperatura (°C)</label>
            <input
              type="number"
              step="0.1"
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Humedad (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={humedad}
              onChange={(e) => setHumedad(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Viento (km/h)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={velocidadViento}
              onChange={(e) => setVelocidadViento(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 rounded-lg bg-gradient-to-r from-[#0B4F6C] to-[#0E7C9B] py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
