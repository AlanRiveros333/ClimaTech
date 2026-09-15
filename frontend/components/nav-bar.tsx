'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CloudSun } from 'lucide-react'
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

  return (
    <header className="bg-gradient-to-r from-[#0B4F6C] via-[#0E7C9B] to-[#01BAEF]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <CloudSun size={18} />
            ClimaTech
          </span>
          <nav className="flex gap-1">
            {ENLACES.map((enlace) => {
              const activo = pathname?.startsWith(enlace.href)
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    activo
                      ? 'bg-white/90 text-[#0B4F6C] font-medium'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {enlace.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {nombre && (
            <span className="text-sm text-white/90">
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
