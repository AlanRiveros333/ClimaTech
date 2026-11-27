'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CloudSun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Cada apartado funciona por sí solo; el administrador tiene además la gestión de usuarios.
const ENLACES = [
  { href: '/', label: 'Inicio' },
  { href: '/proyecciones', label: 'Proyección' },
  { href: '/estacion', label: 'Estación' },
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
    <header className="bg-linear-to-r from-[#0B4F6C] via-[#0E7C9B] to-[#01BAEF]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-6">
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-white">
            <CloudSun size={18} />
            ClimaTech
          </span>
          <nav className="flex gap-1 overflow-x-auto">
            {enlaces.map((enlace) => {
              const activo = enlace.href === '/' ? pathname === '/' : pathname?.startsWith(enlace.href)
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition ${
                    activo
                      ? 'bg-white/90 text-brand-700 font-medium'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
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
            <span className="hidden text-sm text-white/90 lg:block">
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
            className="rounded-full border border-white/30 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  )
}
