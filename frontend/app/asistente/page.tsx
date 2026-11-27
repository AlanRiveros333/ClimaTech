'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bot, Pencil, Send, Trash2, User } from 'lucide-react'
import NavBar from '@/components/nav-bar'
import { IconoCielo, TEXTO_CIELO } from '@/components/clima-visuales'
import EditarRegistroModal, { RegistroEditable } from '@/components/editar-registro-modal'
import {
  BOTON_PRIMARIO,
  CardAnomalias,
  CardEstacion,
  CardEventos,
  CardProyeccion,
  CardReportes,
  INTENSIDAD,
  cieloDeDia,
  type AlertaPron,
  type DiaPron,
  type TarjetaAnomalias,
  type TarjetaEstacion,
  type TarjetaEventos,
  type TarjetaProyeccion,
  type TarjetaReportes,
} from '@/components/tarjetas-clima'
import { apiFetch } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

// ------------------------------------------------------------------ tipos
type Boton = { texto: string; mensaje: string }
type Accion = {
  tipo: string
  params: Record<string, string>
  estado: 'pendiente' | 'confirmada'
  descripcion: string
}
type TarjetaPronostico = { tipo: 'pronostico'; dias: DiaPron[]; alertas: AlertaPron[] }
type TarjetaResumen = {
  tipo: 'resumen'
  dias_con_datos: number
  primer_dia: string
  ultimo_dia: string
  dias_rango: number
  cobertura_pct: number
}
type TarjetaRegistros = { tipo: 'registros'; filas: RegistroEditable[]; puede_editar: boolean }
type TarjetaFormRegistro = {
  tipo: 'form_registro'
  valores: { temperatura?: number; humedad?: number; velocidad_viento?: number; hora?: string }
  fecha: string | null
}
type TarjetaFormEvento = { tipo: 'form_evento' }
type TarjetaHistorial = {
  tipo: 'historial_alertas'
  filas: { tipo: string; nivel: string; fecha_pronostico: string; enviado_en: string; profiles: { nombre_completo: string } | null }[]
}
type Tarjeta =
  | TarjetaProyeccion
  | TarjetaEventos
  | TarjetaAnomalias
  | TarjetaPronostico
  | TarjetaResumen
  | TarjetaRegistros
  | TarjetaFormRegistro
  | TarjetaFormEvento
  | TarjetaReportes
  | TarjetaHistorial
  | TarjetaEstacion

type Contexto = Record<string, unknown>
type RespuestaApi = {
  respuesta: string
  tarjetas: Tarjeta[]
  botones: Boton[]
  accion: Accion | null
  contexto: Contexto
  interprete: string
}
type Mensaje = {
  id: number
  rol: 'usuario' | 'asistente'
  texto: string
  tarjetas?: Tarjeta[]
  botones?: Boton[]
  accion?: Accion | null
  enlace?: { texto: string; url: string }
  interprete?: string
}

type Callbacks = {
  guardarRegistro: (d: Record<string, unknown>) => Promise<void>
  guardarEvento: (d: Record<string, unknown>) => Promise<void>
  eliminarRegistro: (id: string) => void
  editarRegistro: (r: RegistroEditable) => void
  eliminarEvento: (id: string) => void
  preguntar: (texto: string) => void
}

// La proyección, la estación del aeropuerto y los reportes tienen su propio apartado en el menú;
// aquí quedan los atajos de las tareas que se hacen conversando.
const ATAJOS: Boton[] = [
  { texto: 'Registrar dato', mensaje: 'quiero registrar un dato' },
  { texto: 'Ver registros', mensaje: 'muéstrame los últimos registros' },
  { texto: 'Importar datos', mensaje: 'importa datos de Open-Meteo' },
  { texto: 'Mis datos', mensaje: '¿cuántos datos tengo?' },
  { texto: 'Alertas por correo', mensaje: 'pronóstico de lluvia' },
  { texto: 'Actualización de datos', mensaje: 'estado de la actualización' },
]

const APARTADOS = [
  { href: '/proyecciones', texto: 'Proyección del clima' },
  { href: '/estacion', texto: 'Estación del aeropuerto' },
  { href: '/reportes', texto: 'Reportes, métodos y fenómenos' },
]

const SALUDO =
  'Hola, soy el asistente de ClimaTech. Puedes escribirme lo que necesites o usar los botones de arriba; la proyección, la estación del aeropuerto y los reportes también tienen su propio apartado en el menú. Cuando pidas una proyección tomaré en cuenta El Niño / La Niña si mejora el resultado, te mostraré las alertas probables y podré enviártelas por correo. Antes de importar datos, generar reportes o enviar correos siempre te pido confirmación. ¿Qué quieres hacer?'


function hoyLocal() {
  const ahora = new Date()
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().split('T')[0]
}

const CAMPO = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'


function CardPronostico({ t }: { t: TarjetaPronostico }) {
  const f = (v: number | null, d = 0) => (v === null ? '—' : v.toFixed(d))
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
      <div className="grid gap-2 sm:grid-cols-3">
        {t.dias.map((d) => (
          <div key={d.fecha} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 text-slate-700">
            <IconoCielo cielo={cieloDeDia(d)} alto={48} />
            <div>
            <p className="font-medium text-slate-900">
              {d.fecha} · {TEXTO_CIELO[cieloDeDia(d)]}
            </p>
            <p>
              Lluvia: {f(d.lluvia_mm, 1)} mm ({f(d.prob_lluvia)}%)
            </p>
            <p>
              Máx/mín: {f(d.tmax, 1)}° / {f(d.tmin, 1)}°
            </p>
            </div>
          </div>
        ))}
      </div>
      {t.alertas.map((a) => (
        <p
          key={`${a.tipo}-${a.fecha}`}
          className={`rounded-lg border p-2 ${a.nivel === 'alto' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
        >
          {a.fecha} · {a.titulo}. {a.mensaje}
        </p>
      ))}
    </div>
  )
}

function CardResumen({ t }: { t: TarjetaResumen }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center text-xs">
      <div>
        <p className="text-lg font-semibold text-slate-900">{t.dias_con_datos}</p>
        <p className="text-slate-500">días con datos</p>
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-900">{t.cobertura_pct.toFixed(0)}%</p>
        <p className="text-slate-500">cobertura</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">
          {t.primer_dia} → {t.ultimo_dia}
        </p>
        <p className="text-slate-500">rango</p>
      </div>
    </div>
  )
}

function CardRegistros({ t, cb }: { t: TarjetaRegistros; cb: Callbacks }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-3">Fecha</th>
            <th className="py-1 pr-3">Hora</th>
            <th className="py-1 pr-3">Temp.</th>
            <th className="py-1 pr-3">Hum.</th>
            <th className="py-1 pr-3">Viento</th>
            <th className="py-1 pr-3">Fuente</th>
            {t.puede_editar && <th className="py-1" />}
          </tr>
        </thead>
        <tbody>
          {t.filas.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 text-slate-700">
              <td className="py-1 pr-3">{r.fecha}</td>
              <td className="py-1 pr-3">{r.hora.slice(0, 5)}</td>
              <td className="py-1 pr-3">{r.temperatura ?? '—'}</td>
              <td className="py-1 pr-3">{r.humedad ?? '—'}</td>
              <td className="py-1 pr-3">{r.velocidad_viento ?? '—'}</td>
              <td className="py-1 pr-3">{r.fuente === 'manual' ? 'Manual' : 'Open-Meteo'}</td>
              {t.puede_editar && (
                <td className="py-1">
                  <div className="flex gap-2">
                    <button onClick={() => cb.editarRegistro(r)} aria-label="Editar registro" className="text-slate-400 hover:text-[#0E7C9B]">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => cb.eliminarRegistro(r.id)} aria-label="Eliminar registro" className="text-slate-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormRegistro({ t, cb }: { t: TarjetaFormRegistro; cb: Callbacks }) {
  const [fecha, setFecha] = useState(t.fecha ?? '')
  const [hora, setHora] = useState(t.valores.hora ?? '')
  const [temperatura, setTemperatura] = useState(t.valores.temperatura?.toString() ?? '')
  const [humedad, setHumedad] = useState(t.valores.humedad?.toString() ?? '')
  const [viento, setViento] = useState(t.valores.velocidad_viento?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [hoy] = useState(hoyLocal)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      await cb.guardarRegistro({
        fecha,
        hora: `${hora}:00`,
        temperatura: temperatura ? Number(temperatura) : null,
        humedad: humedad ? Number(humedad) : null,
        velocidad_viento: viento ? Number(viento) : null,
      })
      setGuardado(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  if (guardado) return <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Registro guardado ✓</p>

  return (
    <form onSubmit={enviar} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Fecha</label>
        <input type="date" required max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Hora</label>
        <input type="time" required value={hora} onChange={(e) => setHora(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Temperatura (°C)</label>
        <input type="number" step="0.1" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Humedad (%)</label>
        <input type="number" step="0.1" min="0" max="100" value={humedad} onChange={(e) => setHumedad(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Viento (km/h)</label>
        <input type="number" step="0.1" min="0" value={viento} onChange={(e) => setViento(e.target.value)} className={CAMPO} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={guardando} className={`${BOTON_PRIMARIO} w-full`}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {error && (
        <p role="alert" className="col-span-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}

function FormEvento({ cb }: { cb: Callbacks }) {
  const [nombre, setNombre] = useState('')
  const [fase, setFase] = useState('el_nino')
  const [intensidad, setIntensidad] = useState('moderado')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      await cb.guardarEvento({ nombre, fase, intensidad, fecha_inicio: inicio, fecha_fin: fin || null })
      setGuardado(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  if (guardado) return <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Evento guardado ✓</p>

  return (
    <form onSubmit={enviar} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
      <div className="col-span-full">
        <label className="mb-1 block text-xs font-medium text-slate-600">Nombre del evento</label>
        <input required minLength={3} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Fase</label>
        <select value={fase} onChange={(e) => setFase(e.target.value)} className={CAMPO}>
          <option value="el_nino">El Niño</option>
          <option value="la_nina">La Niña</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Intensidad</label>
        <select value={intensidad} onChange={(e) => setIntensidad(e.target.value)} className={CAMPO}>
          {Object.entries(INTENSIDAD).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Inicio</label>
        <input type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Fin (vacío = en curso)</label>
        <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className={CAMPO} />
      </div>
      <div className="flex items-end sm:col-span-2">
        <button type="submit" disabled={guardando} className={`${BOTON_PRIMARIO} w-full`}>
          {guardando ? 'Guardando...' : 'Guardar evento'}
        </button>
      </div>
      {error && (
        <p role="alert" className="col-span-full text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}


function CardHistorial({ t }: { t: TarjetaHistorial }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 pr-3">Usuario</th>
            <th className="py-1 pr-3">Tipo</th>
            <th className="py-1 pr-3">Nivel</th>
            <th className="py-1 pr-3">Pronóstico</th>
            <th className="py-1">Enviado</th>
          </tr>
        </thead>
        <tbody>
          {t.filas.map((h, i) => (
            <tr key={i} className="border-b border-slate-100 text-slate-700">
              <td className="py-1 pr-3">{h.profiles?.nombre_completo ?? '—'}</td>
              <td className="py-1 pr-3">{h.tipo}</td>
              <td className="py-1 pr-3">{h.nivel}</td>
              <td className="py-1 pr-3">{h.fecha_pronostico}</td>
              <td className="py-1">{new Date(h.enviado_en).toLocaleString('es-BO')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Tarjetas({ lista, cb }: { lista: Tarjeta[]; cb: Callbacks }) {
  return (
    <>
      {lista.map((t, i) => {
        switch (t.tipo) {
          case 'proyeccion':
            return <CardProyeccion key={i} t={t} onEnviarAlerta={() => cb.preguntar('envíame las alertas por correo')} />
          case 'eventos':
            return <CardEventos key={i} t={t} onEliminar={cb.eliminarEvento} />
          case 'anomalias':
            return <CardAnomalias key={i} t={t} />
          case 'pronostico':
            return <CardPronostico key={i} t={t} />
          case 'resumen':
            return <CardResumen key={i} t={t} />
          case 'registros':
            return <CardRegistros key={i} t={t} cb={cb} />
          case 'form_registro':
            return <FormRegistro key={i} t={t} cb={cb} />
          case 'form_evento':
            return <FormEvento key={i} cb={cb} />
          case 'reportes':
            return <CardReportes key={i} t={t} />
          case 'historial_alertas':
            return <CardHistorial key={i} t={t} />
          case 'estacion':
            return <CardEstacion key={i} t={t} />
        }
      })}
    </>
  )
}

// ------------------------------------------------------------------ página
export default function AsistentePage() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ id: 0, rol: 'asistente', texto: SALUDO, botones: [] }])
  const [entrada, setEntrada] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editando, setEditando] = useState<{ registro: RegistroEditable; token: string } | null>(null)
  const contexto = useRef<Contexto | null>(null)
  const siguienteId = useRef(1)
  const final = useRef<HTMLDivElement>(null)

  useEffect(() => {
    final.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, enviando])

  function agregar(m: Omit<Mensaje, 'id'>) {
    setMensajes((prev) => [...prev, { ...m, id: siguienteId.current++ }])
  }

  // Ejecuta una acción ya confirmada llamando a los endpoints existentes del sistema.
  async function ejecutarAccion(a: Accion) {
    try {
      if (a.tipo === 'importar_open_meteo') {
        const d = await apiFetch<{ registros_procesados: number }>('/registros/importar-open-meteo', {
          method: 'POST',
          body: JSON.stringify({ fecha_inicio: a.params.fecha_inicio, fecha_fin: a.params.fecha_fin }),
        })
        agregar({ rol: 'asistente', texto: `Importación completada: ${d.registros_procesados} registros procesados. Ya puedes proyectar con esos datos.` })
      } else if (a.tipo === 'actualizar_datos') {
        agregar({ rol: 'asistente', texto: 'Actualizando historial, estación del aeropuerto, pronósticos pasados y modelos. Puede tardar uno o dos minutos…' })
        type Paso = { dias?: number; filas?: number; hasta?: string | null; omitido?: string; error?: string }
        const d = await apiFetch<{ omitida?: string; ok?: boolean; segundos?: number; pasos?: Record<string, Paso> }>('/actualizacion/ejecutar', {
          method: 'POST',
        })
        if (d.omitida) {
          agregar({ rol: 'asistente', texto: d.omitida })
        } else {
          const linea = (nombre: string, p: Paso | undefined, unidad: string) =>
            !p
              ? ''
              : p.error
                ? `• ${nombre}: falló (${p.error.slice(0, 120)}).`
                : p.omitido
                  ? `• ${nombre}: ${p.omitido}`
                  : `• ${nombre}: ${p.dias ?? p.filas ?? 0} ${unidad}${p.hasta ? `, hasta el ${p.hasta.slice(8, 10)}/${p.hasta.slice(5, 7)}` : ''}.`
          agregar({
            rol: 'asistente',
            texto: [
              `${d.ok ? 'Actualización completa' : 'Actualización terminada con errores'} (${d.segundos} s):`,
              linea('Historial de Open-Meteo', d.pasos?.historial, 'día(s) nuevo(s)'),
              linea('Estación del aeropuerto', d.pasos?.estacion, 'día(s) revisado(s)'),
              linea('Pronósticos pasados', d.pasos?.pronosticos_previos, 'fila(s)'),
              d.pasos?.reentrenamiento && !d.pasos.reentrenamiento.error ? '• Modelos reentrenados con los datos nuevos.' : '',
            ]
              .filter(Boolean)
              .join('\n'),
            botones: [{ texto: 'Proyectar temperatura', mensaje: 'proyecta la temperatura de los próximos 7 días' }],
          })
        }
      } else if (a.tipo === 'importar_estacion') {
        agregar({ rol: 'asistente', texto: 'Descargando las mediciones de la estación del aeropuerto. Puede tardar un minuto…' })
        const d = await apiFetch<{ lecturas: number; dias: number; dias_completos: number; pronosticos_previos: number; aviso: string | null }>('/estacion/importar', {
          method: 'POST',
          body: JSON.stringify({ fecha_inicio: a.params.fecha_inicio, fecha_fin: a.params.fecha_fin }),
        })
        agregar({
          rol: 'asistente',
          texto:
            `Listo: ${d.lecturas} reportes horarios, ${d.dias} días (${d.dias_completos} con el día completo)` +
            (d.pronosticos_previos ? ` y ${d.pronosticos_previos} pronósticos pasados de Open-Meteo` : '') +
            `. ${d.aviso ? d.aviso + ' ' : ''}Te muestro el impacto:`,
        })
        const r = await apiFetch<RespuestaApi>('/asistente/mensaje', {
          method: 'POST',
          body: JSON.stringify({ mensaje: 'impacto de la estación', contexto: contexto.current }),
        })
        contexto.current = r.contexto
        agregar({ rol: 'asistente', texto: r.respuesta, tarjetas: r.tarjetas, botones: r.botones, interprete: r.interprete })
      } else if (a.tipo === 'generar_reporte') {
        const d = await apiFetch<{ archivo_url: string }>('/reportes/generar', {
          method: 'POST',
          body: JSON.stringify({
            periodo_inicio: a.params.periodo_inicio,
            periodo_fin: a.params.periodo_fin,
            formato: a.params.formato ?? 'pdf',
          }),
        })
        const nombre = { pdf: 'PDF', word: 'Word', excel: 'Excel' }[a.params.formato ?? 'pdf'] ?? 'archivo'
        agregar({ rol: 'asistente', texto: `Reporte en ${nombre} generado.`, enlace: { texto: `Abrir el ${nombre}`, url: d.archivo_url } })
      } else if (a.tipo === 'activar_alertas' || a.tipo === 'desactivar_alertas') {
        const activar = a.tipo === 'activar_alertas'
        await apiFetch('/alertas/preferencia', { method: 'PATCH', body: JSON.stringify({ alertas_activas: activar }) })
        agregar({ rol: 'asistente', texto: activar ? 'Listo: activé tus alertas por correo.' : 'Listo: desactivé tus alertas por correo.' })
      } else if (a.tipo === 'enviar_prueba_alerta') {
        const aTodos = a.params.a_suscriptores === 'true'
        const d = await apiFetch<{ enviados: number; destino: string | null }>('/alertas/prueba', {
          method: 'POST',
          body: JSON.stringify({ tipo: a.params.tipo ?? 'lluvia', a_suscriptores: aTodos }),
        })
        agregar({
          rol: 'asistente',
          texto: aTodos
            ? `Correo de prueba enviado a ${d.enviados} suscriptor(es).`
            : `Correo de prueba enviado a ${d.destino ?? 'tu correo'}. Revisa tu bandeja (y spam).`,
        })
      } else if (a.tipo === 'enviar_alerta_actual') {
        const d = await apiFetch<{ destino: string; alertas: number }>('/alertas/enviarme', { method: 'POST' })
        agregar({ rol: 'asistente', texto: `Listo: te envié ${d.alertas} alerta(s) a ${d.destino}. Revisa tu bandeja (y la carpeta de spam).` })
      } else if (a.tipo === 'revisar_alertas') {
        const simular = a.params.simular === 'true'
        const d = await apiFetch<{
          alertas_detectadas: unknown[]
          destinatarios: number
          enviados: number
          sin_novedades: number
          errores: string[]
        }>(`/alertas/revisar?simular=${simular}`, { method: 'POST' })
        agregar({
          rol: 'asistente',
          texto:
            `${simular ? 'Simulación: ' : ''}${d.alertas_detectadas.length} alerta(s) detectada(s), ${d.destinatarios} suscriptor(es), ` +
            `${simular ? 'se enviarían' : 'enviados'}: ${d.enviados}, sin novedades: ${d.sin_novedades}.` +
            (d.errores.length ? `\nErrores: ${d.errores.join('; ')}` : ''),
        })
      }
    } catch (err) {
      agregar({ rol: 'asistente', texto: `No se pudo completar la acción: ${err instanceof Error ? err.message : 'error inesperado'}.` })
    }
  }

  async function enviar(texto: string, silencioso = false) {
    const limpio = texto.trim()
    if (!limpio || enviando) return
    setEntrada('')
    if (!silencioso) agregar({ rol: 'usuario', texto: limpio })
    setEnviando(true)
    try {
      const r = await apiFetch<RespuestaApi>('/asistente/mensaje', {
        method: 'POST',
        body: JSON.stringify({ mensaje: limpio, contexto: contexto.current }),
      })
      contexto.current = r.contexto
      agregar({
        rol: 'asistente',
        texto: r.respuesta,
        tarjetas: r.tarjetas,
        botones: r.botones,
        accion: r.accion,
        interprete: r.interprete,
      })
      if (r.accion?.estado === 'confirmada') await ejecutarAccion(r.accion)
    } catch (err) {
      agregar({ rol: 'asistente', texto: err instanceof Error ? err.message : 'Error inesperado.' })
    } finally {
      setEnviando(false)
    }
  }

  // Acciones directas de las tarjetas (formularios, editar y eliminar)
  const cb: Callbacks = {
    preguntar: (texto) => {
      void enviar(texto)
    },
    guardarRegistro: async (d) => {
      await apiFetch('/registros/manual', { method: 'POST', body: JSON.stringify(d) })
      agregar({
        rol: 'asistente',
        texto: 'Registro guardado correctamente. Ya forma parte del histórico.',
        botones: [{ texto: 'Ver registros', mensaje: 'muéstrame los últimos registros' }],
      })
    },
    guardarEvento: async (d) => {
      await apiFetch('/fenomenos/eventos', { method: 'POST', body: JSON.stringify(d) })
      agregar({
        rol: 'asistente',
        texto: 'Evento guardado. Desde ahora se usa en las proyecciones con El Niño / La Niña y en las anomalías.',
        botones: [{ texto: 'Ver eventos', mensaje: '¿hay algún evento climático en curso?' }],
      })
    },
    eliminarRegistro: async (id) => {
      if (!window.confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return
      try {
        await apiFetch(`/registros/${id}`, { method: 'DELETE' })
        await enviar('muéstrame los últimos registros', true)
      } catch (err) {
        agregar({ rol: 'asistente', texto: `No se pudo eliminar: ${err instanceof Error ? err.message : 'error inesperado'}.` })
      }
    },
    editarRegistro: async (registro) => {
      const {
        data: { session },
      } = await createClient().auth.getSession()
      if (!session) {
        agregar({ rol: 'asistente', texto: 'Sesión expirada, vuelve a iniciar sesión.' })
        return
      }
      setEditando({ registro, token: session.access_token })
    },
    eliminarEvento: async (id) => {
      if (!window.confirm('¿Eliminar este evento?')) return
      try {
        await apiFetch(`/fenomenos/eventos/${id}`, { method: 'DELETE' })
        await enviar('¿hay algún evento climático en curso?', true)
      } catch (err) {
        agregar({ rol: 'asistente', texto: `No se pudo eliminar: ${err instanceof Error ? err.message : 'error inesperado'}.` })
      }
    },
  }

  const ultimoId = mensajes[mensajes.length - 1]?.id

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />
      <div className="mx-auto flex max-w-4xl flex-col px-4 py-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0E7C9B]/10">
            <Bot size={22} color="#0E7C9B" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Asistente ClimaTech</h1>
            <p className="text-sm text-slate-500">Pregunta en tus palabras: registra datos, importa, consulta y recibe alertas</p>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#0E7C9B]/20 bg-white/70 px-3 py-2 text-xs text-slate-600">
          <span>También tienes estos apartados:</span>
          {APARTADOS.map((a) => (
            <Link key={a.href} href={a.href} className="rounded-full bg-[#0E7C9B]/10 px-3 py-1 font-medium text-[#0B4F6C] transition hover:bg-[#0E7C9B]/20">
              {a.texto} →
            </Link>
          ))}
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {ATAJOS.map((b) => (
            <button
              key={b.texto}
              onClick={() => enviar(b.mensaje)}
              disabled={enviando}
              className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-[#0E7C9B] hover:text-[#0E7C9B] disabled:opacity-50"
            >
              {b.texto}
            </button>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {mensajes.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.rol === 'usuario' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.rol === 'usuario' ? 'bg-slate-900 text-white' : 'bg-[#0E7C9B]/10 text-[#0E7C9B]'}`}
              >
                {m.rol === 'usuario' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`min-w-0 max-w-[88%] ${m.rol === 'usuario' ? 'text-right' : ''}`}>
                <div
                  className={`inline-block whitespace-pre-line rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
                    m.rol === 'usuario' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {m.texto}
                </div>

                {m.tarjetas && m.tarjetas.length > 0 && <Tarjetas lista={m.tarjetas} cb={cb} />}

                {m.enlace && (
                  <p className="mt-2">
                    <a href={m.enlace.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#0E7C9B] underline">
                      {m.enlace.texto}
                    </a>
                  </p>
                )}

                {m.accion?.estado === 'pendiente' && m.id === ultimoId && !enviando && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => enviar('sí, confirmo')} className={BOTON_PRIMARIO}>
                      Confirmar
                    </button>
                    <button
                      onClick={() => enviar('no, cancela')}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {m.botones && m.botones.length > 0 && m.id === ultimoId && !enviando && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.botones.map((b) => (
                      <button
                        key={b.texto}
                        onClick={() => enviar(b.mensaje)}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-slate-500"
                      >
                        {b.texto}
                      </button>
                    ))}
                  </div>
                )}

                {m.interprete && m.interprete !== 'reglas' && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Interpretado con {m.interprete === 'clasificador' ? 'el clasificador local' : 'un modelo de lenguaje'}
                  </p>
                )}
              </div>
            </div>
          ))}
          {enviando && <p className="text-sm text-slate-400">Procesando... (los modelos pueden tardar unos segundos)</p>}
          <div ref={final} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            enviar(entrada)
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            maxLength={300}
            placeholder="Escribe, por ejemplo: proyecta la humedad de los próximos 10 días con El Niño"
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
          />
          <button
            type="submit"
            disabled={enviando || !entrada.trim()}
            aria-label="Enviar mensaje"
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B4F6C] to-[#0E7C9B] px-5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Send size={16} />
            Enviar
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          Las proyecciones son estimaciones estadísticas, no pronósticos meteorológicos oficiales.
        </p>
      </div>

      {editando && (
        <EditarRegistroModal
          registro={editando.registro}
          accessToken={editando.token}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null)
            enviar('muéstrame los últimos registros', true)
          }}
        />
      )}
    </div>
  )
}
