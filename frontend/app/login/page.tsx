'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AuthShell from '@/components/auth-shell'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setCargando(false)

    if (error) {
      setError('Correo o contraseña incorrectos.')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Ingresa para consultar y proyectar el clima de Cochabamba."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link href="/register" className="font-medium text-brand-700 underline underline-offset-2">
            Regístrate
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
              autoComplete="current-password"
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
        </div>

        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={cargando} className="btn-primary w-full">
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </AuthShell>
  )
}
