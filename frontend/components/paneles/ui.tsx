'use client'

// Piezas visuales de los apartados (Proyección, Estación y Reportes), con la misma estética de Inicio:
// portada con degradado, nubes que se mueven, la cordillera y textos fáciles de entender.
import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Lightbulb, RefreshCw, Sun } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------- carga de datos
type Estado<T> = { clave: string; datos: T | null; error: string | null }

// Pide los datos al entrar y cada vez que cambia la ruta. `cargando` se deduce comparando la clave,
// así una respuesta vieja nunca pisa a la nueva.
export function useDatosPanel<T>(ruta: string | null) {
  const [version, setVersion] = useState(0)
  const [estado, setEstado] = useState<Estado<T> | null>(null)
  const clave = ruta ? `${ruta}#${version}` : ''

  useEffect(() => {
    if (!ruta) return
    let vigente = true
    apiFetch<T>(ruta)
      .then((datos) => vigente && setEstado({ clave, datos, error: null }))
      .catch((e) => vigente && setEstado({ clave, datos: null, error: e instanceof Error ? e.message : 'Error inesperado.' }))
    return () => {
      vigente = false
    }
  }, [ruta, clave])

  const actual = estado && estado.clave === clave ? estado : null
  return {
    datos: actual?.datos ?? null,
    error: actual?.error ?? null,
    cargando: !!ruta && !actual,
    recargar: () => setVersion((v) => v + 1),
  }
}

// ¿El usuario es administrador? (para mostrar las acciones que solo él puede hacer)
export function useEsAdmin() {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    const supabase = createClient()
    let vigente = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
      if (vigente) setAdmin(data?.rol === 'administrador')
    })
    return () => {
      vigente = false
    }
  }, [])
  return admin
}

// ---------------------------------------------------------------- portada
function Nube({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} fill="white" aria-hidden>
      <ellipse cx="40" cy="38" rx="28" ry="18" />
      <ellipse cx="68" cy="30" rx="30" ry="24" />
      <ellipse cx="92" cy="40" rx="22" ry="15" />
    </svg>
  )
}

export function Portada({
  etiqueta,
  titulo,
  resaltado,
  texto,
  icono,
  children,
}: {
  etiqueta: string
  titulo: string
  resaltado?: string
  texto: string
  icono: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-[#072d3e] via-[#0B4F6C] to-[#0E7C9B] px-4 pb-24 pt-10 text-white sm:pb-28">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[8%] top-6 size-36 rounded-full bg-amber-300/30 blur-3xl animate-pulso-sol" />
        <Nube className="absolute left-0 top-[14%] w-44 opacity-20 animate-nube-lenta" />
        <Nube className="absolute left-0 top-[48%] w-28 opacity-15 animate-nube-rapida [animation-delay:-18s]" />
        <svg viewBox="0 0 1440 220" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-24 w-full sm:h-32">
          <path
            d="M0 170 L120 120 L210 150 L330 70 L430 130 L540 60 L640 115 L760 40 L870 110 L980 75 L1090 135 L1200 85 L1320 140 L1440 100 V220 H0 Z"
            fill="#ffffff"
            opacity="0.08"
          />
          <path d="M0 200 C360 175 1080 175 1440 200 V220 H0 Z" fill="#f8fafc" />
        </svg>
      </div>
      <div className="relative mx-auto max-w-6xl animate-aparecer">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur">
          {icono}
          {etiqueta}
        </p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">
          {titulo}{' '}
          {resaltado && (
            <span className="bg-linear-to-r from-amber-200 via-amber-300 to-orange-300 bg-clip-text text-transparent">{resaltado}</span>
          )}
        </h1>
        <p className="mt-4 max-w-2xl text-white/80 sm:text-lg">{texto}</p>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- controles
export function Pildoras<T extends string | number>({
  opciones,
  valor,
  onCambio,
  oscuro = false,
  etiqueta,
}: {
  opciones: readonly { valor: T; texto: string; icono?: ReactNode }[]
  valor: T
  onCambio: (v: T) => void
  oscuro?: boolean
  etiqueta?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {etiqueta && <span className={`text-xs font-medium ${oscuro ? 'text-white/70' : 'text-slate-500'}`}>{etiqueta}</span>}
      <div className={`inline-flex flex-wrap gap-1 rounded-full p-1 ${oscuro ? 'bg-white/10 ring-1 ring-white/20' : 'bg-slate-100'}`}>
        {opciones.map((o) => {
          const activo = o.valor === valor
          return (
            <button
              key={String(o.valor)}
              type="button"
              onClick={() => onCambio(o.valor)}
              aria-pressed={activo}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition ${
                activo
                  ? oscuro
                    ? 'bg-white font-medium text-brand-700 shadow'
                    : 'bg-white font-medium text-brand-700 shadow-sm'
                  : oscuro
                    ? 'text-white/80 hover:bg-white/10'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {o.icono}
              {o.texto}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- estados
export function Cargando({ mensajes }: { mensajes: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % mensajes.length), 2200)
    return () => clearInterval(id)
  }, [mensajes.length])
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-amber-200 opacity-60" />
        <span className="relative flex size-14 items-center justify-center rounded-full bg-linear-to-br from-amber-200 to-amber-400 text-white shadow-lg">
          <Sun size={28} className="animate-spin [animation-duration:6s]" />
        </span>
      </div>
      <p key={i} className="animate-aparecer text-sm font-medium text-slate-700">
        {mensajes[i]}
      </p>
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/3 animate-[barra_1.6s_ease-in-out_infinite] rounded-full bg-linear-to-r from-[#0B4F6C] to-[#01BAEF]" />
      </div>
    </div>
  )
}

export function CajaError({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:flex-row sm:items-center">
      <AlertTriangle size={20} className="shrink-0" />
      <p className="flex-1">{mensaje}</p>
      {onReintentar && (
        <button onClick={onReintentar} className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1.5 font-medium hover:bg-red-100">
          <RefreshCw size={14} /> Reintentar
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- textos
export function EnPalabras({ texto, titulo = 'En palabras simples' }: { texto: string; titulo?: string }) {
  return (
    <div className="animate-aparecer rounded-3xl border border-amber-200 bg-linear-to-br from-amber-50 to-white p-5 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <span className="flex size-8 items-center justify-center rounded-xl bg-amber-100">
          <Lightbulb size={16} />
        </span>
        {titulo}
      </p>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{texto}</p>
    </div>
  )
}

export function Encabezado({ etiqueta, titulo, texto }: { etiqueta: string; titulo: string; texto?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#0E7C9B]">{etiqueta}</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">{titulo}</h2>
      {texto && <p className="mt-2 text-slate-500">{texto}</p>}
    </div>
  )
}

export function Pasos({ pasos }: { pasos: { icono: ReactNode; titulo: string; texto: string; color: string }[] }) {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {pasos.map((p, i) => (
        <li
          key={p.titulo}
          className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <div className="absolute -right-8 -top-8 size-24 rounded-full opacity-10 transition group-hover:scale-125" style={{ backgroundColor: p.color }} />
          <div className="flex items-center gap-3">
            <div className="relative flex size-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${p.color}1a`, color: p.color }}>
              {p.icono}
              <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-brand-700 text-[10px] font-semibold text-white">
                {i + 1}
              </span>
            </div>
            <h3 className="font-semibold text-slate-900">{p.titulo}</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{p.texto}</p>
        </li>
      ))}
    </ol>
  )
}

export const OPCIONES_VARIABLE = [
  { valor: 'temperatura', texto: 'Temperatura' },
  { valor: 'humedad', texto: 'Humedad' },
  { valor: 'velocidad_viento', texto: 'Viento' },
] as const

export type Variable = (typeof OPCIONES_VARIABLE)[number]['valor']
