'use client'

import { useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type PuntoDiario = { fecha: string; media: number; min: number; max: number }
export type SerieDiaria = {
  key: string
  label: string
  unidad: string
  color: string
  datos: PuntoDiario[]
}

type Fila = PuntoDiario & { rango: [number, number]; etiqueta: string }

function etiqueta(fechaIso: string) {
  const [, m, d] = fechaIso.split('-')
  return `${Number(d)}/${Number(m)}`
}

function Detalle({
  active,
  payload,
  unidad,
}: {
  active?: boolean
  payload?: { payload: Fila }[]
  unidad: string
}) {
  if (!active || !payload?.length) return null
  const f = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-slate-900">{etiqueta(f.fecha)}</p>
      <p className="tabular-nums text-slate-700">
        Promedio: <strong>{f.media.toFixed(1)}{unidad}</strong>
      </p>
      <p className="tabular-nums text-slate-500">
        Mín {f.min.toFixed(1)}{unidad} · Máx {f.max.toFixed(1)}{unidad}
      </p>
    </div>
  )
}

// Serie diaria (promedio + rango mín–máx) con pestañas por variable.
export default function DailyChart({ series }: { series: SerieDiaria[] }) {
  const [activa, setActiva] = useState(series[0]?.key)
  const serie = series.find((s) => s.key === activa) ?? series[0]
  if (!serie) return null

  const datos: Fila[] = serie.datos.map((p) => ({ ...p, rango: [p.min, p.max], etiqueta: etiqueta(p.fecha) }))
  const medias = serie.datos.map((p) => p.media)
  const promedio = medias.length ? medias.reduce((a, b) => a + b, 0) / medias.length : null
  const minimo = serie.datos.length ? Math.min(...serie.datos.map((p) => p.min)) : null
  const maximo = serie.datos.length ? Math.max(...serie.datos.map((p) => p.max)) : null

  return (
    <div>
      <div role="tablist" aria-label="Variable del gráfico" className="mb-4 inline-flex rounded-lg bg-slate-100 p-1">
        {series.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={s.key === serie.key}
            onClick={() => setActiva(s.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              s.key === serie.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div role="img" aria-label={`Gráfico de ${serie.label} de los últimos días registrados`}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={datos} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
            <YAxis
              tick={{ fontSize: 11, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
              domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
            />
            <Tooltip content={<Detalle unidad={serie.unidad} />} />
            <Area dataKey="rango" stroke="none" fill={serie.color} fillOpacity={0.16} isAnimationActive={false} />
            <Line
              dataKey="media"
              stroke={serie.color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: serie.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 text-center">
        {[
          ['Promedio', promedio],
          ['Mínimo', minimo],
          ['Máximo', maximo],
        ].map(([nombre, valor]) => (
          <div key={nombre as string} className="px-2 py-2.5">
            <dt className="text-xs text-slate-500">{nombre as string}</dt>
            <dd className="text-base font-semibold tabular-nums text-slate-900">
              {valor === null ? '—' : `${(valor as number).toFixed(1)}${serie.unidad}`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
