import Link from 'next/link'
import {
  ArrowRight,
  BellRing,
  Bot,
  Brain,
  CloudSun,
  Database,
  FileText,
  ShieldCheck,
  Thermometer,
  TrendingUp,
  Waves,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Termometro, colorVariable } from '@/components/clima-visuales'

// Ejemplo ilustrativo (no son datos reales): muestra cómo se ve una proyección.
const EJEMPLO = [
  { dia: 'lun', valor: 17 },
  { dia: 'mar', valor: 18 },
  { dia: 'mié', valor: 20 },
  { dia: 'jue', valor: 21 },
  { dia: 'vie', valor: 19 },
  { dia: 'sáb', valor: 17 },
  { dia: 'dom', valor: 15 },
]

const FUNCIONES = [
  {
    Icono: Thermometer,
    color: '#d97706',
    titulo: 'Proyecciones fáciles de entender',
    texto: 'Temperatura, humedad y viento de los próximos días con termómetros, rangos y palabras sencillas: fresco, templado, cálido.',
  },
  {
    Icono: Brain,
    color: '#7c3aed',
    titulo: 'Inteligencia artificial con validación honesta',
    texto: 'Compara promedio móvil, Holt, regresión lineal, Random Forest y Gradient Boosting en días que no vieron al entrenar, y elige el de menor error.',
  },
  {
    Icono: Waves,
    color: '#0E7C9B',
    titulo: 'El Niño y La Niña',
    texto: 'Considera fenómenos como el superniño cuando mejoran la proyección y muestra cuánto se aparta el clima de lo habitual.',
  },
  {
    Icono: BellRing,
    color: '#db2777',
    titulo: 'Alertas por correo',
    texto: 'Lluvia intensa, heladas, calor extremo o viento fuerte: recibe un aviso en tu correo cuando se esperan.',
  },
  {
    Icono: Bot,
    color: '#0B4F6C',
    titulo: 'Un asistente que hace el trabajo',
    texto: 'Pide en lenguaje natural lo que necesitas: proyectar, registrar datos, importar históricos o generar reportes.',
  },
  {
    Icono: FileText,
    color: '#5C6BC0',
    titulo: 'Reportes en PDF',
    texto: 'Exporta el resumen histórico y las proyecciones de cualquier período para tu trabajo o clase.',
  },
]

const PASOS = [
  { n: '1', titulo: 'Reúne los datos', texto: 'Importa el historial de Cochabamba desde Open-Meteo o registra lecturas a mano.' },
  { n: '2', titulo: 'Conversa con el asistente', texto: 'Escribe qué necesitas, por ejemplo: «proyecta la temperatura de los próximos 10 días».' },
  { n: '3', titulo: 'Recibe resultados explicados', texto: 'Ves el resultado, el método usado, por qué se eligió y si hay alertas probables.' },
]

const TECNOLOGIAS = ['Next.js', 'FastAPI (Python)', 'Supabase · PostgreSQL', 'scikit-learn', 'statsmodels', 'Open-Meteo', 'Tailwind CSS']

export default async function Inicio() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const conSesion = !!user

  return (
    <div className="bg-white text-slate-800">
      {/* Barra superior */}
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-white">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <CloudSun size={22} />
            ClimaTech
          </span>
          <nav className="hidden items-center gap-6 text-sm text-white/85 md:flex">
            <a href="#funciones" className="hover:text-white">Qué hace</a>
            <a href="#como-funciona" className="hover:text-white">Cómo funciona</a>
            <a href="#transparencia" className="hover:text-white">Transparencia</a>
          </nav>
          <div className="flex items-center gap-2">
            {conSesion ? (
              <Link href="/asistente" className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-[#0B4F6C] hover:bg-white/90">
                Ir al asistente
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

      {/* Portada */}
      <section className="bg-linear-to-br from-[#0B4F6C] via-[#0E7C9B] to-[#01BAEF] px-4 pb-20 pt-28 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              Proyecto de Grado · Sistemas Informáticos · Cochabamba, Bolivia
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Entiende el clima de Cochabamba antes de que llegue</h1>
            <p className="mt-5 max-w-xl text-lg text-white/85">
              ClimaTech reúne datos históricos y proyecta temperatura, humedad y viento con métodos matemáticos e
              inteligencia artificial. Considera fenómenos como El Niño y te avisa por correo cuando se esperan lluvias
              intensas o heladas.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {conSesion ? (
                <Link href="/asistente" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-brand-700 shadow-lg hover:bg-white/90">
                  Ir al asistente <ArrowRight size={18} />
                </Link>
              ) : (
                <>
                  <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-brand-700 shadow-lg hover:bg-white/90">
                    Crear cuenta gratis <ArrowRight size={18} />
                  </Link>
                  <Link href="/login" className="rounded-full border border-white/50 px-6 py-3 font-medium hover:bg-white/10">
                    Ya tengo cuenta
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Ejemplo de proyección */}
          <div className="rounded-3xl bg-white/95 p-5 text-slate-800 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Cochabamba · próximos 7 días</p>
                <p className="text-4xl font-semibold text-slate-900">
                  18.1<span className="text-xl font-normal text-slate-500"> °C</span>
                </p>
                <span className="mt-1 inline-block rounded-full bg-lime-100 px-3 py-0.5 text-sm font-medium text-lime-800">Templado</span>
              </div>
              <Termometro valor={18.1} color={colorVariable('temperatura', 18.1)} alto={96} />
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {EJEMPLO.map((d) => (
                <div key={d.dia} className="flex flex-col items-center rounded-xl border border-slate-200 py-2">
                  <span className="text-[11px] uppercase text-slate-500">{d.dia}</span>
                  <Termometro valor={d.valor} color={colorVariable('temperatura', d.valor)} alto={44} />
                  <span className="text-sm font-semibold text-slate-900">{d.valor}°</span>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">⚠ Alerta probable: lluvia intensa el jueves</p>
            <p className="mt-2 text-center text-[11px] text-slate-400">Ejemplo ilustrativo</p>
          </div>
        </div>
      </section>

      {/* Cifras */}
      <section className="border-b border-slate-100 bg-slate-50 px-4 py-8">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 text-center sm:grid-cols-4">
          {[
            ['6', 'métodos comparados'],
            ['3', 'variables climáticas'],
            ['2', 'fenómenos: El Niño y La Niña'],
            ['PDF', 'reportes exportables'],
          ].map(([cifra, etiqueta]) => (
            <div key={etiqueta}>
              <p className="text-3xl font-semibold text-brand-700">{cifra}</p>
              <p className="text-sm text-slate-500">{etiqueta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Funciones */}
      <section id="funciones" className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-semibold text-slate-900">Todo el análisis del clima en un solo lugar</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-500">
            Pensado para estudiantes, docentes y personas interesadas en el comportamiento del clima local.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FUNCIONES.map(({ Icono, color, titulo, texto }) => (
              <div key={titulo} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1a` }}>
                  <Icono size={24} color={color} />
                </div>
                <h3 className="font-semibold text-slate-900">{titulo}</h3>
                <p className="mt-2 text-sm text-slate-600">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="bg-linear-to-b from-[#EAF8FD] to-white px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-semibold text-slate-900">Cómo funciona</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PASOS.map((p) => (
              <div key={p.n} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-xl font-semibold text-white">{p.n}</div>
                <h3 className="font-semibold text-slate-900">{p.titulo}</h3>
                <p className="mt-2 text-sm text-slate-600">{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transparencia */}
      <section id="transparencia" className="px-4 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <ShieldCheck size={24} color="#059669" />
            </div>
            <h2 className="text-3xl font-semibold text-slate-900">Una proyección honesta</h2>
            <p className="mt-4 text-slate-600">
              Las proyecciones de ClimaTech son estimaciones estadísticas basadas en el comportamiento pasado de los datos. No
              reemplazan a un pronóstico meteorológico profesional. Para decisiones importantes consulta al{' '}
              <a href="https://www.senamhi.gob.bo" target="_blank" rel="noopener noreferrer" className="font-medium text-[#0E7C9B] underline">
                SENAMHI
              </a>
              .
            </p>
          </div>
          <ul className="space-y-3 text-sm text-slate-700">
            {[
              'Cada método se evalúa en días que no vio al entrenar.',
              'Se compara contra una referencia simple: si no la supera, el sistema lo dice.',
              'Explica qué método usó, cuánto se equivoca y si consideró El Niño o La Niña.',
              'Las alertas se basan en el pronóstico de Open-Meteo y lo indican claramente.',
            ].map((t) => (
              <li key={t} className="flex gap-3 rounded-xl border border-slate-200 p-4">
                <TrendingUp size={18} className="mt-0.5 shrink-0 text-[#0E7C9B]" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tecnologías */}
      <section className="border-t border-slate-100 bg-slate-50 px-4 py-12">
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

      {/* Llamado final y pie */}
      <section className="bg-linear-to-r from-[#0B4F6C] to-[#0E7C9B] px-4 py-14 text-center text-white">
        <h2 className="text-2xl font-semibold">Pruébalo con los datos reales de Cochabamba</h2>
        <Link
          href={conSesion ? '/asistente' : '/register'}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-brand-700 hover:bg-white/90"
        >
          {conSesion ? 'Ir al asistente' : 'Crear cuenta gratis'} <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="bg-slate-900 px-4 py-8 text-center text-xs text-slate-400">
        <p className="font-medium text-slate-200">ClimaTech · Sistema web para el monitoreo y proyección estadística de variables climáticas</p>
        <p className="mt-1">Instituto Técnico Nacional de Comercio «Federico Alvarez Plata» Nocturno · Carrera de Sistemas Informáticos</p>
        <p className="mt-1">Proyecto de Grado de Alan German Riveros Pacheco · Tutor: Ing. Opi Condori Edwin · Cochabamba, 2026</p>
      </footer>
    </div>
  )
}
