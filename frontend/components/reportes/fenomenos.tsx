'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Scale, Sun, Trash2, Waves } from 'lucide-react'
import { CardAnomalias, COLOR_FASE, FASE, INTENSIDAD, type TarjetaAnomalias, type TarjetaEventos } from '@/components/tarjetas-clima'
import { CajaError, Cargando, EnPalabras, Pildoras, useDatosPanel, OPCIONES_VARIABLE, type Variable } from '@/components/paneles/ui'
import { apiFetch } from '@/lib/api'

type Respuesta = { texto: string; tarjetas: { tipo: string }[]; puede_editar: boolean }

const CONCEPTOS = [
  {
    Icono: Sun,
    color: COLOR_FASE.el_nino,
    titulo: 'El Niño',
    texto:
      'El agua del océano Pacífico, frente a Perú y Ecuador, se calienta más de lo normal durante varios meses. Eso cambia el viento y las lluvias en buena parte de Sudamérica, incluida Bolivia.',
  },
  {
    Icono: Waves,
    color: COLOR_FASE.la_nina,
    titulo: 'La Niña',
    texto: 'Es lo contrario: el Pacífico se enfría más de lo normal. También altera las lluvias y las temperaturas, pero en otro sentido.',
  },
  {
    Icono: Scale,
    color: '#0E7C9B',
    titulo: 'Anomalía',
    texto:
      'Es cuánto se aparta un mes de lo habitual para ese mes. Si noviembre suele tener 21 °C y este año tuvo 22,5 °C, la anomalía es +1,5 °C: un mes más cálido de lo normal.',
  },
]

const fmt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`

export default function Fenomenos() {
  const [variable, setVariable] = useState<Variable>('temperatura')
  const { datos, error, cargando, recargar } = useDatosPanel<Respuesta>(`/paneles/fenomenos?variable=${variable}`)
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)

  const eventos = datos?.tarjetas.find((t) => t.tipo === 'eventos') as TarjetaEventos | undefined
  const anomalias = datos?.tarjetas.find((t) => t.tipo === 'anomalias') as TarjetaAnomalias | undefined
  const u = anomalias?.unidad ?? ''
  const porFase = (anomalias?.por_fase ?? []).filter((f) => f.anomalia_media !== null)

  async function eliminar(id: string) {
    if (!window.confirm('¿Eliminar este evento? Dejará de usarse en las proyecciones y en las anomalías.')) return
    setErrorBorrar(null)
    try {
      await apiFetch(`/fenomenos/eventos/${id}`, { method: 'DELETE' })
      recargar()
    } catch (e) {
      setErrorBorrar(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        {CONCEPTOS.map(({ Icono, color, titulo, texto }, i) => (
          <div
            key={titulo}
            className="group relative animate-aparecer overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="absolute -right-8 -top-8 size-24 rounded-full opacity-10 transition group-hover:scale-125" style={{ backgroundColor: color }} />
            <div className="flex size-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}1a`, color }}>
              <Icono size={22} />
            </div>
            <h3 className="mt-4 font-semibold text-slate-900">{titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{texto}</p>
          </div>
        ))}
      </div>

      <Pildoras etiqueta="Variable" opciones={OPCIONES_VARIABLE} valor={variable} onCambio={(v) => setVariable(v)} />

      {cargando && <Cargando mensajes={['Buscando los eventos El Niño y La Niña…', 'Calculando lo habitual de cada mes…', 'Midiendo las anomalías…']} />}
      {error && <CajaError mensaje={error} onReintentar={recargar} />}
      {errorBorrar && <p className="alert-error">{errorBorrar}</p>}

      {datos && !cargando && (
        <>
          {eventos?.evento_actual ? (
            <div className="relative animate-aparecer overflow-hidden rounded-3xl bg-linear-to-r from-[#0B4F6C] to-[#d97706] p-6 text-white shadow-lg">
              <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full bg-amber-200/30 blur-2xl animate-pulso-sol" />
              <p className="relative text-xs uppercase tracking-wider text-white/75">Evento en curso</p>
              <p className="relative mt-1 text-2xl font-semibold">{eventos.evento_actual}</p>
              <p className="relative mt-1 text-sm text-white/80">Las proyecciones lo toman en cuenta cuando mejora el resultado.</p>
            </div>
          ) : (
            <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">Ahora no hay un evento El Niño ni La Niña registrado como en curso: la fase es neutra.</p>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
            <div className="animate-aparecer rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">¿Cómo cambia el clima en cada fase?</p>
              <p className="text-xs text-slate-500">Anomalía promedio de los meses de cada fase. Sobre la línea: más alto de lo habitual; debajo: más bajo.</p>
              {porFase.length === 0 ? (
                <p className="mt-6 text-sm text-slate-400">Todavía no hay datos suficientes.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={porFase.map((f) => ({ fase: f.etiqueta, valor: f.anomalia_media, meses: f.meses, clave: f.fase }))} margin={{ top: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="fase" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} unit={` ${u}`} width={56} />
                    <Tooltip formatter={(v) => `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)} ${u}`} />
                    <ReferenceLine y={0} stroke="#64748b" />
                    <Bar dataKey="valor" name="Anomalía media" radius={[8, 8, 8, 8]}>
                      {porFase.map((f) => (
                        <Cell key={f.fase} fill={COLOR_FASE[f.fase as keyof typeof COLOR_FASE] ?? '#94a3b8'} />
                      ))}
                      <LabelList dataKey="meses" position="top" formatter={(v) => `${v} meses`} style={{ fontSize: 10, fill: '#64748b' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <EnPalabras texto={datos.texto} titulo="Lo que dicen tus datos" />
          </div>

          {anomalias && (
            <div className="animate-aparecer">
              <p className="text-sm font-semibold text-slate-900">Anomalía mes a mes (últimos 24 meses)</p>
              <p className="text-xs text-slate-500">Cada barra es un mes, coloreada según la fase que hubo ese mes.</p>
              <CardAnomalias t={anomalias} />
            </div>
          )}

          <div className="animate-aparecer rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Eventos registrados</p>
              {datos.puede_editar && (
                <Link href="/asistente" className="text-xs font-medium text-[#0E7C9B] underline">
                  Registrar un evento nuevo (en el asistente)
                </Link>
              )}
            </div>
            {!eventos || eventos.eventos.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No hay eventos registrados.</p>
            ) : (
              <ol className="mt-4 space-y-3 border-l-2 border-slate-100 pl-5">
                {eventos.eventos.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      className="absolute -left-[27px] top-1.5 size-3 rounded-full ring-4 ring-white"
                      style={{ backgroundColor: COLOR_FASE[e.fase as keyof typeof COLOR_FASE] ?? '#94a3b8' }}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{e.nombre}</p>
                        <p className="text-xs text-slate-500">
                          {FASE[e.fase] ?? e.fase} · {INTENSIDAD[e.intensidad] ?? e.intensidad} · {fmt(e.fecha_inicio)} – {e.fecha_fin ? fmt(e.fecha_fin) : 'en curso'}
                        </p>
                      </div>
                      {datos.puede_editar && (
                        <button onClick={() => eliminar(e.id)} aria-label={`Eliminar ${e.nombre}`} className="icon-btn hover:bg-red-50 hover:text-red-600">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  )
}
