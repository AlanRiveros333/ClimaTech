import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardList,
  TrendingUp,
  FileText,
  Users,
  ChevronRight,
  Thermometer,
  Droplets,
  Wind,
  Database,
  CalendarRange,
  Clock,
  FileCheck2,
  Inbox,
} from 'lucide-react'
import { createClient, getCurrentProfile } from '@/lib/supabase/server'
import PageShell, { StatTile, CardTitle } from '@/components/page-shell'
import ContourPattern from '@/components/contour-pattern'
import DailyChart, { type PuntoDiario, type SerieDiaria } from '@/components/daily-chart'

type Lectura = {
  fecha: string
  hora: string
  temperatura: number | null
  humedad: number | null
  velocidad_viento: number | null
  fuente: string
}
type Fila = { fecha: string; temperatura: number | null; humedad: number | null; velocidad_viento: number | null }

const PASOS = [
  { titulo: 'Importa o registra datos', texto: 'Carga el historial desde Open-Meteo o ingresa lecturas manuales.', href: '/registros' },
  { titulo: 'Genera una proyección', texto: 'Elige variable, método y período; revisa MAE y RMSE.', href: '/proyecciones' },
  { titulo: 'Descarga el reporte', texto: 'Exporta el período en PDF, Word o Excel.', href: '/reportes' },
]

function fechaCorta(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
function fechaCompleta(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function diasEntre(a: string, b: string) {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) + 1
}
function restarDias(iso: string, n: number) {
  const f = new Date(iso + 'T00:00:00')
  f.setDate(f.getDate() - n)
  const mm = String(f.getMonth() + 1).padStart(2, '0')
  const dd = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${mm}-${dd}`
}

function agruparPorDia(filas: Fila[], campo: 'temperatura' | 'humedad' | 'velocidad_viento'): PuntoDiario[] {
  const porDia = new Map<string, number[]>()
  for (const f of filas) {
    const v = f[campo]
    if (v === null || v === undefined) continue
    porDia.set(f.fecha, [...(porDia.get(f.fecha) ?? []), v])
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, vals]) => ({
      fecha,
      media: vals.reduce((a, b) => a + b, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    }))
}

// Lecturas de solo consulta sobre las mismas tablas que ya usa la app (sujetas a RLS).
async function cargarResumen() {
  const supabase = await createClient()
  const [ultimo, primero, total, reportes] = await Promise.all([
    supabase
      .from('registros_climaticos')
      .select('fecha, hora, temperatura, humedad, velocidad_viento, fuente')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('registros_climaticos').select('fecha').order('fecha', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('registros_climaticos').select('id', { count: 'exact', head: true }),
    supabase.from('reportes').select('id', { count: 'exact', head: true }),
  ])

  const lectura = (ultimo.data as Lectura | null) ?? null
  let semana: Fila[] = []
  if (lectura) {
    const { data } = await supabase
      .from('registros_climaticos')
      .select('fecha, temperatura, humedad, velocidad_viento')
      .gte('fecha', restarDias(lectura.fecha, 6))
      .lte('fecha', lectura.fecha)
      .order('fecha', { ascending: true })
      .limit(1000)
    semana = (data as Fila[] | null) ?? []
  }

  return {
    lectura,
    primerDia: (primero.data as { fecha: string } | null)?.fecha ?? null,
    totalRegistros: total.count ?? 0,
    totalReportes: reportes.count ?? 0,
    semana,
  }
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  const { lectura, primerDia, totalRegistros, totalReportes, semana } = await cargarResumen()

  const hoy = new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })
  const fechaHoy = hoy.charAt(0).toUpperCase() + hoy.slice(1)
  const esAdmin = profile.rol === 'administrador'
  const rolTexto = esAdmin ? 'Administrador' : 'Usuario estándar'
  const primerNombre = String(profile.nombre_completo ?? '').split(' ')[0]

  const series: SerieDiaria[] = [
    { key: 'temperatura', label: 'Temperatura', unidad: '°C', color: '#c26a05', datos: agruparPorDia(semana, 'temperatura') },
    { key: 'humedad', label: 'Humedad', unidad: '%', color: '#0f6a88', datos: agruparPorDia(semana, 'humedad') },
    { key: 'velocidad_viento', label: 'Viento', unidad: ' km/h', color: '#0b4f6c', datos: agruparPorDia(semana, 'velocidad_viento') },
  ]

  // Mín y máx de temperatura del último día registrado
  const tempsUltimoDia = lectura
    ? semana.filter((f) => f.fecha === lectura.fecha && f.temperatura !== null).map((f) => f.temperatura as number)
    : []
  const minDia = tempsUltimoDia.length ? Math.min(...tempsUltimoDia) : null
  const maxDia = tempsUltimoDia.length ? Math.max(...tempsUltimoDia) : null

  const modulos = [
    { href: '/registros', titulo: 'Registros climáticos', texto: 'Registra datos manualmente o impórtalos desde Open-Meteo.', Icono: ClipboardList },
    { href: '/proyecciones', titulo: 'Proyección estadística', texto: 'Promedio móvil, Holt y regresión lineal múltiple con sus métricas de error.', Icono: TrendingUp },
    { href: '/reportes', titulo: 'Reportes', texto: 'Resumen histórico y proyecciones del período en PDF, Word o Excel.', Icono: FileText },
    ...(esAdmin
      ? [{ href: '/usuarios', titulo: 'Usuarios', texto: 'Cambia roles y activa o desactiva cuentas.', Icono: Users }]
      : []),
  ]

  return (
    <PageShell>
      {/* Saludo */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{fechaHoy} · Cochabamba</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Hola, {primerNombre}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="badge bg-brand-50 text-brand-800">{rolTexto}</span>
          <span
            className={`badge ${profile.estado === 'activo' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
          >
            Cuenta {profile.estado}
          </span>
        </div>
      </header>

      {/* Condiciones registradas */}
      <section aria-label="Condiciones registradas" className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
        <div className="relative flex flex-col overflow-hidden rounded-xl bg-brand-800 p-6 text-white sm:p-7">
          <ContourPattern className="pointer-events-none absolute -right-16 -top-10 size-[460px] text-brand-300 opacity-20" />
          <div className="relative flex flex-1 flex-col">
            <p className="text-xs font-medium uppercase tracking-wider text-brand-200">Última lectura registrada</p>

            {lectura ? (
              <>
                <p className="mt-1 text-sm text-brand-100">
                  {fechaCompleta(lectura.fecha)} · {lectura.hora.slice(0, 5)} ·{' '}
                  {lectura.fuente === 'manual' ? 'Manual' : 'Open-Meteo'}
                </p>
                <p className="mt-5 flex items-start gap-1 tabular-nums">
                  <Thermometer size={22} className="mt-3 text-accent-100" aria-hidden />
                  <span className="text-6xl font-semibold tracking-tight">
                    {lectura.temperatura !== null ? lectura.temperatura.toFixed(1) : '—'}
                  </span>
                  <span className="mt-2 text-2xl text-brand-200">°C</span>
                </p>
                {minDia !== null && maxDia !== null && (
                  <p className="mt-1 text-sm text-brand-100">
                    Ese día: mínima {minDia.toFixed(1)}°C · máxima {maxDia.toFixed(1)}°C
                  </p>
                )}
                <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-white/10 px-3.5 py-3">
                    <dt className="flex items-center gap-1.5 text-xs text-brand-200">
                      <Droplets size={14} aria-hidden /> Humedad
                    </dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                      {lectura.humedad !== null ? `${lectura.humedad}%` : '—'}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-white/10 px-3.5 py-3">
                    <dt className="flex items-center gap-1.5 text-xs text-brand-200">
                      <Wind size={14} aria-hidden /> Viento
                    </dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                      {lectura.velocidad_viento !== null ? `${lectura.velocidad_viento} km/h` : '—'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-4 text-xs text-brand-200">
                  <span>Cochabamba · −17,39°, −66,16°</span>
                  <Link href="/registros" className="inline-flex items-center gap-0.5 font-medium text-white hover:underline">
                    Ver registros <ChevronRight size={14} aria-hidden />
                  </Link>
                </div>
              </>
            ) : (
              <div className="py-8">
                <p className="text-lg font-semibold">Aún no hay registros</p>
                <p className="mt-1 max-w-xs text-sm text-brand-100">
                  Importa el historial de Cochabamba desde Open-Meteo para ver aquí las condiciones y la serie de los
                  últimos días.
                </p>
                <Link
                  href="/registros"
                  className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50"
                >
                  <Inbox size={16} aria-hidden /> Ir a Registros
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="card p-5 sm:p-6">
          <CardTitle
            title="Últimos 7 días registrados"
            description={
              lectura
                ? `Del ${fechaCorta(restarDias(lectura.fecha, 6))} al ${fechaCorta(lectura.fecha)}. Línea: promedio diario; banda: mínimo y máximo.`
                : 'Se mostrará cuando existan registros.'
            }
          />
          {semana.length > 0 ? (
            <DailyChart series={series} />
          ) : (
            <p className="py-16 text-center text-sm text-slate-500">Sin datos para graficar.</p>
          )}
        </div>
      </section>

      {/* Inventario de datos */}
      <section aria-label="Resumen de datos" className="card grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden lg:grid-cols-4 lg:divide-y-0">
        <StatTile
          icon={Database}
          label="Registros almacenados"
          value={totalRegistros.toLocaleString('es-BO')}
          hint="Lecturas horarias y manuales"
        />
        <StatTile
          icon={CalendarRange}
          label="Cobertura del historial"
          value={primerDia && lectura ? `${fechaCorta(primerDia)} – ${fechaCorta(lectura.fecha)}` : '—'}
          hint={primerDia && lectura ? `${diasEntre(primerDia, lectura.fecha).toLocaleString('es-BO')} días (${primerDia.slice(0, 4)}–${lectura.fecha.slice(0, 4)})` : 'Sin datos'}
        />
        <StatTile
          icon={Clock}
          label="Última lectura"
          value={lectura ? `${fechaCorta(lectura.fecha)} · ${lectura.hora.slice(0, 5)}` : '—'}
          hint={lectura ? (lectura.fuente === 'manual' ? 'Registro manual' : 'Importada de Open-Meteo') : 'Sin datos'}
        />
        <StatTile icon={FileCheck2} label="Reportes generados" value={totalReportes.toLocaleString('es-BO')} hint="En tu historial" />
      </section>

      {/* Módulos y flujo */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card overflow-hidden">
          <h2 className="border-b border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-900">Módulos</h2>
          <ul className="divide-y divide-slate-100">
            {modulos.map((m) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <m.Icono size={20} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">{m.titulo}</span>
                    <span className="block text-sm text-slate-600">{m.texto}</span>
                  </span>
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Flujo de trabajo</h2>
          <ol className="mt-4">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="relative flex gap-3 pb-5 last:pb-0">
                {i < PASOS.length - 1 && (
                  <span className="absolute left-3 top-7 h-[calc(100%-1.5rem)] w-px bg-slate-200" aria-hidden />
                )}
                <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <Link href={p.href} className="text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline">
                    {p.titulo}
                  </Link>
                  <p className="text-sm text-slate-600">{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </PageShell>
  )
}
