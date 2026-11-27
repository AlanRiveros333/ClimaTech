'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Brain, Calculator, EyeOff, Ruler, Target, Trophy } from 'lucide-react'
import { CajaError, Cargando, Pasos, Pildoras, useDatosPanel, OPCIONES_VARIABLE, type Variable } from '@/components/paneles/ui'

type Metodo = {
  metodo: string
  nombre: string
  es_ml: boolean
  mae: number
  rmse: number
  mejora_vs_referencia_pct: number | null
  descripcion: string
  prueba: { fecha: string; real: number; predicho: number }[]
}
type Respuesta = {
  unidad: string
  dias_entrenamiento: number
  dias_prueba: number
  desde: string
  hasta: string
  metodos: Metodo[]
  omitidos: { nombre: string; motivo: string }[]
  historico: { fecha: string; valor: number }[]
}

// Explicación sencilla de cada método (la técnica viene del backend, la misma que usa el asistente).
const SIMPLE: Record<string, string> = {
  persistencia: 'Supone que mañana será igual que hoy. Es la vara de medir: un método que no le gana a esto no sirve.',
  promedio_movil: 'Promedia los últimos 7 días. Suaviza los altibajos, como fijarse en cómo estuvo la semana.',
  holt: 'Sigue el nivel y la tendencia: si la temperatura viene subiendo, supone que seguirá subiendo un poco.',
  regresion_lineal: 'Arma una fórmula con los días anteriores y la época del año para calcular el día siguiente.',
  random_forest: 'Cientos de «árboles de decisión» votan el valor del día. Aprende patrones que una fórmula simple no ve.',
  gradient_boosting: 'Árboles que se corrigen entre sí: cada árbol nuevo aprende de los errores del anterior.',
}

const COLORES: Record<string, string> = {
  persistencia: '#94a3b8',
  promedio_movil: '#0ea5e9',
  holt: '#14b8a6',
  regresion_lineal: '#6366f1',
  random_forest: '#d97706',
  gradient_boosting: '#db2777',
}

function tipo(m: Metodo) {
  if (m.metodo === 'persistencia') return { texto: 'Referencia', clase: 'bg-slate-100 text-slate-600' }
  if (m.es_ml) return { texto: 'Inteligencia artificial', clase: 'bg-violet-100 text-violet-700' }
  return { texto: 'Estadística', clase: 'bg-sky-100 text-sky-700' }
}

const PASOS = [
  { icono: <EyeOff size={20} />, color: '#0B4F6C', titulo: 'Se esconden días reales', texto: 'Los últimos 14 días medidos se apartan: ningún método los ve mientras aprende.' },
  { icono: <Target size={20} />, color: '#d97706', titulo: 'Cada método adivina', texto: 'Con el resto del historial, cada método intenta adivinar esos 14 días escondidos.' },
  { icono: <Ruler size={20} />, color: '#7c3aed', titulo: 'Se mide el error', texto: 'Se compara lo adivinado con lo real. El que menos se equivoca es el que proyecta.' },
]

export default function Metodos() {
  const [variable, setVariable] = useState<Variable>('temperatura')
  const { datos, error, cargando, recargar } = useDatosPanel<Respuesta>(`/paneles/metodos?variable=${variable}`)
  const [ocultos, setOcultos] = useState<Set<string>>(new Set(['persistencia', 'promedio_movil', 'holt']))

  const u = datos?.unidad ?? ''
  const metodos = datos?.metodos ?? []
  const ganador = metodos.find((m) => m.metodo !== 'persistencia')
  const peor = Math.max(...metodos.map((m) => m.rmse), 0.01)

  const serie = datos
    ? [
        ...datos.historico.map((h) => ({ fecha: h.fecha.slice(5), Real: h.valor }) as Record<string, number | string>),
        ...(metodos[0]?.prueba ?? []).map((p, i) => {
          const fila: Record<string, number | string> = { fecha: p.fecha.slice(5), Real: p.real }
          for (const m of metodos) fila[m.nombre] = m.prueba[i]?.predicho
          return fila
        }),
      ]
    : []
  const inicioPrueba = metodos[0]?.prueba[0]?.fecha.slice(5)

  function alternar(clave: string) {
    setOcultos((prev) => {
      const n = new Set(prev)
      if (n.has(clave)) n.delete(clave)
      else n.add(clave)
      return n
    })
  }

  return (
    <div className="space-y-8">
      <Pasos pasos={PASOS} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pildoras etiqueta="Variable" opciones={OPCIONES_VARIABLE} valor={variable} onCambio={(v) => setVariable(v)} />
        {datos && (
          <p className="text-xs text-slate-500">
            Aprendieron con {datos.dias_entrenamiento} días · prueba con {datos.dias_prueba} días que no vieron
          </p>
        )}
      </div>

      {cargando && <Cargando mensajes={['Escondiendo los últimos 14 días…', 'Entrenando los seis métodos…', 'Midiendo quién se equivocó menos…']} />}
      {error && <CajaError mensaje={error} onReintentar={recargar} />}

      {datos && !cargando && (
        <>
          {/* ranking */}
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="animate-aparecer rounded-3xl bg-slate-950 p-6 text-white shadow-lg">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>Error de cada método (RMSE, {u})</span>
                <span>Barra más corta = mejor</span>
              </div>
              <ul className="mt-5 space-y-3.5">
                {metodos.map((m) => {
                  const gana = m === ganador
                  const ref = m.metodo === 'persistencia'
                  return (
                    <li key={m.metodo}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-2 ${gana ? 'font-semibold text-amber-300' : 'text-white/85'}`}>
                          {gana && <Trophy size={15} />}
                          {m.nombre}
                        </span>
                        <span className="font-mono text-white/70">{m.rmse.toFixed(2)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-[width] duration-700 ${
                            gana ? 'bg-linear-to-r from-amber-300 to-orange-400' : ref ? 'bg-white/30' : 'bg-linear-to-r from-sky-400 to-violet-400'
                          }`}
                          style={{ width: `${(m.rmse / peor) * 100}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
              {ganador && ganador.mejora_vs_referencia_pct !== null && (
                <p className="mt-5 rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">
                  {ganador.mejora_vs_referencia_pct > 0
                    ? `${ganador.nombre} se equivoca un ${ganador.mejora_vs_referencia_pct.toFixed(0)} % menos que repetir el último valor.`
                    : 'En este período ningún método superó a la referencia: el clima estuvo muy estable.'}
                </p>
              )}
            </div>

            <div className="animate-aparecer rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">MAE y RMSE lado a lado</p>
              <p className="text-xs text-slate-500">Si el RMSE es mucho mayor que el MAE, el método tuvo algunos errores grandes.</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={metodos.map((m) => ({ nombre: m.nombre.replace(' (IA)', '').replace(' (7 días)', ''), MAE: m.mae, RMSE: m.rmse }))} margin={{ top: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} unit={` ${u}`} width={56} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(2)} ${u}`} />
                  <Legend />
                  <Bar dataKey="MAE" fill="#0E7C9B" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="RMSE" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* real vs predicho */}
          <div className="animate-aparecer rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Lo real contra lo que adivinó cada método</p>
                <p className="text-xs text-slate-500">
                  La línea negra es lo medido. Desde el {inicioPrueba?.slice(3, 5)}/{inicioPrueba?.slice(0, 2)} empiezan los días escondidos. Toca un método para mostrarlo u ocultarlo.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {metodos.map((m) => {
                const visible = !ocultos.has(m.metodo)
                return (
                  <button
                    key={m.metodo}
                    onClick={() => alternar(m.metodo)}
                    aria-pressed={visible}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${visible ? 'border-transparent text-white' : 'border-slate-200 text-slate-500'}`}
                    style={visible ? { backgroundColor: COLORES[m.metodo] ?? '#64748b' } : undefined}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: visible ? '#fff' : (COLORES[m.metodo] ?? '#64748b') }} />
                    {m.nombre}
                  </button>
                )
              })}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={serie} margin={{ top: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} unit={` ${u}`} width={60} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)} ${u}`} />
                <Line type="monotone" dataKey="Real" stroke="#0f172a" strokeWidth={2.5} dot={false} isAnimationActive />
                {metodos
                  .filter((m) => !ocultos.has(m.metodo))
                  .map((m) => (
                    <Line key={m.metodo} type="monotone" dataKey={m.nombre} stroke={COLORES[m.metodo] ?? '#64748b'} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* fichas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metodos.map((m, i) => {
              const t = tipo(m)
              return (
                <div
                  key={m.metodo}
                  className="group relative animate-aparecer overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="absolute -right-8 -top-8 size-24 rounded-full opacity-10 transition group-hover:scale-125" style={{ backgroundColor: COLORES[m.metodo] }} />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${COLORES[m.metodo]}22`, color: COLORES[m.metodo] }}>
                        {m.es_ml ? <Brain size={18} /> : <Calculator size={18} />}
                      </span>
                      <h3 className="font-semibold text-slate-900">{m.nombre}</h3>
                    </div>
                    {m === ganador && <Trophy size={18} className="shrink-0 text-amber-500" />}
                  </div>
                  <span className={`badge mt-3 ${t.clase}`}>{t.texto}</span>
                  <p className="mt-3 text-sm text-slate-700">
                    <b className="text-amber-700">En simple: </b>
                    {SIMPLE[m.metodo] ?? m.descripcion}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    <b className="text-violet-700">En técnico: </b>
                    {m.descripcion}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-slate-500">MAE</p>
                      <p className="font-semibold text-slate-900">{m.mae.toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-slate-500">RMSE</p>
                      <p className="font-semibold text-slate-900">{m.rmse.toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-slate-500">vs. referencia</p>
                      <p className={`font-semibold ${(m.mejora_vs_referencia_pct ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {m.mejora_vs_referencia_pct === null ? '—' : `${m.mejora_vs_referencia_pct > 0 ? '−' : '+'}${Math.abs(m.mejora_vs_referencia_pct).toFixed(0)} %`}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {datos.omitidos.length > 0 && (
            <p className="text-xs text-slate-500">No participaron: {datos.omitidos.map((o) => `${o.nombre} (${o.motivo})`).join('; ')}</p>
          )}
          <p className="rounded-2xl bg-violet-50 p-4 text-sm text-violet-900">
            <b>¿Y el modelo híbrido?</b> Para los primeros días de una proyección, ClimaTech además corrige el pronóstico meteorológico de Open-Meteo con
            aprendizaje automático y las mediciones de la estación del aeropuerto. Lo ves en el apartado «Proyección», dentro de «¿Cómo lo calculé?», y su detalle en «Estación».
          </p>
        </>
      )}
    </div>
  )
}
