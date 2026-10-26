'use client'

import { useEffect, useState, useCallback } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/nav-bar'
import PageHeader from '@/components/page-header'
import FormularioRegistroManual from './formulario-registro-manual'
import ImportadorOpenMeteo from './importador-open-meteo'
import EditarRegistroModal from './editar-registro-modal'

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

export default function RegistrosPage() {
  const supabase = createClient()
  const [registros, setRegistros] = useState<Registro[]>([])
  const [cargando, setCargando] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [registroEditando, setRegistroEditando] = useState<Registro | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    async function cargarPerfil() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) return
      setAccessToken(session.access_token)

      const { data: profile } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', session.user.id)
        .single()

      setEsAdmin(profile?.rol === 'administrador')
    }
    cargarPerfil()
  }, [supabase])

  async function handleEliminar(id: string) {
    if (!accessToken) return
    if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return

    setEliminandoId(id)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/registros/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'No se pudo eliminar el registro.')
        setEliminandoId(null)
        return
      }

      await cargarRegistros()
    } catch {
      setError('No se pudo conectar con el servidor backend.')
    } finally {
      setEliminandoId(null)
    }
  }

  const columnas = esAdmin ? 7 : 6

  return (
    <div className="min-h-dvh">
      <NavBar />
      <main id="contenido" className="page space-y-8 py-8 sm:py-10">
        <PageHeader
          titulo="Registros climáticos"
          descripcion="Temperatura, humedad y velocidad del viento de Cochabamba. Registra lecturas a mano o impórtalas desde Open-Meteo."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <FormularioRegistroManual onGuardado={cargarRegistros} />
          <ImportadorOpenMeteo onImportado={cargarRegistros} />
        </div>

        {error && (
          <p role="alert" className="alert alert-error">
            {error}
          </p>
        )}

        <section aria-labelledby="titulo-ultimos" className="card overflow-hidden">
          <div className="flex items-baseline justify-between gap-4 px-6 pb-4 pt-5">
            <h2 id="titulo-ultimos" className="card-title">
              Últimos registros
            </h2>
            {!cargando && registros.length > 0 && (
              <p className="text-xs text-ink-3">Se muestran los 20 más recientes</p>
            )}
          </div>

          {!cargando && registros.length === 0 ? (
            <div className="border-t border-line px-6 py-14 text-center">
              <p className="font-medium text-ink">Todavía no hay registros</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">
                Importa un rango de fechas desde Open-Meteo o guarda una lectura manual para
                empezar a trabajar con los datos.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-canvas text-xs font-medium text-ink-2">
                    <th scope="col" className="px-6 py-2.5">
                      Fecha
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Hora
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Temp. (°C)
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Humedad (%)
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Viento (km/h)
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Fuente
                    </th>
                    {esAdmin && (
                      <th scope="col" className="px-6 py-2.5 text-right">
                        <span className="sr-only">Acciones</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {cargando
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>
                          <td colSpan={columnas} className="px-6 py-3">
                            <div className="skeleton h-5 w-full" />
                          </td>
                        </tr>
                      ))
                    : registros.map((r) => (
                        <tr
                          key={r.id}
                          className="text-ink transition-colors duration-150 hover:bg-canvas/70"
                        >
                          <td className="whitespace-nowrap px-6 py-2.5 tabular-nums">{r.fecha}</td>
                          <td className="px-3 py-2.5 tabular-nums text-ink-2">{r.hora}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {r.temperatura ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{r.humedad ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {r.velocidad_viento ?? '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`badge ${
                                r.fuente === 'manual'
                                  ? 'bg-canvas text-ink-2'
                                  : 'bg-accent-soft text-accent-strong'
                              }`}
                            >
                              {r.fuente === 'manual' ? 'Manual' : 'Open-Meteo'}
                            </span>
                          </td>
                          {esAdmin && (
                            <td className="px-4 py-1.5">
                              <div className="flex justify-end gap-0.5">
                                <button
                                  onClick={() => setRegistroEditando(r)}
                                  aria-label="Editar registro"
                                  className="btn-icon hover:text-accent"
                                >
                                  <Pencil size={16} strokeWidth={1.75} />
                                </button>
                                <button
                                  onClick={() => handleEliminar(r.id)}
                                  disabled={eliminandoId === r.id}
                                  aria-label="Eliminar registro"
                                  className="btn-icon hover:bg-danger-soft hover:text-danger"
                                >
                                  <Trash2 size={16} strokeWidth={1.75} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {registroEditando && accessToken && (
        <EditarRegistroModal
          registro={registroEditando}
          accessToken={accessToken}
          onCerrar={() => setRegistroEditando(null)}
          onGuardado={() => {
            setRegistroEditando(null)
            cargarRegistros()
          }}
        />
      )}
    </div>
  )
}
