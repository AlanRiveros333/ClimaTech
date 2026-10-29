'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AuthShell from '@/components/auth-shell'

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
    <AuthShell
      title="Crear cuenta"
      subtitle="Te registrarás como usuario estándar."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-medium text-brand-700 underline underline-offset-2">
            Inicia sesión
          </Link>
        </>
      }
    >
      {exito ? (
        <p role="status" className="alert-success">
          Cuenta creada. Redirigiendo a inicio de sesión…
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nombre" className="label">
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              required
              autoComplete="name"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="email" className="label">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={mostrarPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-11"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword((v) => !v)}
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="icon-btn absolute right-0.5 top-1/2 -translate-y-1/2 hover:text-slate-800"
              >
                {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Mínimo 6 caracteres.</p>
          </div>

          {error && (
            <p role="alert" className="alert-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={cargando} className="btn-primary w-full">
            {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
