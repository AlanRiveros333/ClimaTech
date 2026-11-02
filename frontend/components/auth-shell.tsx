import type { ReactNode } from 'react'
import { CloudSun, MapPin } from 'lucide-react'
import ContourPattern from '@/components/contour-pattern'

const METODOS = ['Promedio móvil', 'Holt', 'Regresión lineal múltiple']
const VARIABLES = ['Temperatura', 'Humedad', 'Viento']

// Estructura compartida de inicio de sesión y registro.
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      {/* Panel de marca (solo escritorio) */}
      <aside className="relative hidden overflow-hidden bg-brand-800 text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <ContourPattern className="pointer-events-none absolute inset-0 size-full text-brand-300 opacity-20" />

        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/10">
            <CloudSun size={20} aria-hidden />
          </span>
          ClimaTech
        </div>

        <div className="relative max-w-lg">
          <p className="mb-4 flex items-center gap-1.5 text-sm text-brand-200">
            <MapPin size={14} aria-hidden />
            Cochabamba, Bolivia · −17,39°, −66,16°
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            Datos climáticos históricos, comparados con método.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            Importa el historial desde Open-Meteo, proyecta unos días hacia adelante con tres métodos
            estadísticos y compara su error con MAE y RMSE.
          </p>

          <dl className="mt-8 space-y-4 border-t border-white/15 pt-6 text-sm">
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-brand-300">Variables</dt>
              <dd className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <span key={v} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                    {v}
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-brand-300">Métodos</dt>
              <dd className="flex flex-wrap gap-1.5">
                {METODOS.map((m) => (
                  <span key={m} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                    {m}
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-brand-300">Salida</dt>
              <dd className="flex flex-wrap gap-1.5">
                {['PDF', 'Word', 'Excel'].map((f) => (
                  <span key={f} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                    {f}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
        </div>

        <p className="relative text-xs text-brand-200">
          Proyecto académico. Las proyecciones son estimaciones estadísticas, no pronósticos meteorológicos.
        </p>
      </aside>

      {/* Formulario */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 text-lg font-semibold text-brand-800 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-700 text-white">
              <CloudSun size={20} aria-hidden />
            </span>
            ClimaTech
          </div>
          <div className="card p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>
        </div>
      </main>
    </div>
  )
}
