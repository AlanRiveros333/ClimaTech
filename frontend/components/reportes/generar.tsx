'use client'

import { useState } from 'react'
import { BookOpenCheck, CalendarRange, CheckCircle2, Download, FileSpreadsheet, FileText, FileType2, Library, Loader2 } from 'lucide-react'
import { useDatosPanel } from '@/components/paneles/ui'
import { apiFetch } from '@/lib/api'

type Formato = 'pdf' | 'word' | 'excel'
type ResumenDatos = { dias: number; desde: string | null; hasta: string | null; lecturas: number; manuales: number }

const FORMATOS: { valor: Formato; texto: string; detalle: string; Icono: typeof FileText; color: string }[] = [
  { valor: 'pdf', texto: 'PDF', detalle: 'Para leer o imprimir', Icono: FileText, color: '#dc2626' },
  { valor: 'word', texto: 'Word', detalle: 'Para editar el texto', Icono: FileType2, color: '#2563eb' },
  { valor: 'excel', texto: 'Excel', detalle: 'Para analizar los datos', Icono: FileSpreadsheet, color: '#16a34a' },
]

const RAPIDOS = [
  { texto: 'Últimos 7 días', dias: 7 },
  { texto: 'Últimos 30 días', dias: 30 },
  { texto: 'Últimos 6 meses', dias: 182 },
  { texto: 'Último año', dias: 365 },
]

const CONTENIDO_COMPLETO = [
  'Portada con las cifras principales',
  'Índice con el número de página de cada año y mes',
  'Guía para leer las columnas',
  'Resumen general y gráfico de la temperatura mes a mes',
  'Resumen por año',
  'Una tabla por mes, un día por renglón, con el promedio del mes',
  'Las lecturas registradas a mano',
  '«Página X de Y» al pie de cada hoja',
]

function isoLocal(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
function haceDias(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoLocal(d)
}
const fmt = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—')
const miles = (n: number) => n.toLocaleString('es-BO')

function Enlace({ url, texto }: { url: string; texto: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex animate-aparecer items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 transition hover:bg-emerald-100"
    >
      <span className="flex items-center gap-2">
        <CheckCircle2 size={18} /> {texto}
      </span>
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <Download size={16} /> Descargar
      </span>
    </a>
  )
}

export default function GenerarReportes({ onGenerado }: { onGenerado: () => void }) {
  const [inicio, setInicio] = useState(() => haceDias(30))
  const [fin, setFin] = useState(() => haceDias(0))
  const [hoy] = useState(() => haceDias(0))
  const [formato, setFormato] = useState<Formato>('pdf')
  const [generando, setGenerando] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resumen = useDatosPanel<ResumenDatos>('/paneles/datos')
  const [generandoTodo, setGenerandoTodo] = useState(false)
  const [urlTodo, setUrlTodo] = useState<string | null>(null)
  const [errorTodo, setErrorTodo] = useState<string | null>(null)

  async function generarPeriodo(e: React.FormEvent) {
    e.preventDefault()
    setGenerando(true)
    setError(null)
    setUrl(null)
    try {
      const r = await apiFetch<{ archivo_url: string }>('/reportes/generar', {
        method: 'POST',
        body: JSON.stringify({ periodo_inicio: inicio, periodo_fin: fin, formato }),
      })
      setUrl(r.archivo_url)
      onGenerado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte.')
    } finally {
      setGenerando(false)
    }
  }

  async function generarTodo() {
    setGenerandoTodo(true)
    setErrorTodo(null)
    setUrlTodo(null)
    try {
      const r = await apiFetch<{ archivo_url: string }>('/reportes/completo', { method: 'POST' })
      setUrlTodo(r.archivo_url)
      onGenerado()
    } catch (err) {
      setErrorTodo(err instanceof Error ? err.message : 'No se pudo generar el reporte completo.')
    } finally {
      setGenerandoTodo(false)
    }
  }

  const d = resumen.datos
  const meses = d?.desde && d?.hasta ? (Number(d.hasta.slice(0, 4)) - Number(d.desde.slice(0, 4))) * 12 + Number(d.hasta.slice(5, 7)) - Number(d.desde.slice(5, 7)) + 1 : 0

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ------------------------------------------------ reporte de un período */}
      <form onSubmit={generarPeriodo} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-[#0E7C9B]/10 text-[#0E7C9B]">
            <CalendarRange size={22} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Reporte de un período</h3>
            <p className="text-sm text-slate-500">Estadísticas y proyecciones de las fechas que elijas.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {RAPIDOS.map((r) => (
            <button
              key={r.dias}
              type="button"
              onClick={() => {
                setInicio(haceDias(r.dias))
                setFin(hoy)
              }}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-[#0E7C9B] hover:text-[#0E7C9B]"
            >
              {r.texto}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="label">Desde</span>
            <input type="date" required value={inicio} max={fin} onChange={(e) => setInicio(e.target.value)} className="input" />
          </label>
          <label className="text-sm">
            <span className="label">Hasta</span>
            <input type="date" required value={fin} min={inicio} max={hoy} onChange={(e) => setFin(e.target.value)} className="input" />
          </label>
        </div>

        <p className="label mt-4">Formato</p>
        <div className="grid grid-cols-3 gap-2">
          {FORMATOS.map(({ valor, texto, detalle, Icono, color }) => {
            const activo = formato === valor
            return (
              <button
                key={valor}
                type="button"
                onClick={() => setFormato(valor)}
                aria-pressed={activo}
                className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition ${
                  activo ? 'border-transparent shadow-md ring-2' : 'border-slate-200 hover:border-slate-300'
                }`}
                style={activo ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
              >
                <Icono size={22} color={color} />
                <span className="text-sm font-semibold text-slate-900">{texto}</span>
                <span className="text-[11px] leading-tight text-slate-500">{detalle}</span>
              </button>
            )
          })}
        </div>

        <button type="submit" disabled={generando} className="btn-primary mt-5 rounded-full bg-linear-to-r from-[#0B4F6C] to-[#0E7C9B] py-2.5">
          {generando ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {generando ? 'Generando…' : 'Generar reporte'}
        </button>
        {error && <p className="alert-error mt-3">{error}</p>}
        {url && <Enlace url={url} texto="Tu reporte está listo" />}
      </form>

      {/* ------------------------------------------------ reporte completo */}
      <div className="relative flex flex-col overflow-hidden rounded-3xl bg-linear-to-br from-[#072d3e] via-[#0B4F6C] to-[#0E7C9B] p-6 text-white shadow-lg">
        <div aria-hidden className="absolute -right-16 -top-16 size-48 rounded-full bg-amber-300/20 blur-3xl animate-pulso-sol" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white/15">
            <Library size={22} />
          </div>
          <div>
            <h3 className="font-semibold">Reporte completo en PDF</h3>
            <p className="text-sm text-white/75">Todos los datos registrados, ordenados y paginados.</p>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            [d ? miles(d.dias) : '…', 'días con datos'],
            [d ? miles(d.lecturas) : '…', 'lecturas'],
            [d ? `≈ ${meses + 6}` : '…', 'páginas'],
          ].map(([cifra, etiqueta]) => (
            <div key={etiqueta} className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
              <p className="text-xl font-semibold">{cifra}</p>
              <p className="text-[11px] text-white/70">{etiqueta}</p>
            </div>
          ))}
        </div>
        <p className="relative mt-2 text-xs text-white/70">
          {d?.desde ? `Del ${fmt(d.desde)} al ${fmt(d.hasta)}` : resumen.error ?? 'Consultando los datos…'}
          {d && d.manuales > 0 ? ` · incluye ${miles(d.manuales)} lectura(s) registradas a mano` : ''}
        </p>

        <p className="relative mt-4 flex items-center gap-2 text-sm font-medium">
          <BookOpenCheck size={16} className="text-amber-300" /> Qué contiene
        </p>
        <ul className="relative mt-2 grid gap-1.5 text-sm text-white/85">
          {CONTENIDO_COMPLETO.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" />
              {c}
            </li>
          ))}
        </ul>

        <button
          onClick={generarTodo}
          disabled={generandoTodo || !d || d.dias === 0}
          className="relative mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 shadow-lg transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {generandoTodo ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {generandoTodo ? 'Armando el PDF (puede tardar un poco)…' : 'Generar reporte completo'}
        </button>
        {errorTodo && <p className="alert-error relative mt-3">{errorTodo}</p>}
        {urlTodo && <Enlace url={urlTodo} texto="El reporte completo está listo" />}
      </div>
    </div>
  )
}
