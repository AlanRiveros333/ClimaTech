import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, TrendingUp, FileText, CloudSun } from 'lucide-react'
import { getCurrentProfile } from '@/lib/supabase/server'
import NavBar from '@/components/nav-bar'

const MODULOS = [
  {
    href: '/registros',
    titulo: 'Registros climáticos',
    descripcion: 'Registra datos manualmente o impórtalos desde Open-Meteo.',
    Icono: ClipboardList,
    color: '#0E7C9B',
  },
  {
    href: '/proyecciones',
    titulo: 'Proyección estadística',
    descripcion: 'Genera y compara promedio móvil, Holt y regresión lineal múltiple.',
    Icono: TrendingUp,
    color: '#F59E0B',
  },
  {
    href: '/reportes',
    titulo: 'Reportes',
    descripcion: 'Exporta un PDF con el resumen histórico y las proyecciones.',
    Icono: FileText,
    color: '#5C6BC0',
  },
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />

      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B4F6C] via-[#0E7C9B] to-[#01BAEF] p-6 text-white shadow-lg sm:p-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm capitalize text-white/80">{fechaHoy}</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                Hola, {profile.nombre_completo}
              </h1>
              <p className="mt-1 text-sm text-white/80">Cochabamba, Bolivia</p>
            </div>
            <CloudSun size={48} className="shrink-0 text-white/90" />
          </div>

          <div className="mt-6 flex gap-6 border-t border-white/20 pt-4 text-sm">
            <div>
              <span className="text-white/70">Rol: </span>
              <span className="font-medium">{profile.rol}</span>
            </div>
            <div>
              <span className="text-white/70">Estado: </span>
              <span className="font-medium">{profile.estado}</span>
            </div>
          </div>
        </div>

        <h2 className="mb-4 text-sm font-semibold text-slate-500">Módulos del sistema</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {MODULOS.map((modulo) => (
            <Link
              key={modulo.href}
              href={modulo.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${modulo.color}1a` }}
              >
                <modulo.Icono size={22} color={modulo.color} />
              </div>
              <h3 className="font-semibold text-slate-900">{modulo.titulo}</h3>
              <p className="mt-1 text-sm text-slate-500">{modulo.descripcion}</p>
              <span
                className="mt-3 inline-block text-sm font-medium transition group-hover:underline"
                style={{ color: modulo.color }}
              >
                Ir al módulo
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
