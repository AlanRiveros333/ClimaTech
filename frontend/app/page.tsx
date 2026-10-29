import Link from 'next/link'
import { CloudSun } from 'lucide-react'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-center">
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-700 text-white">
        <CloudSun size={28} aria-hidden />
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">ClimaTech</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        Monitoreo y proyección estadística de temperatura, humedad y viento para Cochabamba.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Link href="/login" className="btn-primary px-6">
          Iniciar sesión
        </Link>
        <Link href="/register" className="btn-secondary px-6">
          Crear cuenta
        </Link>
      </div>
    </div>
  )
}
