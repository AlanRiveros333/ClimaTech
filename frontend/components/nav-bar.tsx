'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CloudSun, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const ENLACES = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/registros', label: 'Registros' },
  { href: '/proyecciones', label: 'Proyecciones' },
  { href: '/reportes', label: 'Reportes' },
]

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [nombre, setNombre] = useState<string | null>(null)
  const [rol, setRol] = useState<string | null>(null)

  useEffect(() => {
    async function cargarPerfil() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('nombre_completo, rol')
        .eq('id', user.id)
        .single()

      if (profile) {
        setNombre(profile.nombre_completo)
        setRol(profile.rol)
      }
    }
    cargarPerfil()
  }, [supabase])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const enlaces = rol === 'administrador' ? [...ENLACES, { href: '/usuarios', label: 'Usuarios' }] : ENLACES

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="page flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5">
        <div className="flex items-center gap-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 text-[0.95rem] font-semibold tracking-tight text-ink"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
              <CloudSun size={18} strokeWidth={1.75} />
            </span>
            ClimaTech
          </Link>

          <nav
            aria-label="Principal"
            className="order-last -mx-1 flex w-full gap-0.5 overflow-x-auto pb-1 sm:order-none sm:mx-0 sm:w-auto sm:pb-0"
          >
            {enlaces.map((enlace) => {
              const activo = pathname?.startsWith(enlace.href)
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  aria-current={activo ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                    activo
                      ? 'bg-accent-soft font-medium text-accent-strong'
                      : 'text-ink-2 hover:bg-canvas hover:text-ink'
                  }`}
                >
                  {enlace.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {nombre && (
            <span className="hidden items-center gap-2 text-sm text-ink-2 md:flex">
              {nombre}
              {rol && (
                <span className="badge bg-canvas text-ink-2">
                  {rol === 'administrador' ? 'Admin' : 'Usuario'}
                </span>
              )}
            </span>
          )}
          <button
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="btn btn-ghost min-h-9 px-3"
          >
            <LogOut size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </header>
  )
}
