'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CloudSun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const ENLACES = [
  { href: '/', label: 'Inicio' },
  { href: '/proyecciones', label: 'Proyección' },
  { href: '/aeropuerto', label: 'Aeropuerto' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/asistente', label: 'Asistente' },
]

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [nombre, setNombre] = useState<string | null>(null)
  const [rol, setRol] = useState<string | null>(null)

  useEffect(() => {
    let activo = true

    async function cargarPerfil() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('nombre_completo, rol')
        .eq('id', user.id)
        .single()

      if (activo && profile) {
        setNombre(profile.nombre_completo)
        setRol(profile.rol)
      }
    }

    void cargarPerfil()
    return () => { activo = false }
  }, [supabase])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const enlaces = rol === 'administrador'
    ? [...ENLACES, { href: '/usuarios', label: 'Usuarios' }]
    : ENLACES

  return (
    <header className="sticky top-0 z-40 border-b border-white/15 bg-linear-to-r from-[#0B4F6C] via-[#0E7C9B] to-[#01BAEF] shadow-lg shadow-slate-900/10">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-bold tracking-wide text-white">
            <span className="grid size-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <CloudSun size={20} />
            </span>
            <span className="hidden sm:inline">ClimaTech</span>
          </Link>

          <nav aria-label="Navegación principal" className="flex min-w-0 gap-1 overflow-x-auto">
            {enlaces.map((enlace) => {
              const activo = enlace.href === '/'
                ? pathname === '/'
                : pathname === enlace.href || pathname?.startsWith(`${enlace.href}/`)

              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  aria-current={activo ? 'page' : undefined}
                  className={`shrink-0 rounded-full px-3 py-2 text-sm transition-all duration-200 ${
                    activo
                      ? 'bg-white text-brand-800 font-semibold shadow-md'
                      : 'text-white/85 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  {enlace.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {nombre && (
            <span className="hidden text-sm text-white/90 xl:block">
              {nombre}
              {rol && (
                <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs text-white">
                  {rol === 'administrador' ? 'Admin' : 'Usuario'}
                </span>
              )}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="rounded-full border border-white/35 px-3 py-2 text-sm text-white transition hover:bg-white/15"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}
