'use client'

// Explicaciones con dos niveles: «Sencillo» para cualquier persona y «Técnico» para quien conoce el tema.
// El usuario elige el nivel y el tema; el contenido cambia sin recargar la página.

import { useState } from 'react'
import { BookOpen, Brain, GraduationCap, LineChart, ShieldCheck, Sparkles, Waves } from 'lucide-react'

type Nivel = 'sencillo' | 'tecnico'

type Tema = {
  id: string
  titulo: string
  Icono: typeof Brain
  color: string
  sencillo: { texto: string; ejemplo: string }
  tecnico: { texto: string; puntos: string[] }
}

const TEMAS: Tema[] = [
  {
    id: 'proyeccion',
    titulo: '¿Qué es una proyección?',
    Icono: LineChart,
    color: '#0E7C9B',
    sencillo: {
      texto:
        'Es una estimación de cómo podrían ser la temperatura, la humedad o el viento en los próximos días, calculada a partir de cómo se comportaron en el pasado. Es como mirar la «costumbre» del clima de Cochabamba y continuarla.',
      ejemplo:
        'Si en las últimas semanas las mañanas fueron cada vez más frías, ClimaTech lo nota y proyecta que esa tendencia podría seguir unos días más.',
    },
    tecnico: {
      texto:
        'Es un pronóstico estadístico univariado sobre la serie diaria de cada variable. La serie se regulariza a frecuencia diaria, los huecos de hasta 7 días se interpolan y se usa el último tramo continuo.',
      puntos: [
        'Variables: temperatura (°C), humedad relativa (%) y velocidad del viento (km/h).',
        'Los modelos de Machine Learning usan 7 rezagos y proyectan de forma recursiva (cada predicción alimenta la siguiente).',
        'La regresión lineal incluye tendencia y una componente estacional anual.',
      ],
    },
  },
  {
    id: 'ia',
    titulo: '¿Cómo elige el método la IA?',
    Icono: Brain,
    color: '#7c3aed',
    sencillo: {
      texto:
        'ClimaTech pone a competir 6 métodos distintos. A cada uno le esconde los últimos días reales, le pide que los adivine y mide cuánto se equivocó. Gana el que se equivoca menos, y ese se usa para proyectar.',
      ejemplo:
        'Es como un examen sorpresa: todos los métodos estudian con los mismos datos, pero solo se les califica con preguntas que nunca vieron.',
    },
    tecnico: {
      texto:
        'Se aplica backtesting fuera de muestra: se reserva el tramo final de la serie como prueba, se entrena con el resto y se calculan MAE y RMSE. El ranking se ordena por RMSE y luego el ganador se reentrena con la serie completa.',
      puntos: [
        'Métodos: persistencia (referencia), promedio móvil de 7 días, Holt, regresión lineal, Random Forest y Gradient Boosting.',
        'Se informa el % de mejora de cada método frente a la persistencia.',
        'Si ningún método supera a la referencia, el sistema lo indica explícitamente.',
      ],
    },
  },
  {
    id: 'enso',
    titulo: 'El Niño y La Niña',
    Icono: Waves,
    color: '#0369a1',
    sencillo: {
      texto:
        'Son cambios en la temperatura del océano Pacífico que alteran el clima de toda la región. En Bolivia pueden traer más sequía o más lluvia de lo normal. ClimaTech los toma en cuenta cuando ayudan a proyectar mejor.',
      ejemplo:
        'En años de El Niño fuerte (el «superniño»), Cochabamba suele registrar temperaturas distintas a lo habitual, y el sistema te muestra cuánto se apartan.',
    },
    tecnico: {
      texto:
        'Los eventos ENSO registrados (fase e intensidad) se convierten en una variable exógena: signo de la fase × nivel de intensidad, 0 en meses neutros. Se incorpora a los modelos cuando la variable varía en el período analizado.',
      puntos: [
        'Las anomalías se calculan como el promedio mensual menos la climatología de ese mes.',
        'Se comparan las anomalías por fase: El Niño, La Niña y neutro.',
        'Se compara el error con y sin ENSO: solo se usa si mejora la proyección.',
      ],
    },
  },
  {
    id: 'confianza',
    titulo: '¿Qué tan confiable es?',
    Icono: ShieldCheck,
    color: '#059669',
    sencillo: {
      texto:
        'Cada resultado te dice cuánto suele equivocarse el método, en las mismas unidades que la variable. Mientras más lejos en el futuro, más incierta es la estimación. Para decisiones importantes consulta siempre al SENAMHI.',
      ejemplo:
        'Un error medio de 1.2 °C quiere decir que, si se proyectan 20 °C, lo real normalmente estará entre unos 19 y 21 °C.',
    },
    tecnico: {
      texto:
        'Las métricas se calculan sobre datos no vistos, lo que evita el sobreajuste aparente. Las proyecciones estadísticas no modelan la dinámica atmosférica, por eso las alertas de eventos extremos se basan en el pronóstico numérico de Open-Meteo.',
      puntos: [
        'MAE: error absoluto medio, fácil de interpretar en la unidad de la variable.',
        'RMSE: penaliza más los errores grandes; es el criterio de selección.',
        'El horizonte recomendado es corto, porque el error crece con la recursión.',
      ],
    },
  },
]

export default function ExplicacionDoble() {
  const [nivel, setNivel] = useState<Nivel>('sencillo')
  const [temaId, setTemaId] = useState(TEMAS[0].id)
  const tema = TEMAS.find((t) => t.id === temaId) ?? TEMAS[0]

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
      {/* Selector de nivel */}
      <div className="flex flex-col items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row">
        <p className="text-sm text-slate-600">¿Cómo prefieres que te lo expliquemos?</p>
        <div role="tablist" aria-label="Nivel de explicación" className="flex rounded-full bg-slate-200/70 p-1">
          {(
            [
              ['sencillo', 'Sencillo', BookOpen],
              ['tecnico', 'Técnico', GraduationCap],
            ] as const
          ).map(([valor, etiqueta, Icono]) => (
            <button
              key={valor}
              role="tab"
              aria-selected={nivel === valor}
              onClick={() => setNivel(valor)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                nivel === valor ? 'bg-white text-brand-700 shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icono size={15} /> {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-[260px_1fr]">
        {/* Temas */}
        <div className="flex gap-2 overflow-x-auto border-b border-slate-100 p-3 md:flex-col md:border-b-0 md:border-r">
          {TEMAS.map((t) => {
            const activo = t.id === tema.id
            return (
              <button
                key={t.id}
                onClick={() => setTemaId(t.id)}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  activo ? 'bg-brand-50 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${t.color}1a`, color: t.color }}
                >
                  <t.Icono size={17} />
                </span>
                {t.titulo}
              </button>
            )
          })}
        </div>

        {/* Contenido */}
        <div key={`${tema.id}-${nivel}`} className="animate-aparecer p-6 sm:p-8">
          <span
            className="badge mb-3"
            style={{ backgroundColor: nivel === 'sencillo' ? '#ecfdf5' : '#eef2ff', color: nivel === 'sencillo' ? '#047857' : '#4338ca' }}
          >
            {nivel === 'sencillo' ? 'Para todos' : 'Para conocedores del tema'}
          </span>
          <h3 className="text-2xl font-semibold text-slate-900">{tema.titulo}</h3>

          {nivel === 'sencillo' ? (
            <>
              <p className="mt-4 text-base leading-relaxed text-slate-600">{tema.sencillo.texto}</p>
              <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                <Sparkles size={18} className="mt-0.5 shrink-0" />
                <p>
                  <span className="font-semibold">Ejemplo: </span>
                  {tema.sencillo.ejemplo}
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-base leading-relaxed text-slate-600">{tema.tecnico.texto}</p>
              <ul className="mt-6 space-y-2.5">
                {tema.tecnico.puntos.map((p) => (
                  <li key={p} className="flex gap-3 text-sm text-slate-700">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tema.color }} />
                    {p}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}