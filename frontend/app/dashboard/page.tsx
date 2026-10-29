import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, TrendingUp, FileText, ChevronRight } from 'lucide-react'
import { getCurrentProfile } from '@/lib/supabase/server'
import PageShell from '@/components/page-shell'

const MODULOS = [
  {
    href: '/registros',
    titulo: 'Registros climáticos',
    descripcion: 'Registra datos manualmente o impórtalos desde Open-Meteo.',
    Icono: ClipboardList,
  },
  {
    href: '/proyecciones',
    titulo: 'Proyección estadística',
    descripcion: 'Genera y compara promedio móvil, Holt y regresión lineal múltiple.',
    Icono: TrendingUp,
  },
  {
    href: '/reportes',
    titulo: 'Reportes',
    descripcion: 'Exporta un PDF con el resumen histórico y las proyecciones.',
    Icono: FileText,
  },
]

const PASOS = [
  'Importa o registra datos históricos.',
  'Genera una proyección con el método que quieras probar.',
  'Descarga el reporte del período.',
]

export default async function DashboardPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  const fechaHoy = new Date().toLocaleDateString('es-BO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const rolTexto = profile.rol === 'administrador' ? 'Administrador' : 'Usuario estándar'

  return (
    <PageShell>
      {/* Bienvenida */}
      <section className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-sm capitalize text-slate-500">
            {fechaHoy} · Cochabamba, Bolivia
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Hola, {profile.nombre_completo}
          </h1>
          <p className="mt-1 text-sm text-slate-600">¿Por dónde quieres empezar hoy?</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="badge bg-brand-50 text-brand-800">{rolTexto}</span>
          <span
            className={`badge ${
              profile.estado === 'activo' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Cuenta {profile.estado}
          </span>
        </div>
      </section>

      {/* Módulos */}
      <section aria-labelledby="modulos">
        <h2 id="modulos" className="mb-3 text-sm font-semibold text-slate-700">
          Módulos del sistema
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {MODULOS.map((modulo) => (
            <Link
              key={modulo.href}
              href={modulo.href}
              className="card group flex flex-col p-5 transition-colors hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <modulo.Icono size={20} aria-hidden />
              </span>
              <h3 className="font-semibold text-slate-900">{modulo.titulo}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-600">{modulo.descripcion}</p>
              <span className="mt-4 inline-flex items-center gap-0.5 text-sm font-medium text-brand-700">
                Abrir
                <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Flujo sugerido (es una secuencia real) */}
      <section className="card p-5 sm:p-6" aria-labelledby="flujo">
        <h2 id="flujo" className="text-sm font-semibold text-slate-700">
          Flujo de trabajo sugerido
        </h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {PASOS.map((paso, i) => (
            <li key={paso} className="flex items-start gap-3 text-sm text-slate-600">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">{paso}</span>
            </li>
          ))}
        </ol>
      </section>
    </PageShell>
  )
}
