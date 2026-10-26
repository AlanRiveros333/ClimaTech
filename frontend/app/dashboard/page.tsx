import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, TrendingUp, FileText, ArrowRight } from 'lucide-react'
import { getCurrentProfile } from '@/lib/supabase/server'
import NavBar from '@/components/nav-bar'

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

const ETIQUETA_ROL: Record<string, string> = {
  administrador: 'Administrador',
  usuario_estandar: 'Usuario estándar',
}

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

  const activo = profile.estado === 'activo'

  return (
    <div className="min-h-dvh">
      <NavBar />

      <main
        id="contenido"
        className="page grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16"
      >
        <section>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Hola, {profile.nombre_completo}
          </h1>
          <p className="mt-2 text-sm capitalize text-ink-2">{fechaHoy} · Cochabamba, Bolivia</p>

          <dl className="mt-8 grid max-w-xs grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
            <dt className="text-ink-2">Rol</dt>
            <dd>
              <span className="badge bg-accent-soft text-accent-strong">
                {ETIQUETA_ROL[profile.rol] ?? profile.rol}
              </span>
            </dd>
            <dt className="text-ink-2">Estado</dt>
            <dd>
              <span
                className={`badge ${
                  activo ? 'bg-success-soft text-success' : 'bg-canvas text-ink-2'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${activo ? 'bg-success' : 'bg-ink-3'}`}
                />
                {activo ? 'Activo' : 'Inactivo'}
              </span>
            </dd>
          </dl>
        </section>

        <section aria-labelledby="titulo-modulos">
          <h2 id="titulo-modulos" className="mb-3 text-sm font-medium text-ink-2">
            Módulos del sistema
          </h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {MODULOS.map((modulo) => (
              <li key={modulo.href}>
                <Link
                  href={modulo.href}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-canvas"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                    <modulo.Icono size={20} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{modulo.titulo}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-ink-2">
                      {modulo.descripcion}
                    </span>
                  </span>
                  <ArrowRight
                    size={18}
                    strokeWidth={1.75}
                    className="shrink-0 text-ink-3 transition-[transform,color] duration-200 ease-out-strong group-hover:translate-x-1 group-hover:text-accent"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
