import type { ReactNode } from 'react'
import { CloudSun } from 'lucide-react'

// Curvas de nivel: referencia al relieve del valle de Cochabamba.
// Un solo trazo base reutilizado a distintas escalas.
function Contornos() {
  const escalas = [0.3, 0.46, 0.62, 0.78, 0.94, 1.1, 1.28, 1.48]
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <path
          id="contorno"
          d="M300 150c96-12 182 52 202 146s-22 178-116 230-200 44-264-30S118 190 204 160c32-12 62-18 96-10z"
        />
      </defs>
      <g fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1.25">
        {escalas.map((s) => (
          <use
            key={s}
            href="#contorno"
            vectorEffect="non-scaling-stroke"
            transform={`translate(300 400) scale(${s}) translate(-300 -400)`}
          />
        ))}
      </g>
    </svg>
  )
}

export default function AuthShell({
  titulo,
  descripcion,
  children,
  pie,
}: {
  titulo: string
  descripcion: string
  children: ReactNode
  pie: ReactNode
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Panel de marca */}
      <aside className="relative hidden overflow-hidden bg-deep text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Contornos />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-white/10">
            <CloudSun size={20} strokeWidth={1.75} />
          </span>
          <span className="text-lg font-semibold tracking-tight">ClimaTech</span>
        </div>

        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Datos climáticos históricos de Cochabamba, en un solo lugar.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-deep-ink">
            Importa, consulta y proyecta temperatura, humedad y velocidad del viento, y compara
            tres métodos estadísticos con sus errores.
          </p>
        </div>

        <p className="relative text-xs text-deep-ink">
          Proyecto de grado · Sistemas Informáticos
        </p>
      </aside>

      {/* Formulario */}
      <main
        id="contenido"
        className="flex flex-col justify-center bg-surface px-6 py-10 sm:px-12"
      >
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-accent text-white">
              <CloudSun size={20} strokeWidth={1.75} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink">ClimaTech</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink">{titulo}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{descripcion}</p>

          <div className="mt-8">{children}</div>

          <p className="mt-8 text-sm text-ink-2">{pie}</p>
        </div>
      </main>
    </div>
  )
}
