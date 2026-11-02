'use client'

import { useEffect, useState, useCallback } from 'react'
import { Thermometer, Pencil, Trash2, Droplets, Wind, Inbox, CloudDownload, PenLine, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, EmptyState, LoadingState } from '@/components/page-shell'
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
    <span className={`badge ${fuente === 'manual' ? 'bg-accent-50 text-accent-700' : 'bg-brand-50 text-brand-800'}`}>
      {fuente === 'manual' ? 'Manual' : 'Open-Meteo'}
    </span>
  )
}

function fechaEs(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
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
  const [modo, setModo] = useState<'importar' | 'manual'>('importar')

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
    <div className="flex justify-end gap-1">
      <button
        onClick={() => setRegistroEditando(r)}
        aria-label={`Editar registro del ${fechaEs(r.fecha)} ${r.hora.slice(0, 5)}`}
        className="icon-btn hover:bg-brand-50 hover:text-brand-700"
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={() => handleEliminar(r.id)}
        disabled={eliminandoId === r.id}
        aria-label={`Eliminar registro del ${fechaEs(r.fecha)} ${r.hora.slice(0, 5)}`}
        className="icon-btn hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )

  const rango =
    registros.length > 0
      ? `${fechaEs(registros[registros.length - 1].fecha)} – ${fechaEs(registros[0].fecha)}`
      : null

  return (
    <PageShell>
      <PageHeader
        icon={Thermometer}
        title="Registros climáticos"
        description="Temperatura, humedad y velocidad del viento de Cochabamba."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Ingreso de datos */}
        <section aria-label="Ingreso de datos" className="space-y-3 xl:sticky xl:top-20">
          <div role="tablist" aria-label="Forma de ingreso" className="grid grid-cols-2 gap-2">
            <button
              role="tab"
              aria-selected={modo === 'importar'}
              aria-controls="panel-importar"
              onClick={() => setModo('importar')}
              className={`seg ${modo === 'importar' ? 'seg-on' : 'seg-off'}`}
            >
              <CloudDownload size={16} aria-hidden /> Importar
            </button>
            <button
              role="tab"
              aria-selected={modo === 'manual'}
              aria-controls="panel-manual"
              onClick={() => setModo('manual')}
              className={`seg ${modo === 'manual' ? 'seg-on' : 'seg-off'}`}
            >
              <PenLine size={16} aria-hidden /> Registro manual
            </button>
          </div>
          {/* Ambos formularios permanecen montados para no perder lo escrito al cambiar de pestaña */}
          <div id="panel-importar" role="tabpanel" hidden={modo !== 'importar'}>
            <ImportadorOpenMeteo onImportado={cargarRegistros} />
          </div>
          <div id="panel-manual" role="tabpanel" hidden={modo !== 'manual'}>
            <FormularioRegistroManual onGuardado={cargarRegistros} />
          </div>
          <aside className="rounded-xl border border-slate-200 bg-white/60 p-4 text-xs leading-relaxed text-slate-600">
            <p className="mb-2 flex items-center gap-1.5 font-medium text-slate-800">
              <Info size={14} aria-hidden /> Reglas de los datos
            </p>
            <ul className="list-disc space-y-1 pl-4">
              <li>La importación repetida no duplica registros (misma fecha, hora y fuente).</li>
              <li>Humedad entre 0 y 100 %; viento sin valores negativos; no se aceptan fechas futuras.</li>
              <li>Los datos de Open-Meteo pueden tardar unos días en estar completos.</li>
            </ul>
          </aside>
        </section>

        {/* Tabla */}
        <section className="card min-w-0 overflow-hidden" aria-labelledby="ultimos">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="ultimos" className="text-base font-semibold text-slate-900">
                Últimos registros
              </h2>
              <p className="text-sm text-slate-600">
                {rango ? `Las ${registros.length} lecturas más recientes (${rango}).` : 'Las 20 lecturas más recientes.'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand-500" aria-hidden /> Open-Meteo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent-500" aria-hidden /> Manual
              </span>
            </div>
          </div>

          {error && (
            <p role="alert" className="alert-error m-4">
              {error}
            </p>
          )}

          {cargando ? (
            <div className="px-5">
              <LoadingState text="Cargando registros…" />
            </div>
          ) : registros.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Todavía no hay registros"
              text="Importa datos desde Open-Meteo o guarda una lectura manual para empezar."
            />
          ) : (
            <>
              {/* Tabla: tablet y escritorio */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th scope="col" className="th pl-5">Fecha</th>
                      <th scope="col" className="th">Hora</th>
                      <th scope="col" className="th text-right">Temp. (°C)</th>
                      <th scope="col" className="th text-right">Humedad (%)</th>
                      <th scope="col" className="th text-right">Viento (km/h)</th>
                      <th scope="col" className="th">Fuente</th>
                      {esAdmin && (
                        <th scope="col" className="th pr-5">
                          <span className="sr-only">Acciones</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {registros.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pl-5 pr-3 tabular-nums">{fechaEs(r.fecha)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{r.hora.slice(0, 5)}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">{r.temperatura ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.humedad ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.velocidad_viento ?? '—'}</td>
                        <td className="px-3 py-2.5"><FuenteBadge fuente={r.fuente} /></td>
                        {esAdmin && <td className="py-2 pl-3 pr-4">{acciones(r)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas: celular */}
              <ul className="divide-y divide-slate-100 px-5 md:hidden">
                {registros.map((r) => (
                  <li key={r.id} className="py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {fechaEs(r.fecha)} <span className="font-normal text-slate-500">· {r.hora.slice(0, 5)}</span>
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
      </div>

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
