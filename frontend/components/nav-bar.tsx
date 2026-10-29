'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CloudSun, LogOut, Menu, X } from 'lucide-react'
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
  const [menuAbierto, setMenuAbierto] = useState(false)

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
  const etiquetaRol = rol === 'administrador' ? 'Administrador' : 'Usuario'

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-brand-800">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-700 text-white">
              <CloudSun size={18} aria-hidden />
            </span>
            ClimaTech
          </Link>

          <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
            {enlaces.map((enlace) => {
              const activo = pathname?.startsWith(enlace.href)
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  aria-current={activo ? 'page' : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    activo
                      ? 'bg-brand-50 font-medium text-brand-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {enlace.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {nombre && (
            <div className="text-right leading-tight">
              <p className="max-w-[160px] truncate text-sm font-medium text-slate-900">{nombre}</p>
              {rol && <p className="text-xs text-slate-500">{etiquetaRol}</p>}
            </div>
          )}
          <button onClick={handleLogout} className="btn-secondary">
            <LogOut size={16} aria-hidden />
            Cerrar sesión
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMenuAbierto((v) => !v)}
          aria-expanded={menuAbierto}
          aria-controls="menu-movil"
          aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
          className="icon-btn md:hidden hover:bg-slate-100"
        >
          {menuAbierto ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {menuAbierto && (
        <div id="menu-movil" className="border-t border-slate-200 bg-white px-4 pb-4 pt-3 md:hidden">
          {nombre && (
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p className="text-sm font-medium text-slate-900">{nombre}</p>
              {rol && <p className="text-xs text-slate-500">{etiquetaRol}</p>}
            </div>
          )}
          <nav aria-label="Principal móvil" className="flex flex-col gap-1">
            {enlaces.map((enlace) => {
              const activo = pathname?.startsWith(enlace.href)
              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  onClick={() => setMenuAbierto(false)}
                  aria-current={activo ? 'page' : undefined}
                  className={`rounded-lg px-3 py-2.5 text-sm ${
                    activo ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {enlace.label}
                </Link>
              )
            })}
          </nav>
          <button onClick={handleLogout} className="btn-secondary mt-3 w-full">
            <LogOut size={16} aria-hidden />
            Cerrar sesión
          </button>
        </div>
      )}
    </header>
  )
}
