'use client'

// Apartado «Proyección del clima»: funciona solo, sin el asistente. Al entrar calcula la proyección
// de la temperatura de los próximos 7 días; se puede cambiar la variable y la cantidad de días.
import { useState } from 'react'
import Link from 'next/link'
import { Brain, CalendarDays, CloudSun, Database, Droplets, Thermometer, Trophy, Wind } from 'lucide-react'
import NavBar from '@/components/nav-bar'
import { CardProyeccion, type TarjetaProyeccion } from '@/components/tarjetas-clima'
import { CajaError, Cargando, EnPalabras, Encabezado, Pasos, Pildoras, Portada, useDatosPanel, type Variable } from '@/components/paneles/ui'
import { apiFetch } from '@/lib/api'

type Respuesta = { texto: string; tarjetas: { tipo: string }[] }

const VARIABLES = [
  { valor: 'temperatura', texto: 'Temperatura', icono: <Thermometer size={15} /> },
  { valor: 'humedad', texto: 'Humedad', icono: <Droplets size={15} /> },
  { valor: 'velocidad_viento', texto: 'Viento', icono: <Wind size={15} /> },
] as const

const DIAS = [
  { valor: 3, texto: '3 días' },
  { valor: 7, texto: '7 días' },
  { valor: 10, texto: '10 días' },
  { valor: 14, texto: '14 días' },
] as const

const MENSAJES_CARGA = [
  'Leyendo el historial de Cochabamba…',
  'Corrigiendo el historial con la estación del aeropuerto…',
  'Seis métodos compiten adivinando días que no vieron…',
  'Consultando el pronóstico de Open-Meteo…',
  'Combinando los modelos meteorológicos con la IA…',
]

const PASOS = [
  {
    icono: <Database size={20} />,
    color: '#0E7C9B',
    titulo: 'Datos reales',
    texto: 'Se usa el historial diario de Open-Meteo, corregido con lo que midió la estación del aeropuerto Jorge Wilstermann.',
  },
  {
    icono: <Trophy size={20} />,
    color: '#d97706',
    titulo: 'Competencia justa',
    texto: 'Seis métodos (estadísticos y de inteligencia artificial) intentan adivinar los últimos días sin verlos. Gana el que menos se equivoca.',
  },
  {
    icono: <Brain size={20} />,
    color: '#7c3aed',
    titulo: 'Modelo híbrido',
    texto: 'Para los primeros días, el pronóstico meteorológico se corrige con IA aprendida de los errores pasados. Así se acerca más a lo que realmente pasa.',
  },
]

export default function ProyeccionPage() {
  const [variable, setVariable] = useState<Variable>('temperatura')
  const [dias, setDias] = useState<number>(7)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const { datos, error, cargando, recargar } = useDatosPanel<Respuesta>(`/paneles/proyeccion?variable=${variable}&dias=${dias}`)
  const tarjeta = datos?.tarjetas.find((t) => t.tipo === 'proyeccion') as TarjetaProyeccion | undefined

  async function enviarAlerta() {
    setAviso(null)
    try {
      const r = await apiFetch<{ destino: string; alertas: number }>('/alertas/enviarme', { method: 'POST' })
      setAviso({ ok: true, texto: `Te envié ${r.alertas} alerta(s) a ${r.destino}. Revisa tu bandeja de entrada (y la carpeta de spam).` })
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo enviar el correo.' })
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <Portada
        etiqueta="Proyección del clima · Cochabamba"
        icono={<CloudSun size={14} />}
        titulo="¿Qué clima se viene"
        resaltado="en los próximos días?"
        texto="Elige qué quieres ver y por cuántos días. ClimaTech calcula la proyección, te dice qué tan confiable es y te avisa si se esperan lluvias, heladas o calor."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
          <Pildoras oscuro etiqueta="Variable" opciones={VARIABLES} valor={variable} onCambio={(v) => setVariable(v)} />
          <Pildoras oscuro etiqueta="Días" opciones={DIAS} valor={dias} onCambio={(v) => setDias(v)} />
        </div>
      </Portada>

      <main className="relative z-10 mx-auto -mt-14 max-w-6xl space-y-10 px-4 pb-16">
        {cargando && <Cargando mensajes={MENSAJES_CARGA} />}
        {error && <CajaError mensaje={error} onReintentar={recargar} />}

        {datos && !cargando && (
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="min-w-0 animate-aparecer rounded-3xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/60 sm:p-6">
              {tarjeta ? (
                <CardProyeccion t={tarjeta} onEnviarAlerta={enviarAlerta} />
              ) : (
                <div className="space-y-3 p-2 text-sm text-slate-600">
                  <p>No se pudo calcular la proyección con los datos actuales.</p>
                  <Link href="/asistente" className="inline-block font-medium text-[#0E7C9B] underline">
                    Importar datos desde el asistente
                  </Link>
                </div>
              )}
              {aviso && (
                <p role="status" className={`mt-3 ${aviso.ok ? 'alert-success' : 'alert-error'}`}>
                  {aviso.texto}
                </p>
              )}
            </div>
            <aside className="space-y-4">
              <EnPalabras texto={datos.texto} />
              <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
                <p className="flex items-center gap-2 font-semibold text-slate-900">
                  <CalendarDays size={16} className="text-[#0E7C9B]" /> Cómo leer la proyección
                </p>
                <ul className="mt-3 space-y-2">
                  <li>
                    <b className="text-slate-800">Número grande:</b> lo que proyecta ClimaTech
                    {variable === 'temperatura' ? ' (promedio de las 24 horas, no la máxima).' : '.'}
                  </li>
                  <li>
                    <b className="text-slate-800">Dibujo del cielo, ↑ y ↓:</b> pronóstico de Open-Meteo, con la máxima y la mínima del día.
                  </li>
                  <li>
                    <b className="text-slate-800">Confianza:</b> cuánto coinciden los modelos meteorológicos ese día. Pasa el mouse para ver cada uno.
                  </li>
                  <li>
                    <b className="text-slate-800">«¿Cómo lo calculé?»:</b> abre los gráficos, la tabla de errores de cada método y la prueba real contra lo predicho.
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        )}

        <section className="space-y-6">
          <Encabezado etiqueta="Detrás del número" titulo="Cómo se calcula cada proyección" texto="Tres pasos que se repiten cada vez que entras a este apartado." />
          <Pasos pasos={PASOS} />
          <p className="text-xs text-slate-400">
            Las proyecciones son estimaciones estadísticas, no un pronóstico oficial. Para decisiones importantes consulta al SENAMHI.
          </p>
        </section>
      </main>
    </div>
  )
}
