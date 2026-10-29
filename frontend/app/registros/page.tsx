'use client'

import { useEffect, useState, useCallback } from 'react'
import { Thermometer, Pencil, Trash2, Droplets, Wind, Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, CardTitle, EmptyState, LoadingState } from '@/components/page-shell'
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

function FuenteBadge({ fuente }: { fuente: string }) {
  return (
    <span
      className={`badge ${
        fuente === 'manual' ? 'bg-accent-50 text-accent-700' : 'bg-brand-50 text-brand-800'
      }`}
    >
      {fuente === 'manual' ? 'Manual' : 'Open-Meteo'}
    </span>
  )
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

  const acciones = (r: Registro) => (
    <div className="flex gap-1">
      <button
        onClick={() => setRegistroEditando(r)}
        aria-label="Editar registro"
        className="icon-btn hover:bg-brand-50 hover:text-brand-700"
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={() => handleEliminar(r.id)}
        disabled={eliminandoId === r.id}
        aria-label="Eliminar registro"
        className="icon-btn hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )

  return (
    <PageShell>
      <PageHeader
        icon={Thermometer}
        title="Registros climáticos"
        description="Temperatura, humedad y velocidad del viento de Cochabamba."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <FormularioRegistroManual onGuardado={cargarRegistros} />
        <ImportadorOpenMeteo onImportado={cargarRegistros} />
      </div>

      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      <section className="card p-5 sm:p-6" aria-labelledby="ultimos">
        <div id="ultimos">
          <CardTitle title="Últimos registros" description="Se muestran las 20 lecturas más recientes." />
        </div>

        {cargando ? (
          <LoadingState text="Cargando registros…" />
        ) : registros.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Todavía no hay registros"
            text="Importa datos desde Open-Meteo o guarda una lectura manual para empezar."
          />
        ) : (
          <>
            {/* Tabla: tablet y escritorio */}
            <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th scope="col" className="px-5 py-2.5 sm:px-6">Fecha</th>
                    <th scope="col" className="px-3 py-2.5">Hora</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Temp. (°C)</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Humedad (%)</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Viento (km/h)</th>
                    <th scope="col" className="px-3 py-2.5">Fuente</th>
                    {esAdmin && <th scope="col" className="px-5 py-2.5 sm:px-6"><span className="sr-only">Acciones</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {registros.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 sm:px-6">{r.fecha}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.hora}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.temperatura ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.humedad ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.velocidad_viento ?? '—'}</td>
                      <td className="px-3 py-2.5"><FuenteBadge fuente={r.fuente} /></td>
                      {esAdmin && <td className="px-5 py-2.5 sm:px-6">{acciones(r)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tarjetas: celular */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {registros.map((r) => (
                <li key={r.id} className="py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {r.fecha} <span className="font-normal text-slate-500">· {r.hora}</span>
                      </p>
                      <div className="mt-1"><FuenteBadge fuente={r.fuente} /></div>
                    </div>
                    {esAdmin && acciones(r)}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <dt className="flex items-center gap-1 text-xs text-slate-500"><Thermometer size={12} aria-hidden />Temp.</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-slate-900">{r.temperatura ?? '—'}<span className="text-xs font-normal text-slate-500"> °C</span></dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <dt className="flex items-center gap-1 text-xs text-slate-500"><Droplets size={12} aria-hidden />Humedad</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-slate-900">{r.humedad ?? '—'}<span className="text-xs font-normal text-slate-500"> %</span></dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                      <dt className="flex items-center gap-1 text-xs text-slate-500"><Wind size={12} aria-hidden />Viento</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-slate-900">{r.velocidad_viento ?? '—'}<span className="text-xs font-normal text-slate-500"> km/h</span></dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

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
    </PageShell>
  )
}
