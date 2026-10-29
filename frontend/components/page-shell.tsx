import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import NavBar from '@/components/nav-bar'

// Contenedor común de todas las páginas internas: barra superior + ancho de contenido.
export default function PageShell({
  children,
  width = 'max-w-5xl',
}: {
  children: ReactNode
  width?: string
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <NavBar />
      <main className={`mx-auto w-full ${width} space-y-6 px-4 py-8 sm:px-6 sm:py-10`}>
        {children}
      </main>
    </div>
  )
}

// Encabezado de página: icono, título y descripción de lo que se puede hacer.
export function PageHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <header className="flex items-start gap-3.5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
        <Icon size={22} aria-hidden />
      </div>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{description}</p>
      </div>
    </header>
  )
}

// Título de sección dentro de una tarjeta.
export function CardTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
    </div>
  )
}

// Estado vacío con indicación de qué hacer.
export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon size={20} aria-hidden />
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{text}</p>
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
