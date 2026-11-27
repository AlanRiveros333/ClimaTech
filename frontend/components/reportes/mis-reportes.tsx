'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, FileType2, Inbox, Library } from 'lucide-react'
import { CajaError, Cargando, Pildoras, useDatosPanel } from '@/components/paneles/ui'

type Reporte = {
  id: string
  tipo?: string
  periodo_inicio: string
  periodo_fin: string
  archivo_url: string
  created_at: string
  mio?: boolean
  completo?: boolean
}

const POR_PAGINA = 8
const fmt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`

const ESTILO: Record<string, { texto: string; Icono: typeof FileText; color: string }> = {
  completo: { texto: 'PDF completo', Icono: Library, color: '#0B4F6C' },
  pdf: { texto: 'PDF', Icono: FileText, color: '#dc2626' },
  word: { texto: 'Word', Icono: FileType2, color: '#2563eb' },
  excel: { texto: 'Excel', Icono: FileSpreadsheet, color: '#16a34a' },
}

type Filtro = 'todos' | 'completo' | 'pdf' | 'word' | 'excel'
const FILTROS = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'completo', texto: 'Completos' },
  { valor: 'pdf', texto: 'PDF' },
  { valor: 'word', texto: 'Word' },
  { valor: 'excel', texto: 'Excel' },
] as const

export default function MisReportes({ version }: { version: number }) {
  const { datos, error, cargando, recargar } = useDatosPanel<Reporte[]>(`/paneles/reportes?v=${version}`)
  const [solo, setSolo] = useState<'mios' | 'todos'>('mios')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [pagina, setPagina] = useState(0)

  if (cargando) return <Cargando mensajes={['Buscando tus reportes…']} />
  if (error) return <CajaError mensaje={error} onReintentar={recargar} />

  const todos = datos ?? []
  const hayPropios = todos.some((r) => r.mio)
  const lista = todos
    .filter((r) => solo === 'todos' || !hayPropios || r.mio)
    .filter((r) => (filtro === 'todos' ? true : filtro === 'completo' ? r.completo : !r.completo && r.tipo === filtro))
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas - 1)
  const visibles = lista.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA)

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Pildoras
          opciones={[
            { valor: 'mios', texto: 'Mis reportes' },
            { valor: 'todos', texto: 'De todos los usuarios' },
          ]}
          valor={solo}
          onCambio={(v) => {
            setSolo(v)
            setPagina(0)
          }}
        />
        <Pildoras
          opciones={FILTROS}
          valor={filtro}
          onCambio={(v) => {
            setFiltro(v)
            setPagina(0)
          }}
        />
      </div>

      {visibles.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-10 text-center text-sm text-slate-500">
          <Inbox size={32} className="text-slate-300" />
          Todavía no hay reportes con este filtro. Genera uno en la pestaña «Generar».
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100">
          {visibles.map((r, i) => {
            const e = ESTILO[r.completo ? 'completo' : (r.tipo ?? 'pdf')] ?? ESTILO.pdf
            return (
              <li key={r.id} className="flex animate-aparecer items-center gap-4 py-3" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${e.color}14`, color: e.color }}>
                  <e.Icono size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {r.completo ? 'Todos los datos registrados' : 'Reporte del período'}{' '}
                    <span className="badge ml-1" style={{ backgroundColor: `${e.color}14`, color: e.color }}>
                      {e.texto}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmt(r.periodo_inicio)} → {fmt(r.periodo_fin)} · creado el {new Date(r.created_at).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <a
                  href={r.archivo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#0B4F6C] transition hover:border-[#0E7C9B] hover:bg-[#0E7C9B]/5"
                >
                  <Download size={14} /> <span className="hidden sm:inline">Descargar</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {lista.length > POR_PAGINA && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-600">
          <button
            onClick={() => setPagina(actual - 1)}
            disabled={actual === 0}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <span>
            Página {actual + 1} de {paginas} · {lista.length} reporte(s)
          </span>
          <button
            onClick={() => setPagina(actual + 1)}
            disabled={actual >= paginas - 1}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 hover:bg-slate-100 disabled:opacity-40"
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
