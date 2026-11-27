'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Cloud,
  CloudRain,
  Droplets,
  Gauge,
  Info,
  Plane,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  Thermometer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wind,
  Waves,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import PageShell, { CardTitle, PageHeader } from '@/components/page-shell'
import { apiFetch } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura', unit: '°C', Icon: Thermometer, color: '#e08a12' },
  { value: 'humedad', label: 'Humedad', unit: '%', Icon: Droplets, color: '#0f6a88' },
  { value: 'velocidad_viento', label: 'Viento', unit: 'km/h', Icon: Wind, color: '#7c3aed' },
] as const

const METODOS = [
  { value: '', label: 'Selección automática', help: 'ClimaTech elige la alternativa más adecuada según la prueba y el pronóstico externo.' },
  { value: 'persistencia', label: 'Persistencia', help: 'Usa como referencia el último valor observado.' },
  { value: 'promedio_movil', label: 'Promedio móvil', help: 'Proyecta el promedio de los últimos siete días.' },
  { value: 'holt', label: 'Método de Holt', help: 'Modela el nivel y la tendencia reciente de la serie.' },
  { value: 'regresion_lineal', label: 'Regresión lineal múltiple', help: 'Combina tendencia y estacionalidad anual.' },
  { value: 'random_forest', label: 'Random Forest · IA', help: 'Aprende relaciones no lineales a partir de rezagos y estacionalidad.' },
  { value: 'gradient_boosting', label: 'Gradient Boosting · IA', help: 'Combina árboles de decisión entrenados secuencialmente.' },
  { value: 'hibrido_mos', label: 'Híbrido MOS · Open-Meteo + IA', help: 'Corrige el pronóstico meteorológico con el comportamiento histórico de la estación SLCB.' },
] as const

type Punto = { fecha: string; valor: number }
type DiaPronostico = {
  fecha: string
  lluvia_mm: number | null
  prob_lluvia: number | null
  tmax: number | null
  tmin: number | null
  rafaga: number | null
  codigo?: number | null
}
type Alerta = { tipo: string; titulo: string; nivel: 'alto' | 'medio'; fecha: string; mensaje: string }
type Dia = {
  fecha: string
  dia: string
  valor: number
  descriptor: string
  max_est: number | null
  min_est: number | null
  om?: {
    valor: number | null
    tmax: number | null
    tmin: number | null
    codigo: number | null
    lluvia_mm: number | null
    prob_lluvia: number | null
  } | null
  acuerdo?: {
    modelos: number
    minimo: number
    maximo: number
    dispersion: number
    confianza: 'alta' | 'media' | 'baja'
    valores: Record<string, number>
  } | null
}
type TarjetaProyeccion = {
  tipo: 'proyeccion'
  variable: string
  unidad: string
  metodo: string
  resumen: { promedio: number; minimo: number; maximo: number; reciente: number; descriptor: string }
  habitual: { valor: number; mes: string; diferencia: number } | null
  anomalia_reciente: { mes: string; anomalia: number; fase: string } | null
  dias: Dia[]
  rango_estimado: boolean
  enso: { usado: boolean; evento_actual: string | null }
  pronostico: { ok: boolean; dias: DiaPronostico[]; alertas: Alerta[] }
  historico: Punto[]
  proyeccion: Punto[]
  openmeteo?: {
    ok: boolean
    dias: number
    promedio: number | null
    tmax_min: number | null
    tmax_max: number | null
    dif_elegido: number | null
    cercano: string | null
  }
  criterio?: 'pedido' | 'openmeteo' | 'error' | 'mos'
  hibrido?: {
    modelo: string
    mae: number
    mae_openmeteo: number
    mejora_pct: number
    fechas: number
    dias_hibrido: number
    relleno: string | null
    pesos?: { metodo: string; nombre: string; peso: number }[] | null
    modelos?: string[]
    impacto_modelos?: { un_modelo: { nombre: string; mae: number }; varios_modelos: { nombre: string; mae: number }; mejora_pct: number } | null
  } | null
  correccion?: { metodo: string; mejora_pct: number; sesgo_mes: number | null; mes: string; dias_pares: number } | null
  prueba: { fecha: string; real: number; predicho: number }[]
  justificacion: string
  metodos: {
    nombre: string
    mae: number
    rmse: number
    elegido: boolean
    mejor: boolean
    dif_openmeteo?: number | null
    cercano?: boolean
  }[]
}

type RespuestaAvanzada = { mensaje: string; tarjeta: TarjetaProyeccion }

function fechaLocal(fecha: Date) {
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function moverDias(iso: string, dias: number) {
  const f = new Date(`${iso}T00:00:00`)
  f.setDate(f.getDate() + dias)
  return fechaLocal(f)
}

function fechaCorta(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

function fechaCompleta(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function confianzaClase(confianza?: string) {
  if (confianza === 'alta') return 'bg-emerald-100 text-emerald-800'
  if (confianza === 'media') return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-800'
}

export default function ProyeccionesPage() {
  const supabase = createClient()
  const hoy = fechaLocal(new Date())

  const [variable, setVariable] = useState<(typeof VARIABLES)[number]['value']>('temperatura')
  const [metodo, setMetodo] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [dias, setDias] = useState(7)
  const [enso, setEnso] = useState<'auto' | 'si' | 'no'>('auto')
  const [corregirEstacion, setCorregirEstacion] = useState(true)
  const [cargandoRango, setCargandoRango] = useState(true)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [resultado, setResultado] = useState<TarjetaProyeccion | null>(null)

  useEffect(() => {
    let vigente = true

    async function cargarRangoDisponible() {
      setCargandoRango(true)
      try {
        const [{ data: ultimo }, { data: primero }] = await Promise.all([
          supabase.from('registros_climaticos').select('fecha').order('fecha', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('registros_climaticos').select('fecha').order('fecha', { ascending: true }).limit(1).maybeSingle(),
        ])

        if (!vigente) return

        if (ultimo?.fecha) {
          const fin = String(ultimo.fecha).slice(0, 10)
          const dosAnosAntes = moverDias(fin, -729)
          const primerDato = primero?.fecha ? String(primero.fecha).slice(0, 10) : dosAnosAntes
          setPeriodoInicio(primerDato > dosAnosAntes ? primerDato : dosAnosAntes)
          setPeriodoFin(fin)
        } else {
          setPeriodoInicio(moverDias(hoy, -729))
          setPeriodoFin(hoy)
        }
      } finally {
        if (vigente) setCargandoRango(false)
      }
    }

    void cargarRangoDisponible()
    return () => { vigente = false }
  }, [supabase, hoy])

  const variableInfo = VARIABLES.find((v) => v.value === variable)!
  const metodoInfo = METODOS.find((m) => m.value === metodo) ?? METODOS[0]

  const grafico = useMemo(() => {
    if (!resultado) return []
    const historico = resultado.historico.map((p) => ({
      fecha: p.fecha.slice(5),
      historico: p.valor,
      proyeccion: undefined as number | undefined,
      openmeteo: undefined as number | undefined,
    }))
    if (historico.length) {
      historico[historico.length - 1].proyeccion = historico[historico.length - 1].historico
    }
    const futuro = resultado.dias.map((d) => ({
      fecha: d.fecha.slice(5),
      historico: undefined as number | undefined,
      proyeccion: d.valor,
      openmeteo: d.om?.valor ?? undefined,
    }))
    return [...historico, ...futuro]
  }, [resultado])

  async function generar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    setResultado(null)

    if (!periodoInicio || !periodoFin || periodoInicio > periodoFin) {
      setError('Selecciona un período válido: la fecha inicial debe ser anterior o igual a la fecha final.')
      return
    }
    if (!Number.isInteger(dias) || dias < 1 || dias > 30) {
      setError('El horizonte debe estar entre 1 y 30 días.')
      return
    }

    setCargando(true)
    try {
      const data = await apiFetch<RespuestaAvanzada>('/proyecciones/avanzada', {
        method: 'POST',
        body: JSON.stringify({
          variable,
          periodo_inicio: periodoInicio,
          periodo_fin: periodoFin,
          dias_a_proyectar: dias,
          metodo: metodo || null,
          enso,
          corregir_estacion: corregirEstacion,
        }),
      })
      setResultado(data.tarjeta)
      setMensaje(data.mensaje)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la proyección.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        icon={TrendingUp}
        title="Proyección climática"
        description="Modelos estadísticos, aprendizaje automático y referencia meteorológica para Cochabamba."
        actions={
          <Link href="/aeropuerto" className="btn-secondary">
            <Plane size={16} /> Ver estación SLCB
          </Link>
        }
      />

      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#072d3e] via-[#0B4F6C] to-[#0E7C9B] p-6 text-white shadow-xl shadow-brand-900/15 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-20 size-72 rounded-full border-[34px] border-white/5" />
        <div className="pointer-events-none absolute -bottom-24 right-1/3 size-64 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-100">
              <BrainCircuit size={14} /> MOTOR DE PROYECCIÓN AVANZADO
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Una proyección, varios modelos en competencia.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">
              Cada método se evalúa con días que no vio durante el entrenamiento. ClimaTech compara su error y contrasta el resultado con Open-Meteo.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['6', 'métodos'],
              ['7', 'días de prueba'],
              ['3', 'variables'],
            ].map(([n, label]) => (
              <div key={label} className="min-w-20 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur">
                <p className="text-2xl font-bold">{n}</p>
                <p className="text-[11px] text-white/70">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,350px)_minmax(0,1fr)]">
        <form onSubmit={generar} className="card space-y-5 p-5 xl:sticky xl:top-24">
          <div>
            <p className="eyebrow">Parámetros del análisis</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Configurar proyección</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">La selección automática es la opción recomendada para comparar los resultados sin imponer un modelo.</p>
          </div>

          <div>
            <label htmlFor="variable" className="label">Variable climática</label>
            <div className="grid grid-cols-3 gap-2">
              {VARIABLES.map((v) => {
                const activa = variable === v.value
                return (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setVariable(v.value)}
                    aria-pressed={activa}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
                      activa ? 'border-brand-700 bg-brand-700 text-white shadow-md' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                    }`}
                  >
                    <v.Icon size={20} />
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor="metodo" className="label">Método de proyección</label>
            <select id="metodo" className="input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {METODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <p className="mt-2 flex gap-2 text-xs leading-5 text-slate-500"><Info size={14} className="mt-0.5 shrink-0" />{metodoInfo.help}</p>
          </div>

          <fieldset>
            <legend className="label">Período histórico</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="desde" className="mb-1 block text-xs text-slate-500">Desde</label>
                <input id="desde" type="date" required max={periodoFin || hoy} value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="hasta" className="mb-1 block text-xs text-slate-500">Hasta</label>
                <input id="hasta" type="date" required max={hoy} min={periodoInicio || undefined} value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} className="input" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {cargandoRango ? 'Buscando el rango disponible…' : 'El período inicial se propone usando los registros disponibles en Supabase.'}
            </p>
          </fieldset>

          <div>
            <label htmlFor="dias" className="label">Horizonte de proyección</label>
            <div className="flex items-center gap-3">
              <input id="dias" type="range" min={1} max={30} value={dias} onChange={(e) => setDias(Number(e.target.value))} className="w-full accent-[#0B4F6C]" />
              <span className="min-w-16 rounded-lg bg-brand-50 px-3 py-2 text-center text-sm font-bold text-brand-800">{dias} días</span>
            </div>
          </div>

          <div>
            <label htmlFor="enso" className="label">Influencia de El Niño / La Niña</label>
            <select id="enso" value={enso} onChange={(e) => setEnso(e.target.value as 'auto' | 'si' | 'no')} className="input">
              <option value="auto">Automático: usar solo si mejora la prueba</option>
              <option value="si">Incluir ENSO cuando existan datos</option>
              <option value="no">Excluir ENSO del cálculo</option>
            </select>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-brand-300">
            <input type="checkbox" checked={corregirEstacion} onChange={(e) => setCorregirEstacion(e.target.checked)} className="mt-0.5 size-4 accent-[#0B4F6C]" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Plane size={15} /> Corrección con estación SLCB</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">Permite corregir el histórico y utilizar el modelo híbrido MOS si hay suficientes mediciones.</span>
            </span>
          </label>

          {error && <div role="alert" className="alert-error">{error}</div>}

          <button type="submit" disabled={cargando || cargandoRango} className="btn-primary w-full justify-center py-3">
            {cargando ? <><RefreshCw size={16} className="animate-spin" /> Evaluando modelos…</> : <><Activity size={17} /> Generar proyección avanzada</>}
          </button>

          <p className="text-[11px] leading-5 text-slate-400">El cálculo puede tardar más cuando se consulta el pronóstico multimodelo. Los resultados se guardan para incluirlos en los reportes del mismo período.</p>
        </form>

        <div className="min-w-0 space-y-5">
          {!resultado && (
            <section className="card flex min-h-80 flex-col items-center justify-center p-8 text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700"><BrainCircuit size={30} /></div>
              <h2 className="mt-5 text-xl font-semibold text-slate-900">Tu análisis aparecerá aquí</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Selecciona la variable y el período histórico. El sistema preparará la serie diaria, evaluará los métodos disponibles y mostrará el resultado, el pronóstico externo y las métricas de validación.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-500">
                <span className="badge bg-slate-100">Backtesting</span>
                <span className="badge bg-slate-100">ENSO</span>
                <span className="badge bg-slate-100">Open-Meteo</span>
                <span className="badge bg-slate-100">MOS</span>
              </div>
            </section>
          )}

          {cargando && (
            <div className="card flex items-center gap-3 p-5 text-sm text-slate-600">
              <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-700" />
              Preparando histórico y evaluando los modelos…
            </div>
          )}

          {resultado && <>
            <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#0B4F6C] via-[#0E7C9B] to-[#01BAEF] p-6 text-white shadow-lg animate-aparecer">
              <div className="pointer-events-none absolute -right-8 -top-10 size-48 rounded-full border-[24px] border-white/10" />
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/75">Resultado · Cochabamba</p>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{resultado.dias.length} días proyectados</span>
                </div>
                <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-sm text-white/75">{variableInfo.label} · {resultado.metodo}</p>
                    <p className="mt-1 text-5xl font-bold tracking-tight">{resultado.resumen.promedio.toFixed(1)} <span className="text-xl font-normal text-white/75">{resultado.unidad}</span></p>
                    <span className="mt-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-sm font-medium">{resultado.resumen.descriptor}</span>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                    <p className="text-xs text-white/70">Tendencia respecto a la última semana</p>
                    <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
                      {resultado.resumen.promedio > resultado.resumen.reciente ? <TrendingUp size={20} /> : resultado.resumen.promedio < resultado.resumen.reciente ? <TrendingDown size={20} /> : <Activity size={20} />}
                      {resultado.resumen.promedio > resultado.resumen.reciente ? 'En aumento' : resultado.resumen.promedio < resultado.resumen.reciente ? 'En descenso' : 'Estable'}
                    </p>
                    <p className="text-xs text-white/70">Última semana: {resultado.resumen.reciente.toFixed(1)} {resultado.unidad}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  {resultado.enso.evento_actual && <span className="rounded-full bg-amber-300 px-3 py-1 font-semibold text-amber-950"><Waves size={13} className="mr-1 inline" />{resultado.enso.evento_actual} · {resultado.enso.usado ? 'considerado' : 'no mejoró la prueba'}</span>}
                  {resultado.correccion && <span className="rounded-full bg-emerald-300 px-3 py-1 font-semibold text-emerald-950"><CheckCircle2 size={13} className="mr-1 inline" />Corrección SLCB aplicada</span>}
                  {resultado.criterio === 'mos' && <span className="rounded-full bg-violet-300 px-3 py-1 font-semibold text-violet-950"><BrainCircuit size={13} className="mr-1 inline" />Modelo híbrido MOS seleccionado</span>}
                </div>
                {mensaje && <p className="mt-4 whitespace-pre-line text-xs leading-5 text-white/80">{mensaje}</p>}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {[
                { label: 'Promedio proyectado', value: `${resultado.resumen.promedio.toFixed(1)} ${resultado.unidad}`, hint: 'Media del horizonte', Icon: Gauge },
                { label: 'Rango proyectado', value: `${resultado.resumen.minimo.toFixed(1)} – ${resultado.resumen.maximo.toFixed(1)}`, hint: resultado.unidad, Icon: Activity },
                { label: 'Días de histórico', value: resultado.historico.length.toString(), hint: 'Últimos puntos mostrados', Icon: CalendarDays },
                { label: 'Referencia Open-Meteo', value: resultado.openmeteo?.ok && resultado.openmeteo.promedio !== null ? `${resultado.openmeteo.promedio.toFixed(1)} ${resultado.unidad}` : 'No disponible', hint: resultado.openmeteo?.dias ? `${resultado.openmeteo.dias} días coincidentes` : 'Sin coincidencia suficiente', Icon: Cloud },
              ].map((item, i) => <article key={item.label} style={{ animationDelay: `${i * 70}ms` }} className="card animate-aparecer p-4 transition duration-300 hover:-translate-y-1 hover:shadow-md">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p><span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><item.Icon size={18} /></span></div>
                <p className="mt-3 text-xl font-bold tabular-nums text-slate-900">{item.value}</p>
                <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
              </article>)}
            </section>

            {resultado.habitual && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <Info size={17} className="mr-2 inline" /> Para el mes de referencia ({resultado.habitual.mes}), el promedio histórico habitual es {resultado.habitual.valor.toFixed(1)} {resultado.unidad}. La diferencia proyectada es {resultado.habitual.diferencia >= 0 ? '+' : ''}{resultado.habitual.diferencia.toFixed(1)} {resultado.unidad}.
            </div>}

            {resultado.correccion && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <ShieldCheck size={17} className="mr-2 inline" /> La corrección seleccionada ({resultado.correccion.metodo}) mejoró el error un {resultado.correccion.mejora_pct.toFixed(1)}% frente a Open-Meteo sin corregir, con {resultado.correccion.dias_pares} días emparejados.
            </div>}

            {resultado.hibrido && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
              <BrainCircuit size={17} className="mr-2 inline" /> Modelo híbrido: {resultado.hibrido.modelo}. MAE de prueba: {resultado.hibrido.mae.toFixed(2)} {resultado.unidad}, frente a {resultado.hibrido.mae_openmeteo.toFixed(2)} {resultado.unidad} de Open-Meteo sin corregir.
              {resultado.hibrido.modelos?.length ? <p className="mt-2 text-xs text-violet-800">Modelos meteorológicos considerados: {resultado.hibrido.modelos.join(', ')}.</p> : null}
              {resultado.hibrido.pesos?.length ? <p className="mt-1 text-xs text-violet-800">Combinación: {resultado.hibrido.pesos.filter((p) => p.peso >= 0.01).map((p) => `${p.nombre} ${(p.peso * 100).toFixed(0)}%`).join(' · ')}.</p> : null}
            </div>}

            <section className="card p-5 sm:p-6">
              <CardTitle title="Evolución histórica y proyección" description="La línea continua representa el histórico y la discontinua el resultado futuro. Open-Meteo se muestra como referencia independiente." />
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={grafico} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={55} domain={['auto', 'auto']} />
                    <Tooltip formatter={(value) => value == null ? '—' : `${Number(value).toFixed(2)} ${resultado.unidad}`} />
                    <Legend />
                    <Line type="monotone" dataKey="historico" name="Histórico" stroke="#0B4F6C" strokeWidth={2.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey="proyeccion" name="Proyección ClimaTech" stroke="#e08a12" strokeWidth={2.7} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="openmeteo" name="Open-Meteo" stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card p-5 sm:p-6">
              <CardTitle title="Proyección día por día" description="Estimaciones estadísticas y, cuando existe, información meteorológica externa." />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                {resultado.dias.map((d) => <article key={d.fecha} className="rounded-2xl border border-slate-200 bg-linear-to-b from-white to-slate-50 p-3 transition duration-200 hover:-translate-y-1 hover:shadow-md">
                  <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase text-slate-500">{d.dia}</p><p className="text-[11px] text-slate-400">{fechaCorta(d.fecha)}</p></div>
                  <p className="mt-3 text-2xl font-bold text-slate-900">{d.valor.toFixed(1)}<span className="ml-1 text-xs font-medium text-slate-500">{resultado.unidad}</span></p>
                  <p className="mt-1 text-xs font-medium text-brand-700">{d.descriptor}</p>
                  {d.om && <div className="mt-3 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
                    {d.om.tmax !== null && d.om.tmin !== null ? <p><ArrowUp size={11} className="mr-0.5 inline text-rose-500" />{d.om.tmax.toFixed(0)}° <ArrowDown size={11} className="ml-1 mr-0.5 inline text-sky-600" />{d.om.tmin.toFixed(0)}°</p> : null}
                    {d.om.prob_lluvia !== null ? <p><CloudRain size={11} className="mr-1 inline text-sky-600" />Prob. lluvia {d.om.prob_lluvia.toFixed(0)}%</p> : null}
                  </div>}
                  {d.acuerdo && <span className={`mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-semibold ${confianzaClase(d.acuerdo.confianza)}`}>Confianza {d.acuerdo.confianza}</span>}
                </article>)}
              </div>
            </section>

            <div className="grid gap-5 2xl:grid-cols-2">
              <section className="card p-5">
                <CardTitle title="Competencia de métodos" description="Evaluación en los últimos siete días reservados para la prueba." />
                <div className="space-y-3">
                  {resultado.metodos.map((m) => {
                    const maxMae = Math.max(...resultado.metodos.map((x) => x.mae), 0.01)
                    return <div key={m.nombre}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700">{m.nombre}{m.elegido ? ' · seleccionado' : ''}</span>
                        <span className="tabular-nums text-slate-600">MAE {m.mae.toFixed(2)} · RMSE {m.rmse.toFixed(2)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full transition-all duration-700 ${m.elegido ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${Math.max(3, (m.mae / maxMae) * 100)}%` }} />
                      </div>
                      {m.mejor && <p className="mt-1 text-[10px] text-emerald-700">Menor error en la prueba.</p>}
                    </div>
                  })}
                </div>
                <p className="mt-4 text-[11px] leading-5 text-slate-500">MAE y RMSE se calculan comparando predicciones de días reservados contra los valores observados. Un error menor indica mejor desempeño en esa muestra.</p>
              </section>

              <section className="card p-5">
                <CardTitle title="Validación: real frente a predicho" description="Últimos días reservados que el método no utilizó para entrenarse." />
                {resultado.prueba.length ? <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={resultado.prueba.map((p) => ({ fecha: fechaCorta(p.fecha), real: p.real, predicho: p.predicho }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={48} domain={['auto', 'auto']} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="real" name="Observado" stroke="#0B4F6C" strokeWidth={2} />
                      <Line type="monotone" dataKey="predicho" name="Predicho" stroke="#e08a12" strokeWidth={2} strokeDasharray="5 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div> : <p className="text-sm text-slate-500">No hay muestra de prueba disponible.</p>}
              </section>
            </div>

            <section className="card p-5 sm:p-6">
              <CardTitle title="Pronóstico meteorológico y alertas" description="Información física de Open-Meteo; se presenta aparte de la proyección estadística." />
              {!resultado.pronostico.ok ? <p className="text-sm text-slate-500">No se pudo consultar el pronóstico meteorológico externo en este momento.</p> : <>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {resultado.pronostico.dias.map((d) => <div key={d.fecha} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold text-slate-900">{fechaCompleta(d.fecha)}</p>
                    <p className="mt-1">Máx./mín.: {d.tmax?.toFixed(1) ?? '—'}° / {d.tmin?.toFixed(1) ?? '—'}°</p>
                    <p>Lluvia: {d.lluvia_mm?.toFixed(1) ?? '—'} mm · Prob.: {d.prob_lluvia?.toFixed(0) ?? '—'}%</p>
                    <p>Ráfagas: {d.rafaga?.toFixed(0) ?? '—'} km/h</p>
                  </div>)}
                </div>
                {resultado.pronostico.alertas.length ? <div className="mt-4 space-y-2">
                  {resultado.pronostico.alertas.map((a) => <div key={`${a.tipo}-${a.fecha}`} className={`rounded-xl border p-3 text-xs ${a.nivel === 'alto' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                    <TriangleAlert size={15} className="mr-2 inline" /><b>{fechaCompleta(a.fecha)} · {a.titulo}.</b> {a.mensaje}
                  </div>)}
                </div> : <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 size={15} className="mr-1 inline" />No se identificaron alertas probables con los umbrales configurados.</p>}
              </>}
            </section>

            <details className="card p-5">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800">Ver interpretación y detalles metodológicos <span className="float-right text-brand-700">＋</span></summary>
              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">{resultado.justificacion}</p>
              {resultado.anomalia_reciente && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Última anomalía mensual registrada: {resultado.anomalia_reciente.mes}, {resultado.anomalia_reciente.anomalia >= 0 ? '+' : ''}{resultado.anomalia_reciente.anomalia.toFixed(2)} {resultado.unidad} respecto a lo habitual. Fase: {resultado.anomalia_reciente.fase}.</p>}
            </details>
          </>}
        </div>
      </div>
    </PageShell>
  )
}
