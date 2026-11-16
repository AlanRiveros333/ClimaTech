'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellRing, CloudRain, Snowflake, Sun, Wind } from 'lucide-react'
import NavBar from '@/components/nav-bar'
import { apiFetch } from '@/lib/api'

type DiaPronostico = {
  fecha: string
  lluvia_mm: number | null
  prob_lluvia: number | null
  tmax: number | null
  tmin: number | null
  rafaga: number | null
}
type Alerta = { tipo: string; titulo: string; nivel: 'alto' | 'medio'; fecha: string; mensaje: string }
type Pronostico = { fuente: string; dias: DiaPronostico[]; alertas: Alerta[] }
type Resumen = {
  simulacion: boolean
  alertas_detectadas: Alerta[]
  destinatarios: number
  enviados: number
  sin_novedades: number
  errores: string[]
}
type Historial = {
  tipo: string
  nivel: string
  fecha_pronostico: string
  enviado_en: string
  profiles: { nombre_completo: string } | null
}

function fmt(v: number | null, unidad: string, decimales = 0) {
  return v === null || v === undefined ? '—' : `${v.toFixed(decimales)}${unidad}`
}

function IconoAlerta({ tipo }: { tipo: string }) {
  if (tipo === 'lluvia') return <CloudRain size={18} />
  if (tipo === 'helada') return <Snowflake size={18} />
  if (tipo === 'calor') return <Sun size={18} />
  return <Wind size={18} />
}

export default function AlertasPage() {
  const [activas, setActivas] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [pronostico, setPronostico] = useState<Pronostico | null>(null)
  const [errorPronostico, setErrorPronostico] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [simular, setSimular] = useState(true)
  const [revisando, setRevisando] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [historial, setHistorial] = useState<Historial[]>([])

  const cargarHistorial = useCallback(async () => {
    try {
      setHistorial(await apiFetch<Historial[]>('/alertas/historial'))
    } catch {
      /* solo administrador: se ignora si no aplica */
    }
  }, [])

  useEffect(() => {
    async function iniciar() {
      try {
        const [pref, me] = await Promise.all([
          apiFetch<{ alertas_activas: boolean; email: string | null }>('/alertas/preferencia'),
          apiFetch<{ rol: string }>('/me'),
        ])
        setActivas(pref.alertas_activas)
        setEmail(pref.email)
        const admin = me.rol === 'administrador'
        setEsAdmin(admin)
        if (admin) cargarHistorial()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error inesperado.')
      }
      try {
        setPronostico(await apiFetch<Pronostico>('/alertas/pronostico'))
      } catch (err) {
        setErrorPronostico(err instanceof Error ? err.message : 'No se pudo cargar el pronóstico.')
      }
    }
    iniciar()
  }, [cargarHistorial])

  async function cambiarPreferencia(valor: boolean) {
    setGuardando(true)
    setError(null)
    try {
      await apiFetch('/alertas/preferencia', {
        method: 'PATCH',
        body: JSON.stringify({ alertas_activas: valor }),
      })
      setActivas(valor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setGuardando(false)
    }
  }

  async function revisarAhora() {
    setRevisando(true)
    setError(null)
    setResumen(null)
    try {
      const data = await apiFetch<Resumen>(`/alertas/revisar?simular=${simular}`, { method: 'POST' })
      setResumen(data)
      if (!simular) cargarHistorial()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado.')
    } finally {
      setRevisando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#db2777]/10">
            <BellRing size={22} color="#db2777" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Alertas climáticas</h1>
            <p className="text-sm text-slate-500">Avisos por correo cuando se pronostica lluvia intensa, helada, calor o viento fuerte</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recibir alertas en mi correo</h2>
              <p className="text-sm text-slate-500">
                {email ? `Se enviarán a ${email}.` : 'Se enviarán al correo con el que te registraste.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={activas}
              disabled={guardando}
              onClick={() => cambiarPreferencia(!activas)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${activas ? 'bg-[#0E7C9B]' : 'bg-slate-300'}`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${activas ? 'left-[22px]' : 'left-0.5'}`}
              />
              <span className="sr-only">Activar alertas por correo</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Pronóstico próximo</h2>
          <p className="mb-4 text-sm text-slate-500">
            Fuente: Open-Meteo (modelo meteorológico externo). Las alertas no provienen de los métodos estadísticos de
            ClimaTech.
          </p>

          {errorPronostico && <p className="text-sm text-red-600">{errorPronostico}</p>}
          {!pronostico && !errorPronostico && <p className="text-sm text-slate-400">Cargando...</p>}

          {pronostico && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {pronostico.dias.map((d) => (
                  <div key={d.fecha} className="rounded-xl border border-slate-200 p-4 text-sm">
                    <p className="font-medium text-slate-900">{d.fecha}</p>
                    <p className="mt-2 text-slate-600">Lluvia: {fmt(d.lluvia_mm, ' mm', 1)} ({fmt(d.prob_lluvia, '%')})</p>
                    <p className="text-slate-600">Máx / mín: {fmt(d.tmax, '°C', 1)} / {fmt(d.tmin, '°C', 1)}</p>
                    <p className="text-slate-600">Ráfagas: {fmt(d.rafaga, ' km/h')}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {pronostico.alertas.length === 0 ? (
                  <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                    Sin alertas para los próximos días según los umbrales del sistema.
                  </p>
                ) : (
                  pronostico.alertas.map((a) => (
                    <div
                      key={`${a.tipo}-${a.fecha}`}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                        a.nivel === 'alto' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      <IconoAlerta tipo={a.tipo} />
                      <p>
                        <span className="font-medium">{a.fecha} · {a.titulo}.</span> {a.mensaje}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {esAdmin && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Panel del administrador</h2>
              <p className="text-sm text-slate-500">Revisa el pronóstico y envía las alertas a quienes las activaron.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={simular} onChange={(e) => setSimular(e.target.checked)} className="h-4 w-4" />
                Solo simular (no envía correos)
              </label>
              <button
                type="button"
                onClick={revisarAhora}
                disabled={revisando}
                className="rounded-lg bg-gradient-to-r from-[#db2777] to-[#0E7C9B] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {revisando ? 'Revisando...' : simular ? 'Simular revisión' : 'Revisar y enviar ahora'}
              </button>
            </div>

            {resumen && (
              <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                <p>
                  {resumen.simulacion ? 'Simulación: ' : ''}
                  {resumen.alertas_detectadas.length} alerta(s) detectada(s) · {resumen.destinatarios} suscriptor(es) ·{' '}
                  {resumen.simulacion ? 'se enviarían' : 'enviados'}: {resumen.enviados} · sin novedades: {resumen.sin_novedades}
                </p>
                {resumen.errores.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-red-600">
                    {resumen.errores.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {historial.length > 0 && (
              <div className="overflow-x-auto">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Últimas alertas enviadas</h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4">Usuario</th>
                      <th className="py-2 pr-4">Tipo</th>
                      <th className="py-2 pr-4">Nivel</th>
                      <th className="py-2 pr-4">Fecha pronóstico</th>
                      <th className="py-2 pr-4">Enviado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((h, i) => (
                      <tr key={i} className="border-b border-slate-100 text-slate-700">
                        <td className="py-2 pr-4">{h.profiles?.nombre_completo ?? '—'}</td>
                        <td className="py-2 pr-4">{h.tipo}</td>
                        <td className="py-2 pr-4">{h.nivel}</td>
                        <td className="py-2 pr-4">{h.fecha_pronostico}</td>
                        <td className="py-2 pr-4">{new Date(h.enviado_en).toLocaleString('es-BO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
