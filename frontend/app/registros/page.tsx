'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import FormularioRegistroManual from './formulario-registro-manual'
import ImportadorOpenMeteo from './importador-open-meteo'

type Registro = {
  id: string
  fecha: string
  hora: string
  temperatura: number | null
  humedad: number | null
  velocidad_viento: number | null
  fuente: string
}

export default function RegistrosPage() {
  const supabase = createClient()
  const [registros, setRegistros] = useState<Registro[]>([])
  const [cargando, setCargando] = useState(true)

  const cargarRegistros = useCallback(async () => {
    setCargando(true)
    const { data } = await supabase
      .from('registros_climaticos')
      .select('id, fecha, hora, temperatura, humedad, velocidad_viento, fuente')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(20)

    setRegistros(data ?? [])
    setCargando(false)
  }, [supabase])

  useEffect(() => {
    cargarRegistros()
  }, [cargarRegistros])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Registros climáticos</h1>
          <p className="text-sm text-slate-500">
            Temperatura, humedad y velocidad del viento — Cochabamba
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <FormularioRegistroManual onGuardado={cargarRegistros} />
          <ImportadorOpenMeteo onImportado={cargarRegistros} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Últimos registros</h2>

          {cargando ? (
            <p className="text-sm text-slate-400">Cargando...</p>
          ) : registros.length === 0 ? (
            <p className="text-sm text-slate-400">Todavía no hay registros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Hora</th>
                    <th className="py-2 pr-4">Temp. (°C)</th>
                    <th className="py-2 pr-4">Humedad (%)</th>
                    <th className="py-2 pr-4">Viento (km/h)</th>
                    <th className="py-2 pr-4">Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 text-slate-700">
                      <td className="py-2 pr-4">{r.fecha}</td>
                      <td className="py-2 pr-4">{r.hora}</td>
                      <td className="py-2 pr-4">{r.temperatura ?? '—'}</td>
                      <td className="py-2 pr-4">{r.humedad ?? '—'}</td>
                      <td className="py-2 pr-4">{r.velocidad_viento ?? '—'}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            r.fuente === 'manual'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {r.fuente === 'manual' ? 'Manual' : 'Open-Meteo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
