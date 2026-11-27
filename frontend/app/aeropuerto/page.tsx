'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2,
  CloudSun, Database, Download, Gauge, Plane, RefreshCw, ShieldCheck,
  Thermometer, Wind, Droplets, TriangleAlert
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis, BarChart, Bar
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, CardTitle } from '@/components/page-shell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const VARIABLES = [
  { value: 'temperatura', label: 'Temperatura', unit: '°C', Icon: Thermometer, color: '#e08a12' },
  { value: 'humedad', label: 'Humedad', unit: '%', Icon: Droplets, color: '#0f6a88' },
  { value: 'velocidad_viento', label: 'Viento', unit: 'km/h', Icon: Wind, color: '#7c3aed' },
] as const

type Variable = typeof VARIABLES[number]['value']
type Impacto = {
  variable: string; dias_pares: number; desde: string; hasta: string; dias_prueba: number
  prueba_desde: string; elegido: string; mejora_pct: number
  opciones: { metodo: string; nombre: string; mae: number; rmse: number; sesgo: number }[]
  mensual: { mes: number; dias: number; open_meteo: number; estacion: number; corregido: number; sesgo: number }[]
  verificacion: { metodo: string; corregida: boolean; dias: number; proyecciones: number; mae: number; sesgo: number }[]
  estacion: string
}
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function AeropuertoPage() {
  const supabase = createClient()
  const [variable, setVariable] = useState<Variable>('temperatura')
  const [impacto, setImpacto] = useState<Impacto | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [rol, setRol] = useState('')
  const [inicio, setInicio] = useState('2020-01-01')
  const [fin, setFin] = useState(new Date(Date.now() - 86400000).toISOString().slice(0,10))
  const [importando, setImportando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const cargarImpacto = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Tu sesión expiró. Vuelve a ingresar.')
      const res = await fetch(`${API_URL}/estacion/impacto?variable=${variable}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store'
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'No se pudo consultar la estación.')
      setImpacto(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión con el servidor.')
      setImpacto(null)
    } finally { setCargando(false) }
  }, [supabase, variable])

  useEffect(() => {
    cargarImpacto()
    async function perfil() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
      setRol(data?.rol ?? '')
    }
    perfil()
  }, [cargarImpacto, supabase])

  async function importar(e: React.FormEvent) {
    e.preventDefault(); setImportando(true); setMensaje(''); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Tu sesión expiró. Vuelve a ingresar.')
      const res = await fetch(`${API_URL}/estacion/importar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ fecha_inicio: inicio, fecha_fin: fin })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'No se pudo importar la estación.')
      setMensaje(`Importación completada: ${data.lecturas} reportes horarios, ${data.dias} días y ${data.dias_completos} días completos.`)
      await cargarImpacto()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la importación.')
    } finally { setImportando(false) }
  }

  const actual = VARIABLES.find(v => v.value === variable)!
  const mejor = impacto?.opciones?.[0]
  const base = impacto?.opciones?.find(o => o.metodo === 'sin_correccion')
  const mensual = impacto?.mensual?.map(m => ({
    mes: MESES[m.mes - 1], 'Open-Meteo': m.open_meteo, 'Estación': m.estacion, 'Corregido': m.corregido
  })) ?? []

  return (
    <PageShell>
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#07384f] via-[#0B4F6C] to-[#0E7C9B] p-6 text-white shadow-xl shadow-brand-900/15 sm:p-8 animate-aparecer">
        <div className="pointer-events-none absolute -right-10 -top-16 size-72 rounded-full border-[38px] border-white/5" />
        <div className="pointer-events-none absolute -bottom-28 right-1/4 size-64 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-100"><Plane size={14}/> OBSERVACIÓN METEOROLÓGICA · SLCB</span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Estación del Aeropuerto</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">Contrasta las estimaciones de Open-Meteo con mediciones METAR reales del Aeropuerto Jorge Wilstermann y evalúa el aporte de la corrección local.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <span className="grid size-12 place-items-center rounded-xl bg-white/15"><Gauge size={25}/></span>
            <div><p className="text-xs text-cyan-100">Código OACI</p><p className="text-2xl font-bold tracking-widest">SLCB</p></div>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><p className="eyebrow">Centro de validación local</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{impacto?.estacion ?? 'Aeropuerto Jorge Wilstermann'}</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
            {VARIABLES.map(v => <button key={v.value} onClick={() => setVariable(v.value)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${variable === v.value ? 'bg-brand-700 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>{v.label}</button>)}
          </div>
          <button onClick={cargarImpacto} disabled={cargando} className="btn-secondary"><RefreshCw size={15} className={cargando ? 'animate-spin' : ''}/> Actualizar</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><TriangleAlert className="mr-2 inline" size={17}/>{error}</div>}
      {mensaje && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline" size={17}/>{mensaje}</div>}

      {cargando && <div className="card flex items-center gap-3 p-8 text-sm text-slate-600"><span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-700"/>Analizando coincidencias entre estación y modelo…</div>}

      {!cargando && impacto && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Días comparables', value: impacto.dias_pares.toLocaleString('es-BO'), hint: `${impacto.desde} — ${impacto.hasta}`, Icon: CalendarDays },
            { label: 'Días de evaluación', value: impacto.dias_prueba.toLocaleString('es-BO'), hint: `Prueba desde ${impacto.prueba_desde}`, Icon: Activity },
            { label: 'Método seleccionado', value: impacto.opciones.find(o => o.metodo === impacto.elegido)?.nombre ?? impacto.elegido, hint: 'Menor error en datos de prueba', Icon: ShieldCheck },
            { label: 'Mejora del MAE', value: `${impacto.mejora_pct.toFixed(1)}%`, hint: 'Frente a Open-Meteo sin corregir', Icon: Gauge },
          ].map((s,i) => <article key={s.label} style={{animationDelay:`${i*80}ms`}} className="card animate-aparecer p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lg">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</span><span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700"><s.Icon size={18}/></span></div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{s.value}</p><p className="mt-1 text-xs text-slate-500">{s.hint}</p>
          </article>)}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <article className="card p-5 sm:p-6">
            <CardTitle title="Comparación mensual" description={`Promedios observados y estimados · ${actual.label.toLowerCase()} (${actual.unit})`}/>
            {mensual.length ? <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={mensual} margin={{top:10,right:12,left:0,bottom:0}}>
              <defs><linearGradient id="estacionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0B4F6C" stopOpacity={.24}/><stop offset="100%" stopColor="#0B4F6C" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="mes" tick={{fontSize:12}}/><YAxis tick={{fontSize:12}}/><Tooltip/><Legend/>
              <Area type="monotone" dataKey="Estación" stroke="#0B4F6C" fill="url(#estacionFill)" strokeWidth={2.5}/>
              <Area type="monotone" dataKey="Open-Meteo" stroke="#e08a12" fill="transparent" strokeWidth={2}/>
              <Area type="monotone" dataKey="Corregido" stroke="#16a34a" fill="transparent" strokeWidth={2} strokeDasharray="5 4"/>
            </AreaChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-slate-500">Aún no hay suficientes datos mensuales para graficar.</p>}
          </article>
          <article className="card p-5 sm:p-6">
            <CardTitle title="Evaluación de métodos" description="Error absoluto medio en la muestra de prueba"/>
            <div className="space-y-4">
              {impacto.opciones.map(o => <div key={o.metodo}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-medium text-slate-700">{o.nombre}</span><b className="tabular-nums text-slate-900">{o.mae.toFixed(2)} {actual.unit}</b></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-linear-to-r from-cyan-600 to-brand-800 transition-all duration-700" style={{width:`${Math.max(3, (o.mae / Math.max(...impacto.opciones.map(x=>x.mae),.01))*100)}%`}}/></div>
                <p className="mt-1 text-[11px] text-slate-400">RMSE {o.rmse.toFixed(2)} · sesgo {o.sesgo > 0 ? '+' : ''}{o.sesgo.toFixed(2)}</p>
              </div>)}
            </div>
            {mejor && base && <div className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-brand-900"><CheckCircle2 className="mr-1.5 inline" size={16}/> {mejor.nombre} obtiene el menor MAE. {impacto.mejora_pct.toFixed(1)}% de mejora respecto al modelo sin corrección.</div>}
          </article>
        </section>

        <section className="card overflow-hidden">
          <div className="p-5 sm:p-6"><CardTitle title="Verificación de proyecciones históricas" description="Comparación de los valores proyectados frente a las observaciones reales del aeropuerto."/></div>
          {impacto.verificacion.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Método</th><th className="px-5 py-3">Corrección</th><th className="px-5 py-3 text-right">Días</th><th className="px-5 py-3 text-right">Proyecciones</th><th className="px-5 py-3 text-right">MAE</th><th className="px-5 py-3 text-right">Sesgo</th></tr></thead><tbody>{impacto.verificacion.map((v,i)=><tr key={i} className="border-t border-slate-100 transition hover:bg-slate-50"><td className="px-5 py-3 font-medium text-slate-800">{v.metodo}</td><td className="px-5 py-3">{v.corregida ? <span className="badge bg-emerald-100 text-emerald-800">Corregida</span> : <span className="badge bg-slate-100 text-slate-600">Sin corregir</span>}</td><td className="px-5 py-3 text-right tabular-nums">{v.dias}</td><td className="px-5 py-3 text-right tabular-nums">{v.proyecciones}</td><td className="px-5 py-3 text-right font-semibold tabular-nums">{v.mae.toFixed(2)} {actual.unit}</td><td className="px-5 py-3 text-right tabular-nums">{v.sesgo > 0 ? '+' : ''}{v.sesgo.toFixed(2)}</td></tr>)}</tbody></table></div> : <p className="px-6 pb-6 text-sm text-slate-500">Todavía no existen proyecciones coincidentes con observaciones de la estación.</p>}
        </section>
      </>}

      {rol === 'administrador' && <section className="card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-100 text-brand-800"><Database size={20}/></span><div><h2 className="font-semibold text-slate-900">Administrar datos de la estación</h2><p className="text-sm text-slate-500">Importa reportes METAR históricos desde Iowa Environmental Mesonet.</p></div></div></div>
        <form onSubmit={importar} className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6">
          <div><label className="label" htmlFor="desde">Fecha inicial</label><input id="desde" type="date" className="input" value={inicio} onChange={e=>setInicio(e.target.value)} required/></div>
          <div><label className="label" htmlFor="hasta">Fecha final</label><input id="hasta" type="date" className="input" value={fin} onChange={e=>setFin(e.target.value)} required/></div>
          <button className="btn-primary" disabled={importando || inicio > fin}><Download size={16}/>{importando ? 'Importando…' : 'Importar mediciones'}</button>
        </form>
        <p className="px-6 pb-5 text-xs text-slate-500">La importación está limitada a seis años por solicitud y solo puede ejecutarla un administrador.</p>
      </section>}

      <p className="text-xs leading-5 text-slate-500">Fuente de observaciones: Iowa Environmental Mesonet (METAR). Las comparaciones usan únicamente fechas con datos coincidentes. La corrección se evalúa en una muestra separada del ajuste para evitar medir el modelo con los mismos datos que lo entrenaron.</p>
    </PageShell>
  )
}
