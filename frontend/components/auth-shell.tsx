import type { ReactNode } from 'react'
import { CloudSun, Database, LineChart, FileText } from 'lucide-react'

const PUNTOS = [
  { Icono: Database, texto: 'Historial de temperatura, humedad y viento importado desde Open-Meteo.' },
  { Icono: LineChart, texto: 'Promedio móvil, Holt y regresión lineal comparados con MAE y RMSE.' },
  { Icono: FileText, texto: 'Reportes en PDF para el período que necesites.' },
]

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
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Panel de marca (solo escritorio) */}
      <aside className="hidden flex-col justify-between bg-brand-800 p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/10">
            <CloudSun size={20} aria-hidden />
          </span>
          ClimaTech
        </div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            El clima de Cochabamba, en un solo lugar y con método.
          </h2>
          <ul className="mt-8 max-w-md space-y-4">
            {PUNTOS.map(({ Icono, texto }) => (
              <li key={texto} className="flex items-start gap-3 text-sm leading-relaxed text-brand-100">
                <Icono size={18} className="mt-0.5 shrink-0 text-brand-300" aria-hidden />
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-200">
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <p className="mt-7 text-sm text-slate-600">{footer}</p>
        </div>
      </main>
    </div>
  )
}
