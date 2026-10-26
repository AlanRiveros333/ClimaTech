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
      titulo="Crear cuenta"
      descripcion="Te registrarás como usuario estándar. Un administrador puede cambiar tu rol después."
      pie={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link
            href="/login"
            className="font-medium text-accent underline underline-offset-4 transition-colors hover:text-accent-strong"
          >
            Inicia sesión
          </Link>
        </>
      }
    >
      {exito ? (
        <p role="status" className="alert alert-success">
          Cuenta creada. Redirigiendo a inicio de sesión...
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="nombre" className="field-label">
              Nombre completo
            </label>
            <input
              id="nombre"
              type="text"
              autoComplete="name"
              required
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="email" className="field-label">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={mostrarPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field pr-11"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword((v) => !v)}
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="btn-icon absolute right-0.5 top-1/2 -translate-y-1/2"
              >
                {mostrarPassword ? (
                  <EyeOff size={18} strokeWidth={1.75} />
                ) : (
                  <Eye size={18} strokeWidth={1.75} />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Mínimo 6 caracteres.</p>
          </div>

          {error && (
            <p role="alert" className="alert alert-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={cargando} className="btn btn-primary w-full">
            {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
