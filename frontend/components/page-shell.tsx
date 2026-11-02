import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import NavBar from '@/components/nav-bar'

// Contenedor común de todas las páginas internas: barra superior + ancho único de contenido.
export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <NavBar />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  )
}

// Encabezado de página: ruta, título, descripción y acciones.
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <nav aria-label="Ruta" className="mb-2">
          <ol className="flex items-center gap-1 text-xs text-slate-500">
            <li>
              <Link href="/dashboard" className="rounded hover:text-brand-700 hover:underline">
                Inicio
              </Link>
            </li>
            <li aria-hidden className="flex items-center">
              <ChevronRight size={12} />
            </li>
            <li aria-current="page" className="font-medium text-slate-700">
              {title}
            </li>
          </ol>
        </nav>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
            <Icon size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

// Título de sección dentro de una tarjeta.
export function CardTitle({
  title,
  description,
  right,
}: {
  title: string
  description?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {right}
    </div>
  )
}

// Indicador numérico (etiqueta + valor + contexto).
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: LucideIcon
}) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {Icon && <Icon size={14} aria-hidden />}
        {label}
      </p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

// Estado vacío con indicación de qué hacer.
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon size={20} aria-hidden />
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Estado de carga simple.
export function LoadingState({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-8 text-sm text-slate-600" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700" aria-hidden />
      {text}
    </div>
  )
}
