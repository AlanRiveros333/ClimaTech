'use client'

// Apartado «Reportes»: genera reportes (de un período o de todos los datos), lista los reportes guardados
// y explica los métodos de proyección y los fenómenos El Niño / La Niña. Funciona sin el asistente.
import { useState } from 'react'
import { Brain, FilePlus2, FolderOpen, Globe2, ScrollText } from 'lucide-react'
import NavBar from '@/components/nav-bar'
import { Encabezado, Portada } from '@/components/paneles/ui'
import GenerarReportes from '@/components/reportes/generar'
import MisReportes from '@/components/reportes/mis-reportes'
import Metodos from '@/components/reportes/metodos'
import Fenomenos from '@/components/reportes/fenomenos'

type Pestana = 'generar' | 'mis' | 'metodos' | 'fenomenos'

const PESTANAS: { valor: Pestana; texto: string; Icono: typeof Brain; etiqueta: string; titulo: string; descripcion: string }[] = [
  {
    valor: 'generar',
    texto: 'Generar',
    Icono: FilePlus2,
    etiqueta: 'Nuevo reporte',
    titulo: 'Crea un reporte en segundos',
    descripcion: 'Elige un período y un formato, o descarga en PDF todos los datos registrados, ordenados por año y mes.',
  },
  {
    valor: 'mis',
    texto: 'Mis reportes',
    Icono: FolderOpen,
    etiqueta: 'Historial',
    titulo: 'Tus reportes guardados',
    descripcion: 'Todos los reportes quedan guardados: vuelve a descargarlos cuando quieras.',
  },
  {
    valor: 'metodos',
    texto: 'Métodos',
    Icono: Brain,
    etiqueta: 'La competencia',
    titulo: 'Cómo compiten los seis métodos',
    descripcion: 'Con datos reales de Cochabamba: quién acierta más, qué tanto se equivoca cada uno y cómo funciona por dentro.',
  },
  {
    valor: 'fenomenos',
    texto: 'Fenómenos y anomalías',
    Icono: Globe2,
    etiqueta: 'El Niño y La Niña',
    titulo: 'Cuando el clima se sale de lo normal',
    descripcion: 'Qué son El Niño y La Niña, y cuánto se apartó el clima de Cochabamba de lo habitual en cada fase.',
  },
]

export default function ReportesPage() {
  const [pestana, setPestana] = useState<Pestana>('generar')
  const [version, setVersion] = useState(0)
  const actual = PESTANAS.find((p) => p.valor === pestana) ?? PESTANAS[0]

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <Portada
        etiqueta="Reportes · Métodos · Fenómenos"
        icono={<ScrollText size={14} />}
        titulo="Todo lo que sabe ClimaTech,"
        resaltado="listo para llevar"
        texto="Genera reportes en PDF, Word o Excel, descarga todos los datos registrados y entiende cómo se calculan las proyecciones."
      />

      <main className="relative z-10 mx-auto -mt-16 max-w-6xl space-y-8 px-4 pb-16">
        <nav aria-label="Secciones de reportes" className="grid grid-cols-2 gap-2 rounded-3xl bg-white p-2 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200 md:grid-cols-4">
          {PESTANAS.map(({ valor, texto, Icono }) => {
            const activa = valor === pestana
            return (
              <button
                key={valor}
                onClick={() => setPestana(valor)}
                aria-current={activa ? 'page' : undefined}
                className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                  activa ? 'bg-linear-to-r from-[#0B4F6C] to-[#0E7C9B] text-white shadow' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icono size={17} />
                {texto}
              </button>
            )
          })}
        </nav>

        <div key={pestana} className="animate-aparecer space-y-6">
          <Encabezado etiqueta={actual.etiqueta} titulo={actual.titulo} texto={actual.descripcion} />
          {pestana === 'generar' && (
            <GenerarReportes
              onGenerado={() => {
                setVersion((v) => v + 1)
              }}
            />
          )}
          {pestana === 'mis' && <MisReportes version={version} />}
          {pestana === 'metodos' && <Metodos />}
          {pestana === 'fenomenos' && <Fenomenos />}
        </div>
      </main>
    </div>
  )
}
