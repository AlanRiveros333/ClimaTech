import Link from 'next/link'
import {
  ArrowRight,
  BellRing,
  Bot,
  Brain,
  ChevronDown,
  CloudRain,
  CloudSun,
  Database,
  Droplets,
  FileText,
  Flame,
  GraduationCap,
  LineChart,
  Microscope,
  ShieldCheck,
  Snowflake,
  Sprout,
  Thermometer,
  Trophy,
  Waves,
  Wind,
  Wrench,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Gota, Termometro, Viento, colorVariable } from '@/components/clima-visuales'
import ExplicacionDoble from '@/components/inicio/explicacion-doble'

// ----------------------------------------------------------------- datos en vivo
// Clima actual y próximos 7 días de Cochabamba desde Open-Meteo (gratis, sin clave).
// Se guarda en caché 30 minutos. Si falla, la portada muestra un ejemplo y lo indica.
const LAT = -17.3895
const LON = -66.1568

type ClimaVivo = {
  temperatura: number
  humedad: number
  viento: number
  hora: string
  dias: { dia: string; max: number; min: number; lluvia: number | null }[]
}

async function obtenerClimaVivo(): Promise<ClimaVivo | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    '&current=temperature_2m,relative_humidity_2m,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=America%2FLa_Paz&forecast_days=7'
  try {
    const r = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const j = await r.json()
    const d = j.daily
    return {
      temperatura: j.current.temperature_2m,
      humedad: j.current.relative_humidity_2m,
      viento: j.current.wind_speed_10m,
      hora: String(j.current.time ?? '').slice(11, 16),
      dias: (d.time as string[]).map((fecha, i) => ({
        dia: new Date(`${fecha}T12:00:00`).toLocaleDateString('es-BO', { weekday: 'short' }).replace('.', ''),
        max: Math.round(d.temperature_2m_max[i]),
        min: Math.round(d.temperature_2m_min[i]),
        lluvia: d.precipitation_probability_max?.[i] ?? null,
      })),
    }
  } catch {
    return null
  }
}

const EJEMPLO: ClimaVivo = {
  temperatura: 19.4,
  humedad: 52,
  viento: 11,
  hora: '',
  dias: [
    { dia: 'lun', max: 24, min: 10, lluvia: 10 },
    { dia: 'mar', max: 25, min: 11, lluvia: 20 },
    { dia: 'mié', max: 26, min: 12, lluvia: 35 },
    { dia: 'jue', max: 23, min: 12, lluvia: 70 },
    { dia: 'vie', max: 22, min: 11, lluvia: 40 },
    { dia: 'sáb', max: 24, min: 9, lluvia: 15 },
    { dia: 'dom', max: 25, min: 10, lluvia: 5 },
  ],
}

function sensacion(t: number): { texto: string; clase: string } {
  if (t < 8) return { texto: 'Frío', clase: 'bg-blue-100 text-blue-800' }
  if (t < 15) return { texto: 'Fresco', clase: 'bg-cyan-100 text-cyan-800' }
  if (t < 23) return { texto: 'Templado', clase: 'bg-lime-100 text-lime-800' }
  if (t < 29) return { texto: 'Cálido', clase: 'bg-amber-100 text-amber-800' }
  return { texto: 'Caluroso', clase: 'bg-red-100 text-red-800' }
}

// ----------------------------------------------------------------- contenido
const PUBLICO = [
  {
    Icono: Sprout,
    color: '#16a34a',
    titulo: 'Para la vida diaria',
    texto: 'Agricultores, familias y comerciantes que quieren saber si se vienen heladas, lluvias fuertes o días de calor, explicado en palabras simples.',
  },
  {
    Icono: GraduationCap,
    color: '#0E7C9B',
    titulo: 'Para estudiantes y docentes',
    texto: 'Un laboratorio real para aprender estadística, series de tiempo e inteligencia artificial con datos del clima de Cochabamba.',
  },
  {
    Icono: Microscope,
    color: '#7c3aed',
    titulo: 'Para técnicos e investigadores',
    texto: 'Comparación de modelos con backtesting, métricas MAE y RMSE, variables ENSO y reportes en PDF listos para analizar.',
  },
]

const FLUJO = [
  { Icono: Database, titulo: 'Datos', texto: 'Historial diario de Open-Meteo y lecturas registradas a mano.' },
  { Icono: Wrench, titulo: 'Limpieza', texto: 'Se ordenan por día y se rellenan huecos cortos.' },
  { Icono: Trophy, titulo: 'Competencia', texto: '6 métodos intentan adivinar días que no vieron.' },
  { Icono: LineChart, titulo: 'Proyección', texto: 'El ganador proyecta los próximos días.' },
  { Icono: BellRing, titulo: 'Alertas', texto: 'Si se esperan eventos fuertes, te llega un correo.' },
]

// Ejemplo ilustrativo del ranking (no son resultados reales). El sistema ordena por RMSE.
const RANKING = [
  { metodo: 'Random Forest', tipo: 'Machine Learning', rmse: 1.22 },
  { metodo: 'Gradient Boosting', tipo: 'Machine Learning', rmse: 1.3 },
  { metodo: 'Regresión lineal', tipo: 'Estadística', rmse: 1.45 },
  { metodo: 'Holt', tipo: 'Estadística', rmse: 1.7 },
  { metodo: 'Promedio móvil', tipo: 'Estadística', rmse: 1.85 },
  { metodo: 'Persistencia', tipo: 'Referencia', rmse: 2.1 },
]

// Mismos umbrales que backend/app/alertas_reglas.py
const ALERTAS = [
  { Icono: CloudRain, color: '#2563eb', titulo: 'Lluvia intensa', medio: '≥ 15 mm', alto: '≥ 30 mm', nota: 'con probabilidad de lluvia de 60 % o más' },
  { Icono: Snowflake, color: '#0891b2', titulo: 'Helada', medio: 'mínima ≤ 2 °C', alto: 'mínima ≤ 0 °C', nota: 'importante para cultivos y salud' },
  { Icono: Flame, color: '#dc2626', titulo: 'Calor extremo', medio: 'máxima ≥ 32 °C', alto: 'máxima ≥ 35 °C', nota: 'riesgo de golpe de calor' },
  { Icono: Wind, color: '#64748b', titulo: 'Viento fuerte', medio: 'ráfagas ≥ 50 km/h', alto: 'ráfagas ≥ 70 km/h', nota: 'polvo, techos y árboles' },
]

const FUNCIONES = [
  { Icono: Bot, color: '#0B4F6C', titulo: 'Asistente en lenguaje natural', texto: 'Escribe «proyecta la humedad de la próxima semana» y el asistente lo hace por ti.' },
  { Icono: Thermometer, color: '#d97706', titulo: 'Visuales fáciles de leer', texto: 'Termómetros, gotas y colores que cambian con el valor: se entiende de un vistazo.' },
  { Icono: Brain, color: '#7c3aed', titulo: 'IA con validación honesta', texto: 'Los métodos se califican con datos que no vieron, y el sistema te dice cuál ganó y por qué.' },
  { Icono: Waves, color: '#0369a1', titulo: 'El Niño y La Niña', texto: 'Mira cuánto se aparta el clima de lo normal en cada fase y úsalo en las proyecciones.' },
  { Icono: BellRing, color: '#db2777', titulo: 'Alertas por correo', texto: 'Actívalas una vez y recibe avisos de lluvias, heladas, calor o viento fuerte.' },
  { Icono: FileText, color: '#5C6BC0', titulo: 'Reportes en PDF', texto: 'Exporta el historial y las proyecciones de cualquier período para tu trabajo o clase.' },
]

const PREGUNTAS = [
  {
    p: '¿ClimaTech reemplaza al pronóstico del SENAMHI?',
    r: 'No. ClimaTech hace proyecciones estadísticas para analizar y aprender del clima local. Para decisiones importantes, consulta siempre el pronóstico oficial del SENAMHI.',
  },
  {
    p: '¿De dónde salen los datos?',
    r: 'Del historial diario de Open-Meteo para las coordenadas de Cochabamba y de las lecturas que los usuarios registran manualmente en el sistema.',
  },
  {
    p: '¿Por qué a veces gana un método simple y no la IA?',
    r: 'Porque se elige al que menos se equivoca con datos reales que no vio, no al más sofisticado. Si un método simple acierta más, es el mejor para ese caso, y el sistema lo dice con transparencia.',
  },
  {
    p: '¿Las alertas usan la IA de ClimaTech?',
    r: 'No. Las tormentas y heladas dependen de la física de la atmósfera, que un modelo estadístico no puede anticipar bien. Por eso las alertas usan el pronóstico meteorológico de Open-Meteo y aplican umbrales claros.',
  },
  {
    p: '¿Cuántos días hacia adelante puedo proyectar?',
    r: 'Lo recomendable son pocos días. Cada día proyectado se apoya en el anterior, así que la incertidumbre crece mientras más lejos se proyecta.',
  },
]

const TECNOLOGIAS = ['Next.js', 'FastAPI (Python)', 'Supabase · PostgreSQL', 'scikit-learn', 'statsmodels', 'Open-Meteo', 'Tailwind CSS']

// ----------------------------------------------------------------- ilustraciones
function CieloAnimado() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sol */}
      <div className="absolute right-[8%] top-24 size-40 rounded-full bg-amber-300/40 blur-3xl animate-pulso-sol" />
      <div className="absolute right-[12%] top-32 size-16 rounded-full bg-linear-to-br from-amber-200 to-amber-400 opacity-90 shadow-[0_0_60px_20px_rgba(251,191,36,0.35)]" />
      {/* Nubes */}
      <Nube className="absolute left-0 top-[18%] w-48 opacity-25 animate-nube-lenta" />
      <Nube className="absolute left-0 top-[42%] w-32 opacity-20 animate-nube-rapida [animation-delay:-14s]" />
      <Nube className="absolute left-0 top-[8%] w-24 opacity-15 animate-nube-rapida [animation-delay:-28s]" />
      {/* Cordillera del Tunari */}
      <svg viewBox="0 0 1440 220" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-40 w-full sm:h-56">
        <path
          d="M0 170 L120 120 L210 150 L330 70 L430 130 L540 60 L640 115 L760 40 L870 110 L980 75 L1090 135 L1200 85 L1320 140 L1440 100 V220 H0 Z"
          fill="#ffffff"
          opacity="0.08"
        />
        <path
          d="M0 190 L150 150 L260 175 L380 120 L500 165 L620 130 L740 170 L860 125 L990 165 L1110 135 L1240 170 L1350 145 L1440 160 V220 H0 Z"
          fill="#ffffff"
          opacity="0.12"
        />
        <path d="M0 200 C360 175 1080 175 1440 200 V220 H0 Z" fill="#ffffff" />
      </svg>
    </div>
  )
}

function Nube({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} fill="white">
      <ellipse cx="40" cy="38" rx="28" ry="18" />
      <ellipse cx="68" cy="30" rx="30" ry="24" />
      <ellipse cx="92" cy="40" rx="22" ry="15" />
    </svg>
  )
}

function Encabezado({ etiqueta, titulo, texto }: { etiqueta: string; titulo: string; texto?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#0E7C9B]">{etiqueta}</p>
      <h2 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">{titulo}</h2>
      {texto && <p className="mt-4 text-slate-500">{texto}</p>}
    </div>
  )
}

// ----------------------------------------------------------------- página
export default async function Inicio() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const conSesion = !!user

  const vivo = await obtenerClimaVivo()
  const clima = vivo ?? EJEMPLO
  const s = sensacion(clima.temperatura)
  const maxSemana = Math.max(...clima.dias.map((d) => d.max))
  const minSemana = Math.min(...clima.dias.map((d) => d.min))
  const rango = Math.max(1, maxSemana - minSemana)
  const peorRmse = Math.max(...RANKING.map((r) => r.rmse))

  return (
    <div className="bg-white text-slate-800">
      {/* ---------------- Barra superior ---------------- */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-white">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <CloudSun size={22} />
            ClimaTech
          </span>
          <nav className="hidden items-center gap-6 text-sm text-white/85 md:flex">
            {conSesion ? (
              <>
                <Link href="/proyecciones" className="hover:text-white">Proyección</Link>
                <Link href="/estacion" className="hover:text-white">Estación</Link>
                <Link href="/reportes" className="hover:text-white">Reportes</Link>
                <Link href="/asistente" className="hover:text-white">Asistente</Link>
              </>
            ) : (
              <>
                <a href="#explicacion" className="hover:text-white">Cómo funciona</a>
                <a href="#metodos" className="hover:text-white">La IA</a>
                <a href="#alertas" className="hover:text-white">Alertas</a>
                <a href="#preguntas" className="hover:text-white">Preguntas</a>
              </>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {conSesion ? (
              <Link href="/proyecciones" className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-white/90">
                Ver la proyección
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-full border border-white/40 px-4 py-1.5 text-sm hover:bg-white/10">
                  Ingresar
                </Link>
                <Link href="/register" className="hidden rounded-full bg-white px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-white/90 sm:block">
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---------------- Portada ---------------- */}
      <section className="relative overflow-hidden bg-linear-to-b from-[#072d3e] via-[#0B4F6C] to-[#0E7C9B] px-4 pb-44 pt-28 text-white sm:pb-52">
        <CieloAnimado />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-aparecer">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur">
              <span className="size-2 rounded-full bg-emerald-400" /> Proyecto de Grado · Cochabamba, Bolivia
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] sm:text-6xl">
              El clima de Cochabamba,{' '}
              <span className="bg-linear-to-r from-amber-200 via-amber-300 to-orange-300 bg-clip-text text-transparent">explicado y anticipado</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/80">
              ClimaTech analiza años de datos de temperatura, humedad y viento, pone a competir métodos estadísticos y de
              inteligencia artificial, y te muestra lo que probablemente viene, con palabras que cualquiera entiende.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {conSesion ? (
                <Link href="/proyecciones" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-brand-700 shadow-lg shadow-black/20 transition hover:-translate-y-0.5">
                  Ver la proyección <ArrowRight size={18} />
                </Link>
              ) : (
                <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-brand-700 shadow-lg shadow-black/20 transition hover:-translate-y-0.5">
                  Crear cuenta gratis <ArrowRight size={18} />
                </Link>
              )}
              <a href="#explicacion" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 font-medium hover:bg-white/10">
                Ver cómo funciona <ChevronDown size={18} />
              </a>
            </div>
          </div>

          {/* Tarjeta de clima */}
          <div className="animate-flotar">
            <div className="rounded-3xl bg-white/95 p-5 text-slate-800 shadow-2xl shadow-black/30 ring-1 ring-white/50 backdrop-blur sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm text-slate-500">
                    {vivo ? (
                      <>
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                        </span>
                        Ahora en Cochabamba{clima.hora && ` · ${clima.hora}`}
                      </>
                    ) : (
                      'Cochabamba · ejemplo ilustrativo'
                    )}
                  </p>
                  <p className="mt-1 text-5xl font-semibold tracking-tight text-slate-900">
                    {clima.temperatura.toFixed(1)}
                    <span className="text-2xl font-normal text-slate-400"> °C</span>
                  </p>
                  <span className={`mt-2 inline-block rounded-full px-3 py-0.5 text-sm font-medium ${s.clase}`}>{s.texto}</span>
                </div>
                <Termometro valor={clima.temperatura} color={colorVariable('temperatura', clima.temperatura)} alto={104} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-3 rounded-2xl bg-sky-50 p-3">
                  <Gota valor={clima.humedad} color={colorVariable('humedad', clima.humedad)} alto={34} />
                  <div>
                    <p className="text-xs text-slate-500">Humedad</p>
                    <p className="font-semibold text-slate-900">{Math.round(clima.humedad)} %</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                  <Viento valor={clima.viento} color={colorVariable('velocidad_viento', clima.viento)} alto={40} />
                  <div>
                    <p className="text-xs text-slate-500">Viento</p>
                    <p className="font-semibold text-slate-900">{Math.round(clima.viento)} km/h</p>
                  </div>
                </div>
              </div>

              {/* Próximos 7 días: barras de mínima a máxima */}
              <p className="mt-5 text-xs font-medium uppercase tracking-wider text-slate-400">Próximos 7 días</p>
              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {clima.dias.map((d) => {
                  const base = ((d.min - minSemana) / rango) * 100
                  const alto = Math.max(12, ((d.max - d.min) / rango) * 100)
                  return (
                    <div key={d.dia} className="flex flex-col items-center gap-1">
                      <span className="text-[11px] font-medium uppercase text-slate-500">{d.dia}</span>
                      <span className="text-xs font-semibold text-slate-900">{d.max}°</span>
                      <div className="relative h-16 w-2.5 rounded-full bg-slate-100">
                        <div
                          className="absolute inset-x-0 rounded-full"
                          style={{
                            bottom: `${base}%`,
                            height: `${alto}%`,
                            background: `linear-gradient(to top, ${colorVariable('temperatura', d.min)}, ${colorVariable('temperatura', d.max)})`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{d.min}°</span>
                      {d.lluvia !== null && (
                        <span className={`flex items-center text-[10px] ${d.lluvia >= 60 ? 'font-semibold text-blue-600' : 'text-slate-400'}`}>
                          <Droplets size={10} />
                          {d.lluvia}%
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-4 text-center text-[11px] text-slate-400">
                {vivo ? 'Pronóstico meteorológico de Open-Meteo, actualizado cada 30 min' : 'No se pudo conectar con Open-Meteo: se muestra un ejemplo'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Cifras ---------------- */}
      <section className="relative z-10 -mt-24 px-4 sm:-mt-28">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['6', 'métodos compiten en cada proyección', Trophy, '#d97706'],
            ['3', 'variables: temperatura, humedad y viento', Thermometer, '#0E7C9B'],
            ['4', 'tipos de alerta por correo', BellRing, '#db2777'],
            ['ENSO', 'El Niño y La Niña en el análisis', Waves, '#0369a1'],
          ].map(([cifra, etiqueta, Icono, color]) => {
            const I = Icono as typeof Trophy
            return (
              <div key={etiqueta as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
                <I size={20} color={color as string} />
                <p className="mt-3 text-3xl font-semibold text-slate-900">{cifra as string}</p>
                <p className="mt-1 text-sm text-slate-500">{etiqueta as string}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ---------------- Para quién ---------------- */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <Encabezado etiqueta="Para quién es" titulo="Útil sepas o no de clima" texto="La misma información, contada al nivel que necesitas." />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PUBLICO.map(({ Icono, color, titulo, texto }) => (
              <div key={titulo} className="group relative overflow-hidden rounded-3xl border border-slate-200 p-7 transition hover:-translate-y-1 hover:shadow-xl">
                <div className="absolute -right-10 -top-10 size-32 rounded-full opacity-10 transition group-hover:scale-125" style={{ backgroundColor: color }} />
                <div className="flex size-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}1a`, color }}>
                  <Icono size={24} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Explicación en dos niveles ---------------- */}
      <section id="explicacion" className="scroll-mt-8 bg-linear-to-b from-[#EAF8FD] to-white px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <Encabezado
            etiqueta="Explicado a tu manera"
            titulo="Entiende qué hay detrás de cada número"
            texto="Elige «Sencillo» para una explicación con ejemplos, o «Técnico» para ver los métodos y las métricas."
          />
          <div className="mt-10">
            <ExplicacionDoble />
          </div>
        </div>
      </section>

      {/* ---------------- Del dato a la alerta ---------------- */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <Encabezado etiqueta="El recorrido" titulo="Del dato a la alerta en 5 pasos" />
          <div className="relative mt-14">
          <div aria-hidden className="absolute left-[10%] right-[10%] top-7 hidden h-0.5 bg-linear-to-r from-[#0B4F6C] via-[#7c3aed] to-[#db2777] md:block" />
          <ol className="relative grid gap-8 md:grid-cols-5 md:gap-4">
            {FLUJO.map(({ Icono, titulo, texto }, i) => (
              <li key={titulo} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
                <div className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-lg ring-1 ring-slate-200">
                  <Icono size={24} />
                  <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">{i + 1}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 md:mt-4">{titulo}</h3>
                  <p className="mt-1 text-sm text-slate-600">{texto}</p>
                </div>
              </li>
            ))}
          </ol>
          </div>
        </div>
      </section>

      {/* ---------------- La competencia de métodos ---------------- */}
      <section id="metodos" className="scroll-mt-8 bg-slate-950 px-4 py-20 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">La inteligencia artificial</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Una competencia justa entre 6 métodos</h2>
            <p className="mt-5 text-white/70">
              ClimaTech no confía a ciegas en un solo modelo. Esconde los últimos días reales, le pide a cada método que los
              adivine y mide su error. <span className="text-white">El que menos se equivoca gana</span> y es el que proyecta
              tu consulta.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold text-amber-300">En simple</p>
                <p className="mt-1 text-sm text-white/70">Barra más corta = menos error = mejor método.</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold text-violet-300">En técnico</p>
                <p className="mt-1 text-sm text-white/70">RMSE fuera de muestra, comparado contra la persistencia como referencia.</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Error de cada método (RMSE, °C)</span>
              <span>Ejemplo ilustrativo</span>
            </div>
            <ul className="mt-5 space-y-3.5">
              {RANKING.map((r, i) => {
                const ganador = i === 0
                const referencia = r.tipo === 'Referencia'
                return (
                  <li key={r.metodo}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-2 ${ganador ? 'font-semibold text-amber-300' : 'text-white/85'}`}>
                        {ganador && <Trophy size={15} />}
                        {r.metodo}
                        <span className="text-[11px] font-normal text-white/40">{r.tipo}</span>
                      </span>
                      <span className="font-mono text-white/70">{r.rmse.toFixed(2)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${
                          ganador ? 'bg-linear-to-r from-amber-300 to-orange-400' : referencia ? 'bg-white/30' : 'bg-linear-to-r from-sky-400 to-violet-400'
                        }`}
                        style={{ width: `${(r.rmse / peorRmse) * 100}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-5 rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">
              En este ejemplo, el ganador se equivoca un {Math.round((1 - RANKING[0].rmse / peorRmse) * 100)} % menos que la
              referencia simple de «repetir el último valor».
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Alertas ---------------- */}
      <section id="alertas" className="scroll-mt-8 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <Encabezado
            etiqueta="Alertas por correo"
            titulo="Te avisamos antes de que pase"
            texto="El sistema revisa el pronóstico de los próximos 3 días y te escribe si algún valor cruza estos límites."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ALERTAS.map(({ Icono, color, titulo, medio, alto, nota }) => (
              <div key={titulo} className="rounded-3xl border border-slate-200 p-6 transition hover:shadow-lg">
                <div className="flex size-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}1a`, color }}>
                  <Icono size={24} />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{titulo}</h3>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-1.5">
                    <dt className="font-medium text-amber-800">Aviso</dt>
                    <dd className="text-amber-900">{medio}</dd>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-1.5">
                    <dt className="font-medium text-red-700">Alerta</dt>
                    <dd className="text-red-800">{alto}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-slate-500">{nota}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Funciones ---------------- */}
      <section className="bg-slate-50 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <Encabezado etiqueta="Todo en un lugar" titulo="Lo que puedes hacer con ClimaTech" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FUNCIONES.map(({ Icono, color, titulo, texto }) => (
              <div key={titulo} className="flex gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1a`, color }}>
                  <Icono size={22} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{titulo}</h3>
                  <p className="mt-1 text-sm text-slate-600">{texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Preguntas y transparencia ---------------- */}
      <section id="preguntas" className="scroll-mt-8 px-4 py-20">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ShieldCheck size={24} />
            </div>
            <h2 className="mt-4 text-3xl font-semibold text-slate-900">Honesto con lo que sabe y lo que no</h2>
            <p className="mt-4 text-slate-600">
              Las proyecciones de ClimaTech son estimaciones estadísticas basadas en el comportamiento pasado. Te dicen qué
              método se usó y cuánto suele equivocarse. No reemplazan al pronóstico oficial: para decisiones importantes
              consulta al{' '}
              <a href="https://www.senamhi.gob.bo" target="_blank" rel="noopener noreferrer" className="font-medium text-[#0E7C9B] underline">
                SENAMHI
              </a>
              .
            </p>
          </div>
          <div className="space-y-3">
            {PREGUNTAS.map(({ p, r }) => (
              <details key={p} className="group rounded-2xl border border-slate-200 p-5 open:bg-slate-50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                  {p}
                  <ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Tecnologías ---------------- */}
      <section className="border-t border-slate-100 px-4 py-12">
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-4 flex items-center justify-center gap-2 text-sm font-medium text-slate-500">
            <Database size={16} /> Construido con
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {TECNOLOGIAS.map((t) => (
              <span key={t} className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-600">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Llamado final ---------------- */}
      <section className="relative overflow-hidden bg-linear-to-r from-[#072d3e] via-[#0B4F6C] to-[#0E7C9B] px-4 py-20 text-center text-white">
        <Nube className="absolute -left-10 top-6 w-56 opacity-10" />
        <Nube className="absolute -right-10 bottom-4 w-64 opacity-10" />
        <div className="relative">
          <h2 className="text-3xl font-semibold sm:text-4xl">Pruébalo con los datos reales de Cochabamba</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/75">Pregúntale al asistente lo que quieras saber del clima. Él hace el resto.</p>
          <Link
            href={conSesion ? '/asistente' : '/register'}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-medium text-brand-700 shadow-lg transition hover:-translate-y-0.5"
          >
            {conSesion ? 'Ir al asistente' : 'Crear cuenta gratis'} <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="bg-slate-950 px-4 py-8 text-center text-xs text-slate-400">
        <p className="font-medium text-slate-200">ClimaTech · Sistema web para el monitoreo y proyección estadística de variables climáticas</p>
        <p className="mt-1">Instituto Técnico Nacional de Comercio «Federico Alvarez Plata» Nocturno · Carrera de Sistemas Informáticos</p>
        <p className="mt-1">Proyecto de Grado de Alan German Riveros Pacheco · Tutor: Ing. Opi Condori Edwin · Cochabamba, 2026</p>
      </footer>
    </div>
  )
}