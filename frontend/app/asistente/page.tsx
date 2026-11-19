'use client'

import { useEffect, useRef, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Bot, Pencil, Send, Trash2, User } from 'lucide-react'
import NavBar from '@/components/nav-bar'
import EditarRegistroModal, { RegistroEditable } from '@/components/editar-registro-modal'
import { apiFetch } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

// ------------------------------------------------------------------ tipos
type Boton = { texto: string; mensaje: string }
type Accion = {
  tipo: string
  params: Record<string, string>
  estado: 'pendiente' | 'confirmada'
  descripcion: string
}
type Punto = { fecha: string; valor: number }
type TarjetaProyeccion = {
  tipo: 'proyeccion'
  variable: string
  unidad: string
  metodo: string
  historico: Punto[]
  proyeccion: Punto[]
  prueba: { fecha: string; real: number; predicho: number }[]
  metodos: { nombre: string; mae: number; rmse: number; elegido: boolean; mejor: boolean }[]
}
type TarjetaEventos = {
  tipo: 'eventos'
  evento_actual: string | null
  puede_editar: boolean
  eventos: { id: string; nombre: string; fase: string; intensidad: string; fecha_inicio: string; fecha_fin: string | null }[]
}
type TarjetaAnomalias = {
  tipo: 'anomalias'
  variable: string
  unidad: string
  por_fase: { fase: string; etiqueta: string; meses: number; anomalia_media: number | null }[]
  mensual: { mes: string; anomalia: number | null; fase: string }[]
}
type TarjetaPronostico = {
  tipo: 'pronostico'
  dias: { fecha: string; lluvia_mm: number | null; prob_lluvia: number | null; tmax: number | null; tmin: number | null; rafaga: number | null }[]
  alertas: { tipo: string; titulo: string; nivel: 'alto' | 'medio'; fecha: string; mensaje: string }[]
}
type TarjetaResumen = {
  tipo: 'resumen'
  dias_con_datos: number
  primer_dia: string
  ultimo_dia: string
  dias_rango: number
  cobertura_pct: number
}
type TarjetaRegistros = { tipo: 'registros'; filas: RegistroEditable[]; puede_editar: boolean }
type TarjetaFormRegistro = {
  tipo: 'form_registro'
  valores: { temperatura?: number; humedad?: number; velocidad_viento?: number; hora?: string }
  fecha: string | null
}
type TarjetaFormEvento = { tipo: 'form_evento' }
type TarjetaReportes = {
  tipo: 'reportes'
  filas: { id: string; periodo_inicio: string; periodo_fin: string; archivo_url: string; created_at: string }[]
}
type TarjetaHistorial = {
  tipo: 'historial_alertas'
  filas: { tipo: string; nivel: string; fecha_pronostico: string; enviado_en: string; profiles: { nombre_completo: string } | null }[]
}
type Tarjeta =
  | TarjetaProyeccion
  | TarjetaEventos
  | TarjetaAnomalias
  | TarjetaPronostico
  | TarjetaResumen
  | TarjetaRegistros
  | TarjetaFormRegistro
  | TarjetaFormEvento
  | TarjetaReportes
  | TarjetaHistorial

type Contexto = Record<string, unknown>
type RespuestaApi = {
  respuesta: string
  tarjetas: Tarjeta[]
  botones: Boton[]
  accion: Accion | null
  contexto: Contexto
  interprete: string
}
type Mensaje = {
  id: number
  rol: 'usuario' | 'asistente'
  texto: string
  tarjetas?: Tarjeta[]
  botones?: Boton[]
  accion?: Accion | null
  enlace?: { texto: string; url: string }
  interprete?: string
}

type Callbacks = {
  guardarRegistro: (d: Record<string, unknown>) => Promise<void>
  guardarEvento: (d: Record<string, unknown>) => Promise<void>
  eliminarRegistro: (id: string) => void
  editarRegistro: (r: RegistroEditable) => void
  eliminarEvento: (id: string) => void
}

const ATAJOS: Boton[] = [
  { texto: 'Proyectar', mensaje: 'proyecta la temperatura de los próximos 7 días' },
  { texto: 'Proyección con El Niño', mensaje: 'proyecta la temperatura de los próximos 7 días tomando en cuenta El Niño' },
  { texto: 'Registrar dato', mensaje: 'quiero registrar un dato' },
  { texto: 'Ver registros', mensaje: 'muéstrame los últimos registros' },
  { texto: 'Importar datos', mensaje: 'importa datos de Open-Meteo' },
  { texto: 'Mis datos', mensaje: '¿cuántos datos tengo?' },
  { texto: 'Reporte PDF', mensaje: 'genera un reporte' },
  { texto: 'Mis reportes', mensaje: 'muéstrame mis reportes anteriores' },
  { texto: 'Fenómenos', mensaje: '¿hay algún evento climático en curso?' },
  { texto: 'Anomalías', mensaje: '¿qué anomalías tuvo la temperatura?' },
  { texto: 'Pronóstico y alertas', mensaje: 'pronóstico de lluvia' },
  { texto: 'Métodos', mensaje: 'explícame los métodos' },
]

const SALUDO =
  'Hola, soy el asistente de ClimaTech. Desde aquí puedes hacerlo todo, escribiendo o con los botones de arriba: proyectar variables climáticas (con o sin El Niño / La Niña), registrar e importar datos, generar reportes, ver fenómenos climáticos y gestionar tus alertas por correo. Antes de importar datos, generar reportes o enviar correos siempre te pido confirmación. ¿Qué quieres hacer?'

const COLOR_FASE = { el_nino: '#d97706', la_nina: '#1d4ed8', neutro: '#94a3b8' }
const FASE: Record<string, string> = { el_nino: 'El Niño', la_nina: 'La Niña' }
const INTENSIDAD: Record<string, string> = { debil: 'Débil', moderado: 'Moderado', fuerte: 'Fuerte', muy_fuerte: 'Muy fuerte' }

function hoyLocal() {
  const ahora = new Date()
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().split('T')[0]
}

const CAMPO = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
const BOTON_PRIMARIO =
  'rounded-lg bg-gradient-to-r from-[#0B4F6C] to-[#0E7C9B] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50'

// ------------------------------------------------------------- tarjetas
function CardProyeccion({ t }: { t: TarjetaProyeccion }) {
  const [detalle, setDetalle] = useState(false)
  const datos = [
    ...t.historico.map((p, i) => ({
      fecha: p.fecha.slice(5),
      historico: p.valor as number | undefined,
      proyeccion: (i === t.historico.length - 1 ? p.valor : undefined) as number | undefined,
    })),
    ...t.proyeccion.map((p) => ({
      fecha: p.fecha.slice(5),
      historico: undefined as number | undefined,
      proyeccion: p.valor as number | undefined,
    })),
  ]
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={datos}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} unit={` ${t.unidad}`} width={64} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="historico" name="Histórico" stroke="#0f172a" dot={false} connectNulls />
          <Line type="monotone" dataKey="proyeccion" name={`Proyección (${t.metodo})`} stroke="#d97706" strokeDasharray="5 5" dot connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-3">Método</th>
            <th className="py-1 pr-3">MAE ({t.unidad})</th>
            <th className="py-1 pr-3">RMSE ({t.unidad})</th>
          </tr>
        </thead>
        <tbody>
          {t.metodos.map((m) => (
            <tr key={m.nombre} className={`border-b border-slate-100 ${m.elegido ? 'bg-emerald-50 font-medium' : ''} text-slate-700`}>
              <td className="py-1 pr-3">
                {m.nombre}
                {m.elegido && <span className="ml-1 text-emerald-700">★ usado</span>}
                {m.mejor && !m.elegido && <span className="ml-1 text-slate-400">(menor error)</span>}
              </td>
              <td className="py-1 pr-3">{m.mae}</td>
              <td className="py-1 pr-3">{m.rmse}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => setDetalle((v) => !v)} className="text-xs font-medium text-[#0E7C9B] underline">
        {detalle ? 'Ocultar detalle técnico' : 'Ver detalle técnico (prueba real vs. predicho)'}
      </button>
      {detalle && (
        <div>
          <p className="mb-2 text-xs text-slate-500">Lo que {t.metodo} predijo para los últimos días, que no vio al entrenar.</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={t.prueba.map((p) => ({ fecha: p.fecha.slice(5), real: p.real, predicho: p.predicho }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={64} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="real" name="Real" stroke="#0f172a" strokeWidth={2} />
              <Line type="monotone" dataKey="predicho" name="Predicho" stroke="#7c3aed" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function CardEventos({ t, cb }: { t: TarjetaEventos; cb: Callbacks }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
      {t.evento_actual && <p className="mb-2 rounded-lg bg-amber-50 p-2 font-medium text-amber-800">Evento en curso: {t.evento_actual}</p>}
      <table className="w-full text-left">
        <tbody>
          {t.eventos.map((e) => (
            <tr key={e.id} className="border-b border-slate-100 text-slate-700">
              <td className="py-1 pr-3">{e.nombre}</td>
              <td className="py-1 pr-3">
                {FASE[e.fase] ?? e.fase} · {INTENSIDAD[e.intensidad] ?? e.intensidad}
              </td>
              <td className="py-1 pr-3">
                {e.fecha_inicio} – {e.fecha_fin ?? 'en curso'}
              </td>
              {t.puede_editar && (
                <td className="py-1">
                  <button onClick={() => cb.eliminarEvento(e.id)} aria-label="Eliminar evento" className="text-slate-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CardAnomalias({ t }: { t: TarjetaAnomalias }) {
  const datos = t.mensual.map((m) => ({
    mes: m.mes,
    el_nino: m.fase === 'el_nino' ? m.anomalia : null,
    la_nina: m.fase === 'la_nina' ? m.anomalia : null,
    neutro: m.fase === 'neutro' ? m.anomalia : null,
  }))
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={datos}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit={` ${t.unidad}`} width={60} />
          <Tooltip />
          <Legend />
          <ReferenceLine y={0} stroke="#64748b" />
          <Bar dataKey="el_nino" name="El Niño" stackId="a" fill={COLOR_FASE.el_nino} />
          <Bar dataKey="la_nina" name="La Niña" stackId="a" fill={COLOR_FASE.la_nina} />
          <Bar dataKey="neutro" name="Neutro" stackId="a" fill={COLOR_FASE.neutro} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function CardPronostico({ t }: { t: TarjetaPronostico }) {
  const f = (v: number | null, d = 0) => (v === null ? '—' : v.toFixed(d))
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
      <div className="grid gap-2 sm:grid-cols-3">
        {t.dias.map((d) => (
          <div key={d.fecha} className="rounded-lg border border-slate-200 p-2 text-slate-700">
            <p className="font-medium text-slate-900">{d.fecha}</p>
            <p>
              Lluvia: {f(d.lluvia_mm, 1)} mm ({f(d.prob_lluvia)}%)
            </p>
            <p>
              Máx/mín: {f(d.tmax, 1)}° / {f(d.tmin, 1)}°
            </p>
          </div>
        ))}
      </div>
      {t.alertas.map((a) => (
        <p
          key={`${a.tipo}-${a.fecha}`}
          className={`rounded-lg border p-2 ${a.nivel === 'alto' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
        >
          {a.fecha} · {a.titulo}. {a.mensaje}
        </p>
      ))}
    </div>
  )
}

function CardResumen({ t }: { t: TarjetaResumen }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center text-xs">
      <div>
        <p className="text-lg font-semibold text-slate-900">{t.dias_con_datos}</p>
        <p className="text-slate-500">días con datos</p>
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-900">{t.cobertura_pct.toFixed(0)}%</p>
        <p className="text-slate-500">cobertura</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">
          {t.primer_dia} → {t.ultimo_dia}
        </p>
        <p className="text-slate-500">rango</p>
      </div>
    </div>
  )
}

function CardRegistros({ t, cb }: { t: TarjetaRegistros; cb: Callbacks }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-3">Fecha</th>
            <th className="py-1 pr-3">Hora</th>
            <th className="py-1 pr-3">Temp.</th>
            <th className="py-1 pr-3">Hum.</th>
            <th className="py-1 pr-3">Viento</th>
            <th className="py-1 pr-3">Fuente</th>
            {t.puede_editar && <th className="py-1" />}
          </tr>
        </thead>
        <tbody>
          {t.filas.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 text-slate-700">
              <td className="py-1 pr-3">{r.fecha}</td>
              <td className="py-1 pr-3">{r.hora.slice(0, 5)}</td>
              <td className="py-1 pr-3">{r.temperatura ?? '—'}</td>
              <td className="py-1 pr-3">{r.humedad ?? '—'}</td>
              <td className="py-1 pr-3">{r.velocidad_viento ?? '—'}</td>
              <td className="py-1 pr-3">{r.fuente === 'manual' ? 'Manual' : 'Open-Meteo'}</td>
              {t.puede_editar && (
                <td className="py-1">
                  <div className="flex gap-2">
                    <button onClick={() => cb.editarRegistro(r)} aria-label="Editar registro" className="text-slate-400 hover:text-[#0E7C9B]">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => cb.eliminarRegistro(r.id)} aria-label="Eliminar registro" className="text-slate-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormRegistro({ t, cb }: { t: TarjetaFormRegistro; cb: Callbacks }) {
  const [fecha, setFecha] = useState(t.fecha ?? '')
  const [hora, setHora] = useState(t.valores.hora ?? '')
  const [temperatura, setTemperatura] = useState(t.valores.temperatura?.toString() ?? '')
  const [humedad, setHumedad] = useState(t.valores.humedad?.toString() ?? '')
  const [viento, setViento] = useState(t.valores.velocidad_viento?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [hoy] = useState(hoyLocal)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      await cb.guardarRegistro({
        fecha,
        hora: `${hora}:00`,
        temperatura: temperatura ? Number(temperatura) : null,
        humedad: humedad ? Number(humedad) : null,
        velocidad_viento: viento ? Number(viento) : null,
      })
      setGuardado(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  if (guardado) return <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Registro guardado ✓</p>

  return (
    <form onSubmit={enviar} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Fecha</label>
        <input type="date" required max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Hora</label>
        <input type="time" required value={hora} onChange={(e) => setHora(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Temperatura (°C)</label>
        <input type="number" step="0.1" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Humedad (%)</label>
        <input type="number" step="0.1" min="0" max="100" value={humedad} onChange={(e) => setHumedad(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Viento (km/h)</label>
        <input type="number" step="0.1" min="0" value={viento} onChange={(e) => setViento(e.target.value)} className={CAMPO} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={guardando} className={`${BOTON_PRIMARIO} w-full`}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {error && (
        <p role="alert" className="col-span-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}

function FormEvento({ cb }: { cb: Callbacks }) {
  const [nombre, setNombre] = useState('')
  const [fase, setFase] = useState('el_nino')
  const [intensidad, setIntensidad] = useState('moderado')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      await cb.guardarEvento({ nombre, fase, intensidad, fecha_inicio: inicio, fecha_fin: fin || null })
      setGuardado(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  if (guardado) return <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Evento guardado ✓</p>

  return (
    <form onSubmit={enviar} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
      <div className="col-span-full">
        <label className="mb-1 block text-xs font-medium text-slate-600">Nombre del evento</label>
        <input required minLength={3} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Fase</label>
        <select value={fase} onChange={(e) => setFase(e.target.value)} className={CAMPO}>
          <option value="el_nino">El Niño</option>
          <option value="la_nina">La Niña</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Intensidad</label>
        <select value={intensidad} onChange={(e) => setIntensidad(e.target.value)} className={CAMPO}>
          {Object.entries(INTENSIDAD).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Inicio</label>
        <input type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Fin (vacío = en curso)</label>
        <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className={CAMPO} />
      </div>
      <div className="flex items-end sm:col-span-2">
        <button type="submit" disabled={guardando} className={`${BOTON_PRIMARIO} w-full`}>
          {guardando ? 'Guardando...' : 'Guardar evento'}
        </button>
      </div>
      {error && (
        <p role="alert" className="col-span-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}

function CardReportes({ t }: { t: TarjetaReportes }) {
  return (
    <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4 text-sm">
      {t.filas.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-2 text-slate-700">
          <span>
            {r.periodo_inicio} — {r.periodo_fin}
          </span>
          <a href={r.archivo_url} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0E7C9B] underline">
            Descargar PDF
          </a>
        </li>
      ))}
    </ul>
  )
}

function CardHistorial({ t }: { t: TarjetaHistorial }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-3">Usuario</th>
            <th className="py-1 pr-3">Tipo</th>
            <th className="py-1 pr-3">Nivel</th>
            <th className="py-1 pr-3">Pronóstico</th>
            <th className="py-1">Enviado</th>
          </tr>
        </thead>
        <tbody>
          {t.filas.map((h, i) => (
            <tr key={i} className="border-b border-slate-100 text-slate-700">
              <td className="py-1 pr-3">{h.profiles?.nombre_completo ?? '—'}</td>
              <td className="py-1 pr-3">{h.tipo}</td>
              <td className="py-1 pr-3">{h.nivel}</td>
              <td className="py-1 pr-3">{h.fecha_pronostico}</td>
              <td className="py-1">{new Date(h.enviado_en).toLocaleString('es-BO')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Tarjetas({ lista, cb }: { lista: Tarjeta[]; cb: Callbacks }) {
  return (
    <>
      {lista.map((t, i) => {
        switch (t.tipo) {
          case 'proyeccion':
            return <CardProyeccion key={i} t={t} />
          case 'eventos':
            return <CardEventos key={i} t={t} cb={cb} />
          case 'anomalias':
            return <CardAnomalias key={i} t={t} />
          case 'pronostico':
            return <CardPronostico key={i} t={t} />
          case 'resumen':
            return <CardResumen key={i} t={t} />
          case 'registros':
            return <CardRegistros key={i} t={t} cb={cb} />
          case 'form_registro':
            return <FormRegistro key={i} t={t} cb={cb} />
          case 'form_evento':
            return <FormEvento key={i} cb={cb} />
          case 'reportes':
            return <CardReportes key={i} t={t} />
          case 'historial_alertas':
            return <CardHistorial key={i} t={t} />
        }
      })}
    </>
  )
}

// ------------------------------------------------------------------ página
export default function AsistentePage() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ id: 0, rol: 'asistente', texto: SALUDO, botones: [] }])
  const [entrada, setEntrada] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editando, setEditando] = useState<{ registro: RegistroEditable; token: string } | null>(null)
  const contexto = useRef<Contexto | null>(null)
  const siguienteId = useRef(1)
  const final = useRef<HTMLDivElement>(null)

  useEffect(() => {
    final.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, enviando])

  function agregar(m: Omit<Mensaje, 'id'>) {
    setMensajes((prev) => [...prev, { ...m, id: siguienteId.current++ }])
  }

  // Ejecuta una acción ya confirmada llamando a los endpoints existentes del sistema.
  async function ejecutarAccion(a: Accion) {
    try {
      if (a.tipo === 'importar_open_meteo') {
        const d = await apiFetch<{ registros_procesados: number }>('/registros/importar-open-meteo', {
          method: 'POST',
          body: JSON.stringify({ fecha_inicio: a.params.fecha_inicio, fecha_fin: a.params.fecha_fin }),
        })
        agregar({ rol: 'asistente', texto: `Importación completada: ${d.registros_procesados} registros procesados. Ya puedes proyectar con esos datos.` })
      } else if (a.tipo === 'generar_reporte') {
        const d = await apiFetch<{ archivo_url: string }>('/reportes/generar', {
          method: 'POST',
          body: JSON.stringify({ periodo_inicio: a.params.periodo_inicio, periodo_fin: a.params.periodo_fin }),
        })
        agregar({ rol: 'asistente', texto: 'Reporte generado.', enlace: { texto: 'Abrir el PDF', url: d.archivo_url } })
      } else if (a.tipo === 'activar_alertas' || a.tipo === 'desactivar_alertas') {
        const activar = a.tipo === 'activar_alertas'
        await apiFetch('/alertas/preferencia', { method: 'PATCH', body: JSON.stringify({ alertas_activas: activar }) })
        agregar({ rol: 'asistente', texto: activar ? 'Listo: activé tus alertas por correo.' : 'Listo: desactivé tus alertas por correo.' })
      } else if (a.tipo === 'enviar_prueba_alerta') {
        const aTodos = a.params.a_suscriptores === 'true'
        const d = await apiFetch<{ enviados: number; destino: string | null }>('/alertas/prueba', {
          method: 'POST',
          body: JSON.stringify({ tipo: a.params.tipo ?? 'lluvia', a_suscriptores: aTodos }),
        })
        agregar({
          rol: 'asistente',
          texto: aTodos
            ? `Correo de prueba enviado a ${d.enviados} suscriptor(es).`
            : `Correo de prueba enviado a ${d.destino ?? 'tu correo'}. Revisa tu bandeja (y spam).`,
        })
      } else if (a.tipo === 'revisar_alertas') {
        const simular = a.params.simular === 'true'
        const d = await apiFetch<{
          alertas_detectadas: unknown[]
          destinatarios: number
          enviados: number
          sin_novedades: number
          errores: string[]
        }>(`/alertas/revisar?simular=${simular}`, { method: 'POST' })
        agregar({
          rol: 'asistente',
          texto:
            `${simular ? 'Simulación: ' : ''}${d.alertas_detectadas.length} alerta(s) detectada(s), ${d.destinatarios} suscriptor(es), ` +
            `${simular ? 'se enviarían' : 'enviados'}: ${d.enviados}, sin novedades: ${d.sin_novedades}.` +
            (d.errores.length ? `\nErrores: ${d.errores.join('; ')}` : ''),
        })
      }
    } catch (err) {
      agregar({ rol: 'asistente', texto: `No se pudo completar la acción: ${err instanceof Error ? err.message : 'error inesperado'}.` })
    }
  }

  async function enviar(texto: string, silencioso = false) {
    const limpio = texto.trim()
    if (!limpio || enviando) return
    setEntrada('')
    if (!silencioso) agregar({ rol: 'usuario', texto: limpio })
    setEnviando(true)
    try {
      const r = await apiFetch<RespuestaApi>('/asistente/mensaje', {
        method: 'POST',
        body: JSON.stringify({ mensaje: limpio, contexto: contexto.current }),
      })
      contexto.current = r.contexto
      agregar({
        rol: 'asistente',
        texto: r.respuesta,
        tarjetas: r.tarjetas,
        botones: r.botones,
        accion: r.accion,
        interprete: r.interprete,
      })
      if (r.accion?.estado === 'confirmada') await ejecutarAccion(r.accion)
    } catch (err) {
      agregar({ rol: 'asistente', texto: err instanceof Error ? err.message : 'Error inesperado.' })
    } finally {
      setEnviando(false)
    }
  }

  // Acciones directas de las tarjetas (formularios, editar y eliminar)
  const cb: Callbacks = {
    guardarRegistro: async (d) => {
      await apiFetch('/registros/manual', { method: 'POST', body: JSON.stringify(d) })
      agregar({
        rol: 'asistente',
        texto: 'Registro guardado correctamente. Ya forma parte del histórico.',
        botones: [{ texto: 'Ver registros', mensaje: 'muéstrame los últimos registros' }],
      })
    },
    guardarEvento: async (d) => {
      await apiFetch('/fenomenos/eventos', { method: 'POST', body: JSON.stringify(d) })
      agregar({
        rol: 'asistente',
        texto: 'Evento guardado. Desde ahora se usa en las proyecciones con El Niño / La Niña y en las anomalías.',
        botones: [{ texto: 'Ver eventos', mensaje: '¿hay algún evento climático en curso?' }],
      })
    },
    eliminarRegistro: async (id) => {
      if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return
      try {
        await apiFetch(`/registros/${id}`, { method: 'DELETE' })
        await enviar('muéstrame los últimos registros', true)
      } catch (err) {
        agregar({ rol: 'asistente', texto: `No se pudo eliminar: ${err instanceof Error ? err.message : 'error inesperado'}.` })
      }
    },
    editarRegistro: async (registro) => {
      const {
        data: { session },
      } = await createClient().auth.getSession()
      if (!session) {
        agregar({ rol: 'asistente', texto: 'Sesión expirada, vuelve a iniciar sesión.' })
        return
      }
      setEditando({ registro, token: session.access_token })
    },
    eliminarEvento: async (id) => {
      if (!window.confirm('¿Eliminar este evento?')) return
      try {
        await apiFetch(`/fenomenos/eventos/${id}`, { method: 'DELETE' })
        await enviar('¿hay algún evento climático en curso?', true)
      } catch (err) {
        agregar({ rol: 'asistente', texto: `No se pudo eliminar: ${err instanceof Error ? err.message : 'error inesperado'}.` })
      }
    },
  }

  const ultimoId = mensajes[mensajes.length - 1]?.id

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />
      <div className="mx-auto flex max-w-4xl flex-col px-4 py-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0E7C9B]/10">
            <Bot size={22} color="#0E7C9B" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Asistente ClimaTech</h1>
            <p className="text-sm text-slate-500">Todo el sistema en un solo lugar: escribe o usa los atajos</p>
          </div>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {ATAJOS.map((b) => (
            <button
              key={b.texto}
              onClick={() => enviar(b.mensaje)}
              disabled={enviando}
              className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-[#0E7C9B] hover:text-[#0E7C9B] disabled:opacity-50"
            >
              {b.texto}
            </button>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {mensajes.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.rol === 'usuario' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.rol === 'usuario' ? 'bg-slate-900 text-white' : 'bg-[#0E7C9B]/10 text-[#0E7C9B]'}`}
              >
                {m.rol === 'usuario' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`min-w-0 max-w-[88%] ${m.rol === 'usuario' ? 'text-right' : ''}`}>
                <div
                  className={`inline-block whitespace-pre-line rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
                    m.rol === 'usuario' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {m.texto}
                </div>

                {m.tarjetas && m.tarjetas.length > 0 && <Tarjetas lista={m.tarjetas} cb={cb} />}

                {m.enlace && (
                  <p className="mt-2">
                    <a href={m.enlace.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#0E7C9B] underline">
                      {m.enlace.texto}
                    </a>
                  </p>
                )}

                {m.accion?.estado === 'pendiente' && m.id === ultimoId && !enviando && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => enviar('sí, confirmo')} className={BOTON_PRIMARIO}>
                      Confirmar
                    </button>
                    <button
                      onClick={() => enviar('no, cancela')}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {m.botones && m.botones.length > 0 && m.id === ultimoId && !enviando && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.botones.map((b) => (
                      <button
                        key={b.texto}
                        onClick={() => enviar(b.mensaje)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-slate-500"
                      >
                        {b.texto}
                      </button>
                    ))}
                  </div>
                )}

                {m.interprete && m.interprete !== 'reglas' && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Interpretado con {m.interprete === 'clasificador' ? 'el clasificador local' : 'un modelo de lenguaje'}
                  </p>
                )}
              </div>
            </div>
          ))}
          {enviando && <p className="text-sm text-slate-400">Procesando... (los modelos pueden tardar unos segundos)</p>}
          <div ref={final} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            enviar(entrada)
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            maxLength={300}
            placeholder="Escribe, por ejemplo: proyecta la humedad de los próximos 10 días con El Niño"
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
          />
          <button
            type="submit"
            disabled={enviando || !entrada.trim()}
            aria-label="Enviar mensaje"
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B4F6C] to-[#0E7C9B] px-5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Send size={16} />
            Enviar
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          Las proyecciones son estimaciones estadísticas, no pronósticos meteorológicos oficiales.
        </p>
      </div>

      {editando && (
        <EditarRegistroModal
          registro={editando.registro}
          accessToken={editando.token}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null)
            enviar('muéstrame los últimos registros', true)
          }}
        />
      )}
    </div>
  )
}
