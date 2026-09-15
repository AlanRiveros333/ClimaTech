'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, CloudSun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [nombreCompleto, setNombreCompleto] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)

    // El trigger handle_new_user (definido en 001_profiles.sql) crea
    // automáticamente la fila en 'profiles' con rol 'usuario_estandar'.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre_completo: nombreCompleto },
      },
    })

    setCargando(false)

    if (error) {
      console.error('Error de registro (Supabase):', error)
      setError(
        error.message.includes('already registered')
          ? 'Ese correo ya está registrado.'
          : `No se pudo completar el registro: ${error.message}`
      )
      return
    }

    setExito(true)
    setTimeout(() => router.push('/login'), 2000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0B4F6C] via-[#0E7C9B] to-[#01BAEF] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/95 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#01BAEF]/10">
            <CloudSun size={26} color="#0B4F6C" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Crear cuenta</h1>
          <p className="mt-1 text-sm text-slate-500">Regístrate como usuario estándar</p>
        </div>

        {exito ? (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            Cuenta creada. Redirigiendo a inicio de sesión...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="nombre" className="mb-1 block text-sm font-medium text-slate-700">
                Nombre completo
              </label>
              <input
                id="nombre"
                type="text"
                required
                value={nombreCompleto}
                onChange={(e) => setNombreCompleto(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0E7C9B] focus:outline-none focus:ring-1 focus:ring-[#0E7C9B]"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0E7C9B] focus:outline-none focus:ring-1 focus:ring-[#0E7C9B]"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={mostrarPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0E7C9B] focus:outline-none focus:ring-1 focus:ring-[#0E7C9B]"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((v) => !v)}
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-lg bg-gradient-to-r from-[#0B4F6C] to-[#01BAEF] py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-medium text-[#0B4F6C] underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
