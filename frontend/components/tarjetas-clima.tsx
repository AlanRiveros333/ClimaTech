'use client'

// Tarjetas de clima compartidas por el asistente y por los apartados independientes
// (Proyección, Estación del aeropuerto y Reportes). Así ambos muestran exactamente lo mismo.
import { useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { ChevronDown, CloudRain, Snowflake, Sun, Trash2, Wind } from 'lucide-react'
import { IconoCielo, IconoVariable, TEXTO_CIELO, categoriaCielo, colorVariable, type Cielo } from '@/components/clima-visuales'

export type Punto = { fecha: string; valor: number }
export type DiaOM = { valor: number | null; tmax: number | null; tmin: number | null; codigo: number | null; lluvia_mm: number | null; prob_lluvia: number | null }
export type DiaProy = {
  fecha: string
  dia: string
  valor: number
  descriptor: string
  max_est: number | null
  min_est: number | null
  om?: DiaOM | null
  acuerdo?: {
    modelos: number
    minimo: number
    maximo: number
    dispersion: number
    confianza: 'alta' | 'media' | 'baja'
    valores: Record<string, number>
  } | null
}
export type DiaPron = {
  fecha: string
  lluvia_mm: number | null
  prob_lluvia: number | null
  tmax: number | null
  tmin: number | null
  rafaga: number | null
  codigo?: number | null
}
export type AlertaPron = { tipo: string; titulo: string; nivel: 'alto' | 'medio'; fecha: string; mensaje: string }
export type TarjetaProyeccion = {
  tipo: 'proyeccion'
  variable: string
  unidad: string
  metodo: string
  resumen: { promedio: number; minimo: number; maximo: number; reciente: number; descriptor: string }
  habitual: { valor: number; mes: string; diferencia: number } | null
  anomalia_reciente: { mes: string; anomalia: number; fase: string } | null
  dias: DiaProy[]
  rango_estimado: boolean
  enso: { usado: boolean; evento_actual: string | null }
  pronostico: { ok: boolean; dias: DiaPron[]; alertas: AlertaPron[] }
  historico: Punto[]
  proyeccion: Punto[]
  openmeteo?: {
    ok: boolean
    dias: number
    promedio: number | null
    tmax_min: number | null
    tmax_max: number | null
    dif_elegido: number | null
    cercano: string | null
  }
  criterio?: 'pedido' | 'openmeteo' | 'error' | 'mos'
  hibrido?: {
    modelo: string
    mae: number
    mae_openmeteo: number
    mejora_pct: number
    fechas: number
    dias_hibrido: number
    relleno: string | null
    pesos?: { metodo: string; nombre: string; peso: number }[] | null
    modelos?: string[]
    impacto_modelos?: ImpactoModelos | null
  } | null
  correccion?: { metodo: string; mejora_pct: number; sesgo_mes: number | null; mes: string; dias_pares: number } | null
  prueba: { fecha: string; real: number; predicho: number }[]
  justificacion: string
  metodos: {
    nombre: string
    mae: number
    rmse: number
    elegido: boolean
    mejor: boolean
    dif_openmeteo?: number | null
    cercano?: boolean
  }[]
}
export type TarjetaEventos = {
  tipo: 'eventos'
  evento_actual: string | null
  puede_editar: boolean
  eventos: { id: string; nombre: string; fase: string; intensidad: string; fecha_inicio: string; fecha_fin: string | null }[]
}
export type TarjetaAnomalias = {
  tipo: 'anomalias'
  variable: string
  unidad: string
  por_fase: { fase: string; etiqueta: string; meses: number; anomalia_media: number | null }[]
  mensual: { mes: string; anomalia: number | null; fase: string }[]
}
export type ImpactoModelos = {
  un_modelo: { nombre: string; mae: number }
  varios_modelos: { nombre: string; mae: number }
  mejora_pct: number
}
export const ESTILO_CONFIANZA: Record<string, string> = {
  alta: 'bg-emerald-50 text-emerald-700',
  media: 'bg-amber-50 text-amber-700',
  baja: 'bg-red-50 text-red-700',
}
export type OpcionCorreccion = { metodo: string; nombre: string; mae: number; rmse: number; sesgo: number }
export type TarjetaEstacion = {
  tipo: 'estacion'
  variable: string
  unidad: string
  nombre_estacion: string
  dias_pares: number
  desde: string
  hasta: string
  dias_prueba: number
  prueba_desde: string
  opciones: OpcionCorreccion[]
  elegido: string
  mejora_pct: number
  mensual: { mes: number; dias: number; open_meteo: number; estacion: number; corregido: number; sesgo: number }[]
  verificacion: { metodo: string; corregida: boolean; dias: number; proyecciones: number; mae: number; sesgo: number }[]
  mos: {
    fechas: number
    fechas_entrenamiento: number
    fechas_validacion: number
    fechas_prueba: number
    prueba_desde: string
    pesos: { metodo: string; nombre: string; peso: number }[]
    modelos?: { id: string; nombre: string }[]
    descartados?: string[]
    impacto_modelos?: ImpactoModelos | null
    elegido: string
    mejora_pct: number
    opciones: (OpcionCorreccion & { por_anticipacion: Record<string, number> })[]
  } | null
}

export type TarjetaReportes = {
  tipo: 'reportes'
  filas: { id: string; tipo?: string; periodo_inicio: string; periodo_fin: string; archivo_url: string; created_at: string }[]
}

export const COLOR_FASE = { el_nino: '#d97706', la_nina: '#1d4ed8', neutro: '#94a3b8' }
export const FASE: Record<string, string> = { el_nino: 'El Niño', la_nina: 'La Niña' }
export const INTENSIDAD: Record<string, string> = { debil: 'Débil', moderado: 'Moderado', fuerte: 'Fuerte', muy_fuerte: 'Muy fuerte' }

export const BOTON_PRIMARIO =
  'rounded-lg bg-gradient-to-r from-[#0B4F6C] to-[#0E7C9B] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50'

// ------------------------------------------------------------- tarjetas
export const NOMBRE_VARIABLE: Record<string, string> = { temperatura: 'Temperatura', humedad: 'Humedad', velocidad_viento: 'Viento' }

export function IconoAlerta({ tipo }: { tipo: string }) {
  if (tipo === 'lluvia') return <CloudRain size={18} />
  if (tipo === 'helada') return <Snowflake size={18} />
  if (tipo === 'calor') return <Sun size={18} />
  return <Wind size={18} />
}

// Cielo del pronóstico de Open-Meteo. Con el código WMO se dibuja el cielo real (sol, nubes, lluvia, tormenta);
// sin código (respuesta antigua) se deduce de la lluvia y la temperatura.
export function cieloDeDia(d: { codigo?: number | null; lluvia_mm: number | null; prob_lluvia: number | null }): Cielo {
  const c = categoriaCielo(d.codigo, d.prob_lluvia, d.lluvia_mm)
  if (c) return c
  if ((d.lluvia_mm ?? 0) >= 1 || (d.prob_lluvia ?? 0) >= 60) return 'lluvia'
  if ((d.prob_lluvia ?? 0) >= 20) return 'parcial'
  return 'despejado'
}

// El cielo que más se repite en el período (para el ícono grande del resumen).
export function cieloPredominante(dias: DiaProy[]): Cielo | null {
  const conteo = new Map<Cielo, number>()
  for (const d of dias) {
    if (!d.om || d.om.codigo === null) continue
    const c = cieloDeDia(d.om)
    conteo.set(c, (conteo.get(c) ?? 0) + 1)
  }
  let mejor: Cielo | null = null
  for (const [c, n] of conteo) if (mejor === null || n > (conteo.get(mejor) ?? 0)) mejor = c
  return mejor
}

export function CardProyeccion({ t, onEnviarAlerta }: { t: TarjetaProyeccion; onEnviarAlerta?: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [detalle, setDetalle] = useState(false)
  const u = t.unidad
  const r = t.resumen
  const esTemp = t.variable === 'temperatura'
  const dif = r.promedio - r.reciente
  const signo = (x: number) => (x >= 0 ? '+' : '')
  const predominante = cieloPredominante(t.dias)
  const om = t.openmeteo
  const omPorFecha = new Map<string, number | undefined>(t.dias.map((d) => [d.fecha.slice(5), d.om?.valor ?? undefined]))
  const datos = [
    ...t.historico.map((p, i) => ({
      fecha: p.fecha.slice(5),
      historico: p.valor as number | undefined,
      proyeccion: (i === t.historico.length - 1 ? p.valor : undefined) as number | undefined,
    })),
    ...t.proyeccion.map((p) => ({
      fecha: p.fecha.slice(5),
      historico: undefined as number | undefined,
      proyeccion: p.valor as number | undefined,
      openmeteo: omPorFecha.get(p.fecha.slice(5)) as number | undefined,
    })),
  ]
  return (
    <div className="mt-3 space-y-3">
      {/* Resumen principal, al estilo de las páginas de clima */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B4F6C] via-[#0E7C9B] to-[#01BAEF] p-5 text-white shadow">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-white/80">
              Cochabamba · {NOMBRE_VARIABLE[t.variable] ?? t.variable} · próximos {t.dias.length} día(s)
            </p>
            <p className="mt-1 text-5xl font-semibold">
              {r.promedio.toFixed(1)}
              <span className="text-xl font-normal text-white/80"> {u}</span>
            </p>
            <span className="mt-2 inline-block rounded-full bg-white/20 px-3 py-0.5 text-sm font-medium">{r.descriptor}</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl bg-white/95 p-3">
            {predominante ? (
              <>
                <IconoCielo cielo={predominante} alto={92} />
                <span className="mt-0.5 text-[11px] font-medium text-slate-600">{TEXTO_CIELO[predominante]}</span>
              </>
            ) : (
              <IconoVariable variable={t.variable} valor={r.promedio} alto={88} />
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-white/75">
          {esTemp ? 'Temperatura promedio del día (24 horas), no la máxima. ' : ''}Método: {t.metodo}
          {t.criterio === 'openmeteo' ? ', el más cercano al pronóstico de Open-Meteo' : ''}
          {t.criterio === 'mos' ? ' (pronóstico de Open-Meteo corregido con IA y la estación del aeropuerto)' : ''}
        </p>
        {t.hibrido && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-violet-500/90 px-3 py-2 text-[11px] text-white">
            <span className="font-semibold">🧠 Modelo híbrido: Open-Meteo + IA</span>
            <span>
              Error en la prueba: <b>{t.hibrido.mae.toFixed(1)} {u}</b> (Open-Meteo solo: {t.hibrido.mae_openmeteo.toFixed(1)} {u}
              {t.hibrido.mejora_pct > 0 ? `, ${t.hibrido.mejora_pct.toFixed(0)} % menos` : ''})
            </span>
            {t.hibrido.modelos && t.hibrido.modelos.length > 1 && (
              <span className="text-white/90">
                {t.hibrido.modelos.length} modelos: {t.hibrido.modelos.map((m) => m.split(' (')[0]).join(', ')}
              </span>
            )}
            {t.hibrido.pesos && (
              <span className="text-white/90">
                Combina:{' '}
                {t.hibrido.pesos
                  .filter((p) => p.peso >= 0.01)
                  .map((p) => `${p.nombre.replace('Open-Meteo + ', '').replace(' (IA)', '')} ${(p.peso * 100).toFixed(0)} %`)
                  .join(' · ')}
              </span>
            )}
            {t.hibrido.relleno && (
              <span className="text-white/85">
                Días {t.hibrido.dias_hibrido + 1} en adelante: {t.hibrido.relleno}
              </span>
            )}
          </div>
        )}
        {t.correccion && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/90 px-3 py-1 text-[11px] font-medium text-emerald-950">
            ✓ Corregido con la estación del aeropuerto
            {t.correccion.sesgo_mes !== null &&
              ` (${t.correccion.mes}: ${t.correccion.sesgo_mes >= 0 ? '+' : ''}${t.correccion.sesgo_mes.toFixed(1)} ${u})`}
          </p>
        )}
        {om?.ok && om.promedio !== null && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white/95 px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">Open-Meteo (modelo meteorológico)</span>
            <span>
              Promedio: <b>{om.promedio.toFixed(1)} {u}</b>
            </span>
            {esTemp && om.tmax_min !== null && om.tmax_max !== null && (
              <span>
                Máximas: <b>{om.tmax_min.toFixed(0)}–{om.tmax_max.toFixed(0)} °C</b>
              </span>
            )}
            {om.dif_elegido !== null && (
              <span>
                Diferencia con nuestra proyección: <b>{om.dif_elegido.toFixed(1)} {u}</b>
              </span>
            )}
          </div>
        )}
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-white/15 p-2">
            Rango proyectado: {r.minimo.toFixed(1)} – {r.maximo.toFixed(1)} {u}
          </div>
          <div className="rounded-lg bg-white/15 p-2">
            Última semana: {r.reciente.toFixed(1)} {u} ({signo(dif)}
            {dif.toFixed(1)})
          </div>
          {t.habitual && (
            <div className="rounded-lg bg-white/15 p-2">
              Habitual en {t.habitual.mes}: {t.habitual.valor.toFixed(1)} {u} ({signo(t.habitual.diferencia)}
              {t.habitual.diferencia.toFixed(1)})
            </div>
          )}
        </div>
        {(t.enso.evento_actual || t.anomalia_reciente) && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {t.enso.evento_actual && (
              <span className="rounded-full bg-amber-400/90 px-3 py-1 font-medium text-amber-950">
                {t.enso.evento_actual} · {t.enso.usado ? 'considerado en el cálculo' : 'no mejoró la proyección'}
              </span>
            )}
            {t.anomalia_reciente && (
              <span className="rounded-full bg-white/20 px-3 py-1">
                Último mes completo ({t.anomalia_reciente.mes}): {signo(t.anomalia_reciente.anomalia)}
                {t.anomalia_reciente.anomalia.toFixed(1)} {u} vs lo habitual
              </span>
            )}
          </div>
        )}
      </div>

      {/* Día por día */}
      <div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {t.dias.map((d) => {
            const cielo = d.om && d.om.codigo !== null ? cieloDeDia(d.om) : null
            return (
              <div key={d.fecha} className="flex min-w-[100px] flex-col items-center rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                <span className="text-xs font-semibold uppercase text-slate-500">{d.dia}</span>
                <span className="text-[11px] text-slate-400">
                  {d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}
                </span>
                <div className="my-1 flex h-[60px] items-center">
                  {cielo ? <IconoCielo cielo={cielo} alto={60} /> : <IconoVariable variable={t.variable} valor={d.valor} alto={52} />}
                </div>
                {cielo && <span className="mb-1 flex min-h-[26px] items-center text-[10px] leading-tight text-slate-500">{TEXTO_CIELO[cielo]}</span>}
                <span className="text-lg font-semibold text-slate-900">
                  {d.valor.toFixed(1)}
                  {esTemp ? '°' : ''}
                </span>
                <span className="text-[11px] font-medium" style={{ color: colorVariable(t.variable, d.valor) }}>
                  {d.descriptor}
                </span>
                {esTemp && d.om && d.om.tmax !== null && d.om.tmin !== null ? (
                  <span className="mt-1 text-[11px] text-slate-500" title="Máxima y mínima según Open-Meteo">
                    <span className="text-red-500">↑{d.om.tmax.toFixed(0)}°</span> <span className="text-blue-500">↓{d.om.tmin.toFixed(0)}°</span>
                  </span>
                ) : (
                  d.max_est !== null &&
                  d.min_est !== null && (
                    <span className="mt-1 text-[11px] text-slate-500">
                      ↑{d.max_est.toFixed(0)}° ↓{d.min_est.toFixed(0)}°
                    </span>
                  )
                )}
                {d.acuerdo && (
                  <span
                    className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTILO_CONFIANZA[d.acuerdo.confianza]}`}
                    title={`Promedio del día según ${d.acuerdo.modelos} modelos:\n${Object.entries(d.acuerdo.valores)
                      .map(([m, v]) => `${m}: ${v}`)
                      .join('\n')}`}
                  >
                    Confianza {d.acuerdo.confianza}
                  </span>
                )}
                {d.om && d.om.prob_lluvia !== null && d.om.prob_lluvia >= 20 && (
                  <span className={`text-[10px] ${d.om.prob_lluvia >= 60 ? 'font-semibold text-blue-600' : 'text-slate-400'}`}>💧 {d.om.prob_lluvia.toFixed(0)}%</span>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {t.dias.some((d) => d.om)
            ? `El número grande es la proyección de ClimaTech${esTemp ? ' (promedio del día)' : ''}. El cielo${esTemp ? ', las máximas (↑) y mínimas (↓)' : ''} y la lluvia vienen del pronóstico de Open-Meteo.` +
              (t.dias.some((d) => d.acuerdo)
                ? ' La confianza indica cuánto coinciden los modelos meteorológicos (pasa el mouse para ver cada uno).'
                : '')
            : t.rango_estimado
              ? 'Máx/mín estimados con la amplitud diaria de los últimos 90 días.'
              : ''}
        </p>
      </div>

      {/* Alertas probables y pronóstico del cielo (Open-Meteo) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold text-slate-500">Próximos días según Open-Meteo (modelo meteorológico externo)</p>
        {!t.pronostico.ok ? (
          <p className="text-xs text-slate-400">No se pudo consultar el pronóstico (¿sin conexión a internet?).</p>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {t.pronostico.dias.map((d) => (
                <div key={d.fecha} className="flex min-w-[110px] flex-col items-center rounded-xl border border-slate-100 bg-slate-50 p-2 text-center text-[11px] text-slate-600">
                  <span className="font-medium text-slate-800">
                    {d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}
                  </span>
                  <IconoCielo cielo={cieloDeDia(d)} alto={44} />
                  <span>
                    {d.lluvia_mm === null ? '—' : d.lluvia_mm.toFixed(1)} mm ({d.prob_lluvia === null ? '—' : d.prob_lluvia.toFixed(0)}%)
                  </span>
                  <span>
                    {d.tmax === null ? '—' : d.tmax.toFixed(0)}° / {d.tmin === null ? '—' : d.tmin.toFixed(0)}°
                  </span>
                </div>
              ))}
            </div>
            {t.pronostico.alertas.length === 0 ? (
              <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">Sin alertas probables en los próximos días.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {t.pronostico.alertas.map((a) => (
                  <p
                    key={`${a.tipo}-${a.fecha}`}
                    className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
                      a.nivel === 'alto' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    <IconoAlerta tipo={a.tipo} />
                    <span>
                      <b>
                        {a.fecha.slice(8, 10)}/{a.fecha.slice(5, 7)} · {a.titulo}.
                      </b>{' '}
                      {a.mensaje}
                    </span>
                  </p>
                ))}
                {onEnviarAlerta && (
                  <button onClick={onEnviarAlerta} className={BOTON_PRIMARIO}>
                    Enviarme esta alerta por correo
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Cómo se calculó */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
      >
        ¿Cómo lo calculé? (método, error y fenómenos)
        <ChevronDown size={16} className={abierto ? 'rotate-180 transition' : 'transition'} />
      </button>
      {abierto && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{t.justificacion}</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={datos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} unit={` ${u}`} width={64} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="historico" name="Histórico" stroke="#0f172a" dot={false} connectNulls />
              <Line type="monotone" dataKey="proyeccion" name={`Proyección (${t.metodo})`} stroke="#d97706" strokeDasharray="5 5" dot connectNulls />
              {om?.ok && <Line type="monotone" dataKey="openmeteo" name="Open-Meteo" stroke="#0ea5e9" strokeWidth={2} dot connectNulls />}
            </LineChart>
          </ResponsiveContainer>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-1 pr-3">Método</th>
                <th className="py-1 pr-3">MAE ({u})</th>
                <th className="py-1 pr-3">RMSE ({u})</th>
                {om?.ok && <th className="py-1 pr-3">Dif. con Open-Meteo ({u})</th>}
              </tr>
            </thead>
            <tbody>
              {t.metodos.map((m) => (
                <tr key={m.nombre} className={`border-b border-slate-100 ${m.elegido ? 'bg-emerald-50 font-medium' : ''} text-slate-700`}>
                  <td className="py-1 pr-3">
                    {m.nombre}
                    {m.elegido && <span className="ml-1 text-emerald-700">★ usado</span>}
                    {m.mejor && <span className="ml-1 text-slate-400">(menor error en la prueba)</span>}
                    {m.cercano && <span className="ml-1 text-sky-600">(más cercano a Open-Meteo)</span>}
                  </td>
                  <td className="py-1 pr-3">{m.mae}</td>
                  <td className="py-1 pr-3">{m.rmse}</td>
                  {om?.ok && <td className="py-1 pr-3">{m.dif_openmeteo === null || m.dif_openmeteo === undefined ? '—' : m.dif_openmeteo.toFixed(2)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => setDetalle((v) => !v)} className="text-xs font-medium text-[#0E7C9B] underline">
            {detalle ? 'Ocultar la prueba real vs. predicho' : 'Ver la prueba real vs. predicho'}
          </button>
          {detalle && (
            <div>
              <p className="mb-2 text-xs text-slate-500">Lo que {t.metodo} predijo para los últimos días, que no vio al entrenar.</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={t.prueba.map((p) => ({ fecha: p.fecha.slice(5), real: p.real, predicho: p.predicho }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={64} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="real" name="Real" stroke="#0f172a" strokeWidth={2} />
                  <Line type="monotone" dataKey="predicho" name="Predicho" stroke="#7c3aed" strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CardEventos({ t, onEliminar }: { t: TarjetaEventos; onEliminar?: (id: string) => void }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
      {t.evento_actual && (
        <div className="mb-3 rounded-xl bg-gradient-to-r from-[#0B4F6C] to-[#d97706] p-3 text-white">
          <p className="text-[11px] uppercase tracking-wide text-white/80">Evento en curso</p>
          <p className="text-sm font-semibold">{t.evento_actual}</p>
        </div>
      )}
      <table className="w-full text-left">
        <tbody>
          {t.eventos.map((e) => (
            <tr key={e.id} className="border-b border-slate-100 text-slate-700">
              <td className="py-1 pr-3">{e.nombre}</td>
              <td className="py-1 pr-3">
                {FASE[e.fase] ?? e.fase} · {INTENSIDAD[e.intensidad] ?? e.intensidad}
              </td>
              <td className="py-1 pr-3">
                {e.fecha_inicio} – {e.fecha_fin ?? 'en curso'}
              </td>
              {t.puede_editar && onEliminar && (
                <td className="py-1">
                  <button onClick={() => onEliminar(e.id)} aria-label="Eliminar evento" className="text-slate-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CardAnomalias({ t }: { t: TarjetaAnomalias }) {
  const datos = t.mensual.map((m) => ({
    mes: m.mes,
    el_nino: m.fase === 'el_nino' ? m.anomalia : null,
    la_nina: m.fase === 'la_nina' ? m.anomalia : null,
    neutro: m.fase === 'neutro' ? m.anomalia : null,
  }))
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={datos}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit={` ${t.unidad}`} width={60} />
          <Tooltip />
          <Legend />
          <ReferenceLine y={0} stroke="#64748b" />
          <Bar dataKey="el_nino" name="El Niño" stackId="a" fill={COLOR_FASE.el_nino} />
          <Bar dataKey="la_nina" name="La Niña" stackId="a" fill={COLOR_FASE.la_nina} />
          <Bar dataKey="neutro" name="Neutro" stackId="a" fill={COLOR_FASE.neutro} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export const MES_CORTO = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const NOMBRE_METODO_PROY: Record<string, string> = {
  persistencia: 'Referencia (último valor)',
  promedio_movil: 'Promedio móvil',
  holt: 'Holt',
  regresion_lineal: 'Regresión lineal',
  random_forest: 'Random Forest',
  gradient_boosting: 'Gradient Boosting',
  hibrido_mos: 'Híbrido Open-Meteo + IA',
}

export function SeccionHibrido({ m, u }: { m: NonNullable<TarjetaEstacion['mos']>; u: string }) {
  const crudo = m.opciones.find((o) => o.metodo === 'openmeteo_crudo')
  const elegida = m.opciones.find((o) => o.metodo === m.elegido) ?? m.opciones[0]
  const datos = [1, 2, 3, 4, 5, 6, 7].map((k) => ({
    k: `${k} día${k > 1 ? 's' : ''}`,
    'Open-Meteo sin corregir': crudo?.por_anticipacion[String(k)],
    [elegida.nombre]: elegida.por_anticipacion[String(k)],
  }))
  return (
    <div className="rounded-xl border border-violet-200 bg-white p-4">
      <p className="text-xs font-semibold text-violet-700">🧠 Modelo híbrido: pronóstico de Open-Meteo corregido con IA</p>
      <p className="mt-1 text-xs text-slate-500">
        {m.fechas} fechas de pronósticos pasados (1 a 7 días de anticipación) comparados con lo medido, en tres tramos: {m.fechas_entrenamiento} para
        aprender, {m.fechas_validacion} para calcular cómo combinar los modelos y {m.fechas_prueba} para calificar (no vistas antes).
      </p>
      {m.modelos && m.modelos.length > 1 && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-medium">Modelos meteorológicos usados ({m.modelos.length}):</span> {m.modelos.map((x) => x.nombre).join(' · ')}
          {m.descartados && m.descartados.length > 0 && (
            <span className="text-slate-400"> — descartados por pocos datos: {m.descartados.join(', ')}</span>
          )}
        </p>
      )}
      {m.impacto_modelos && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">
          <span className="font-semibold">Impacto de usar varios modelos</span>
          <span>
            Un modelo: <b>{m.impacto_modelos.un_modelo.mae.toFixed(2)} {u}</b>
          </span>
          <span>
            Varios modelos: <b>{m.impacto_modelos.varios_modelos.mae.toFixed(2)} {u}</b>
          </span>
          <span className={m.impacto_modelos.mejora_pct > 0 ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
            {m.impacto_modelos.mejora_pct > 0 ? `${m.impacto_modelos.mejora_pct.toFixed(0)} % menos error` : 'no mejoró'}
          </span>
        </div>
      )}
      {crudo && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">Open-Meteo solo</p>
            <p className="text-xl font-semibold text-slate-700">
              {crudo.mae.toFixed(2)} <span className="text-xs font-normal">{u}</span>
            </p>
          </div>
          <div className="rounded-lg bg-violet-50 p-2">
            <p className="text-[11px] text-violet-700">Con corrección</p>
            <p className="text-xl font-semibold text-violet-700">
              {elegida.mae.toFixed(2)} <span className="text-xs font-normal">{u}</span>
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">Mejora</p>
            <p className="text-xl font-semibold text-slate-700">{m.elegido === 'openmeteo_crudo' ? '—' : `${m.mejora_pct.toFixed(0)} %`}</p>
          </div>
        </div>
      )}
      <div className="mt-4">
        <p className="text-xs text-slate-500">
          {m.elegido === 'ensamble' ? 'Peso de cada modelo en la combinación (usada)' : 'Peso que tendría cada modelo en la combinación (no se usa: un modelo solo fue mejor)'}
        </p>
        <div className="mt-1.5 space-y-1">
          {m.pesos.map((p) => (
            <div key={p.metodo} className="flex items-center gap-2 text-[11px] text-slate-600">
              <span className="w-56 shrink-0 truncate">{p.nombre}</span>
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${m.elegido === 'ensamble' ? 'bg-violet-500' : 'bg-slate-300'}`} style={{ width: `${p.peso * 100}%` }} />
              </div>
              <span className="w-10 text-right">{(p.peso * 100).toFixed(0)} %</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Pesos por mínimos cuadrados no negativos: pesa más el modelo que mejor acertó en el período reciente.</p>
      </div>
      <p className="mb-1 mt-4 text-xs text-slate-500">Error medio según cuántos días antes se pronosticó ({u})</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={datos}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="k" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} unit={` ${u}`} width={60} domain={[0, 'auto']} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Open-Meteo sin corregir" stroke="#94a3b8" strokeWidth={2} dot />
          {m.elegido !== 'openmeteo_crudo' && <Line type="monotone" dataKey={elegida.nombre} stroke="#7c3aed" strokeWidth={2} dot />}
        </LineChart>
      </ResponsiveContainer>
      <table className="mt-3 w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-3">Opción</th>
            <th className="py-1 pr-3">MAE ({u})</th>
            <th className="py-1 pr-3">RMSE ({u})</th>
            <th className="py-1 pr-3">Sesgo ({u})</th>
          </tr>
        </thead>
        <tbody>
          {m.opciones.map((o) => (
            <tr key={o.metodo} className={`border-b border-slate-100 text-slate-700 ${o.metodo === m.elegido ? 'bg-violet-50 font-medium' : ''}`}>
              <td className="py-1 pr-3">
                {o.nombre}
                {o.metodo === m.elegido && <span className="ml-1 text-violet-700">★ usada</span>}
              </td>
              <td className="py-1 pr-3">{o.mae.toFixed(2)}</td>
              <td className="py-1 pr-3">{o.rmse.toFixed(2)}</td>
              <td className="py-1 pr-3">
                {o.sesgo >= 0 ? '+' : ''}
                {o.sesgo.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CardEstacion({ t }: { t: TarjetaEstacion }) {
  const u = t.unidad
  const base = t.opciones.find((o) => o.metodo === 'sin_correccion')
  const elegida = t.opciones.find((o) => o.metodo === t.elegido) ?? t.opciones[0]
  const corrige = t.elegido !== 'sin_correccion'
  const datos = t.mensual.map((m) => ({ mes: MES_CORTO[m.mes], 'Open-Meteo': m.open_meteo, Estación: m.estacion, Corregido: m.corregido }))
  const f = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`
  return (
    <div className="mt-3 space-y-3">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#064e3b] via-[#047857] to-[#10b981] p-5 text-white shadow">
        <p className="text-xs text-white/80">
          {NOMBRE_VARIABLE[t.variable] ?? t.variable} · {t.nombre_estacion} · {t.dias_pares} días comparados ({f(t.desde)} – {f(t.hasta)})
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/15 p-3">
            <p className="text-[11px] text-white/80">Error de Open-Meteo sin corregir</p>
            <p className="text-3xl font-semibold">
              {base?.mae.toFixed(2)}
              <span className="text-base font-normal"> {u}</span>
            </p>
            {base && (
              <p className="text-[11px] text-white/80">
                Marca en general {Math.abs(base.sesgo).toFixed(1)} {u} {base.sesgo > 0 ? 'menos' : 'más'} que la estación
              </p>
            )}
          </div>
          <div className="rounded-xl bg-white p-3 text-slate-800">
            <p className="text-[11px] text-slate-500">Error con la corrección</p>
            <p className="text-3xl font-semibold text-emerald-700">
              {elegida.mae.toFixed(2)}
              <span className="text-base font-normal"> {u}</span>
            </p>
            <p className="text-[11px] text-slate-500">{corrige ? elegida.nombre : 'Ninguna corrección mejoró'}</p>
          </div>
          <div className="flex flex-col justify-center rounded-xl bg-white/15 p-3">
            <p className="text-[11px] text-white/80">Mejora</p>
            <p className="text-3xl font-semibold">{corrige ? `${t.mejora_pct.toFixed(0)} %` : '—'}</p>
            <p className="text-[11px] text-white/80">menos error</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-white/80">
          El error se midió en los últimos {t.dias_prueba} días (desde el {f(t.prueba_desde)}), que no se usaron para calcular la corrección.
          {corrige ? ' Las proyecciones ya usan el historial corregido.' : ''}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold text-slate-500">Promedio de cada mes: Open-Meteo vs. lo medido en la estación</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={datos}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit={` ${u}`} width={60} domain={['auto', 'auto']} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Open-Meteo" fill="#94a3b8" />
            <Bar dataKey="Estación" fill="#0f172a" />
            {corrige && <Bar dataKey="Corregido" fill="#10b981" />}
          </BarChart>
        </ResponsiveContainer>
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-1 pr-3">Opción</th>
              <th className="py-1 pr-3">MAE ({u})</th>
              <th className="py-1 pr-3">RMSE ({u})</th>
              <th className="py-1 pr-3">Sesgo ({u})</th>
            </tr>
          </thead>
          <tbody>
            {t.opciones.map((o) => (
              <tr key={o.metodo} className={`border-b border-slate-100 text-slate-700 ${o.metodo === t.elegido ? 'bg-emerald-50 font-medium' : ''}`}>
                <td className="py-1 pr-3">
                  {o.nombre}
                  {o.metodo === t.elegido && <span className="ml-1 text-emerald-700">★ usada</span>}
                </td>
                <td className="py-1 pr-3">{o.mae.toFixed(2)}</td>
                <td className="py-1 pr-3">{o.rmse.toFixed(2)}</td>
                <td className="py-1 pr-3">
                  {o.sesgo >= 0 ? '+' : ''}
                  {o.sesgo.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-slate-400">Sesgo positivo: la estación midió más de lo estimado.</p>
      </div>

      {t.mos && <SeccionHibrido m={t.mos} u={u} />}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-xs font-semibold text-slate-500">¿Qué tan acertadas fueron las proyecciones guardadas? (contra lo medido)</p>
        {t.verificacion.length === 0 ? (
          <p className="text-xs text-slate-400">
            Todavía no hay proyecciones guardadas cuyas fechas ya hayan pasado y tengan medición. Vuelve en unos días: cada proyección
            que hagas quedará verificada.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-1 pr-3">Método</th>
                <th className="py-1 pr-3">Historial</th>
                <th className="py-1 pr-3">Error medio ({u})</th>
                <th className="py-1 pr-3">Sesgo ({u})</th>
                <th className="py-1 pr-3">Días verificados</th>
              </tr>
            </thead>
            <tbody>
              {t.verificacion.map((v) => (
                <tr key={`${v.metodo}-${v.corregida}`} className="border-b border-slate-100 text-slate-700">
                  <td className="py-1 pr-3">{NOMBRE_METODO_PROY[v.metodo] ?? v.metodo}</td>
                  <td className="py-1 pr-3">{v.corregida ? 'Corregido' : 'Sin corregir'}</td>
                  <td className="py-1 pr-3">{v.mae.toFixed(2)}</td>
                  <td className="py-1 pr-3">
                    {v.sesgo >= 0 ? '+' : ''}
                    {v.sesgo.toFixed(2)}
                  </td>
                  <td className="py-1 pr-3">{v.dias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function CardReportes({ t }: { t: TarjetaReportes }) {
  return (
    <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4 text-sm">
      {t.filas.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-2 text-slate-700">
          <span>
            {r.periodo_inicio} — {r.periodo_fin}
          </span>
          <a href={r.archivo_url} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0E7C9B] underline">
            Descargar {({ pdf: 'PDF', word: 'Word', excel: 'Excel' } as Record<string, string>)[r.tipo ?? ''] ?? 'archivo'}
          </a>
        </li>
      ))}
    </ul>
  )
}
