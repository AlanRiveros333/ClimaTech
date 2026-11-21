// Ilustraciones del clima en SVG. Son componentes sin estado: sirven en páginas de servidor y de cliente.
// Los dibujos representan el VALOR proyectado (nivel de temperatura, humedad o viento),
// no el estado del cielo, que el sistema no proyecta.

type RGB = [number, number, number]
type Parada = [number, RGB]

const ESCALAS: Record<string, Parada[]> = {
  temperatura: [
    [-5, [30, 58, 138]],
    [5, [37, 99, 235]],
    [12, [6, 182, 212]],
    [18, [132, 204, 22]],
    [24, [245, 158, 11]],
    [30, [234, 88, 12]],
    [36, [185, 28, 28]],
  ],
  humedad: [
    [10, [217, 119, 6]],
    [40, [250, 204, 21]],
    [60, [34, 197, 94]],
    [80, [14, 165, 233]],
    [100, [30, 64, 175]],
  ],
  velocidad_viento: [
    [0, [148, 163, 184]],
    [10, [20, 184, 166]],
    [25, [245, 158, 11]],
    [45, [220, 38, 38]],
  ],
}

const RANGOS: Record<string, [number, number]> = {
  temperatura: [-5, 40],
  humedad: [0, 100],
  velocidad_viento: [0, 50],
}

// Color según el valor, interpolando la escala de cada variable.
export function colorVariable(variable: string, valor: number): string {
  const paradas = ESCALAS[variable] ?? ESCALAS.temperatura
  if (valor <= paradas[0][0]) return `rgb(${paradas[0][1].join(',')})`
  for (let i = 1; i < paradas.length; i++) {
    const [v1, c1] = paradas[i]
    const [v0, c0] = paradas[i - 1]
    if (valor <= v1) {
      const t = (valor - v0) / (v1 - v0)
      return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * t)).join(',')})`
    }
  }
  return `rgb(${paradas[paradas.length - 1][1].join(',')})`
}

function fraccion(variable: string, valor: number): number {
  const [min, max] = RANGOS[variable] ?? RANGOS.temperatura
  return Math.min(1, Math.max(0.08, (valor - min) / (max - min)))
}

export function Termometro({ valor, color, alto = 64 }: { valor: number; color: string; alto?: number }) {
  const f = fraccion('temperatura', valor)
  const h = 36 * f
  return (
    <svg viewBox="0 0 32 64" height={alto} width={alto / 2} role="img" aria-label={`Termómetro ${valor.toFixed(0)} grados`}>
      <rect x="11" y="4" width="10" height="44" rx="5" fill="#e2e8f0" />
      <circle cx="16" cy="51" r="10" fill="#e2e8f0" />
      <rect x="13.5" y={46 - h} width="5" height={h + 4} rx="2.5" fill={color} />
      <circle cx="16" cy="51" r="7" fill={color} />
      {[10, 18, 26, 34, 42].map((y) => (
        <line key={y} x1="23" y1={y} x2="27" y2={y} stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
      ))}
    </svg>
  )
}

export function Gota({ valor, color, alto = 64 }: { valor: number; color: string; alto?: number }) {
  const f = fraccion('humedad', valor)
  const id = `gota-${Math.round(valor * 10)}-${alto}`
  return (
    <svg viewBox="0 0 32 40" height={alto} width={(alto * 32) / 40} role="img" aria-label={`Humedad ${valor.toFixed(0)} por ciento`}>
      <defs>
        <clipPath id={id}>
          <rect x="0" y={38 - 34 * f} width="32" height="40" />
        </clipPath>
      </defs>
      <path d="M16 3 C16 3 5 17 5 25 a11 11 0 0 0 22 0 C27 17 16 3 16 3 Z" fill="#e2e8f0" />
      <path d="M16 3 C16 3 5 17 5 25 a11 11 0 0 0 22 0 C27 17 16 3 16 3 Z" fill={color} clipPath={`url(#${id})`} />
    </svg>
  )
}

export function Viento({ valor, color, alto = 64 }: { valor: number; color: string; alto?: number }) {
  const f = fraccion('velocidad_viento', valor)
  const nivel = f < 0.3 ? 1 : f < 0.6 ? 2 : 3
  const trazo = (activo: boolean) => ({ stroke: activo ? color : '#cbd5e1', strokeWidth: 3.2, strokeLinecap: 'round' as const, fill: 'none' })
  return (
    <svg viewBox="0 0 40 40" height={alto * 0.8} width={alto * 0.8} role="img" aria-label={`Viento ${valor.toFixed(0)} kilómetros por hora`}>
      <path d="M4 13 H24 a5 5 0 1 0 -5 -5" {...trazo(nivel >= 1)} />
      <path d="M4 21 H30 a5 5 0 1 1 -5 5" {...trazo(nivel >= 2)} />
      <path d="M4 29 H18 a4 4 0 1 1 -4 4" {...trazo(nivel >= 3)} />
    </svg>
  )
}

export function IconoVariable({ variable, valor, alto = 64 }: { variable: string; valor: number; alto?: number }) {
  const color = colorVariable(variable, valor)
  if (variable === 'humedad') return <Gota valor={valor} color={color} alto={alto} />
  if (variable === 'velocidad_viento') return <Viento valor={valor} color={color} alto={alto} />
  return <Termometro valor={valor} color={color} alto={alto} />
}

// ------------------------------------------------------------------ cielo
// Íconos del estado del cielo, al estilo de las páginas de pronóstico.
// Se basan en el código WMO del pronóstico de Open-Meteo (el sistema no proyecta el cielo por sí mismo).
// Animación con SVG nativo (sin CSS): rayos que giran, gotas que caen, rayos que destellan.

export type Cielo =
  | 'despejado'
  | 'poco_nublado'
  | 'parcial'
  | 'nublado'
  | 'nubes_negras'
  | 'niebla'
  | 'llovizna'
  | 'lluvia'
  | 'tormenta'
  | 'nieve'

export function categoriaCielo(codigo: number | null | undefined, probLluvia?: number | null): Cielo | null {
  if (codigo === null || codigo === undefined) return null
  if (codigo === 0) return 'despejado'
  if (codigo === 1) return 'poco_nublado'
  if (codigo === 2) return 'parcial'
  if (codigo === 3) return (probLluvia ?? 0) >= 50 ? 'nubes_negras' : 'nublado'
  if (codigo === 45 || codigo === 48) return 'niebla'
  if (codigo >= 51 && codigo <= 57) return 'llovizna'
  if ((codigo >= 61 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return 'lluvia'
  if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return 'nieve'
  if (codigo >= 95) return 'tormenta'
  return 'nublado'
}

export const TEXTO_CIELO: Record<Cielo, string> = {
  despejado: 'Soleado',
  poco_nublado: 'Pocas nubes',
  parcial: 'Parcialmente nublado',
  nublado: 'Nublado',
  nubes_negras: 'Nubes oscuras',
  niebla: 'Niebla',
  llovizna: 'Llovizna',
  lluvia: 'Lluvia',
  tormenta: 'Tormenta eléctrica',
  nieve: 'Nieve',
}

const NUBE_PATH = 'M18 50 H46 A10 10 0 0 0 47 30 A14 14 0 0 0 20 27 A11.5 11.5 0 0 0 18 50 Z'

function Sol({ x = 32, y = 32, r = 11, rayos = true }: { x?: number; y?: number; r?: number; rayos?: boolean }) {
  const largo = r * 0.55
  return (
    <g>
      <circle cx={x} cy={y} r={r + 6} fill="#fde68a" opacity="0.45">
        <animate attributeName="r" values={`${r + 4};${r + 8};${r + 4}`} dur="3s" repeatCount="indefinite" />
      </circle>
      {rayos && (
        <g stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round">
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4
            const d1 = r + 4
            const d2 = r + 4 + largo
            return <line key={i} x1={x + Math.cos(a) * d1} y1={y + Math.sin(a) * d1} x2={x + Math.cos(a) * d2} y2={y + Math.sin(a) * d2} />
          })}
          <animateTransform attributeName="transform" type="rotate" from={`0 ${x} ${y}`} to={`360 ${x} ${y}`} dur="24s" repeatCount="indefinite" />
        </g>
      )}
      <circle cx={x} cy={y} r={r} fill="#fbbf24" />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.45} fill="#fde68a" opacity="0.7" />
    </g>
  )
}

function Nube({ fill, sombra, dx = 0, dy = 0, escala = 1, flotar = true }: { fill: string; sombra: string; dx?: number; dy?: number; escala?: number; flotar?: boolean }) {
  return (
    <g transform={`translate(${dx} ${dy}) translate(32 38) scale(${escala}) translate(-32 -38)`}>
      <g>
        <path d={NUBE_PATH} fill={sombra} transform="translate(0 2.5)" />
        <path d={NUBE_PATH} fill={fill} stroke={sombra} strokeWidth="1.2" strokeOpacity="0.6" />
        {flotar && <animateTransform attributeName="transform" type="translate" values="0 0;2 0;0 0" dur="5s" repeatCount="indefinite" />}
      </g>
    </g>
  )
}

function Gotas({ color, cortas = false, x0 = 21 }: { color: string; cortas?: boolean; x0?: number }) {
  const largo = cortas ? 3 : 6
  return (
    <g stroke={color} strokeWidth="2.4" strokeLinecap="round">
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={x0 + i * 7} y1={52} x2={x0 + i * 7 - 2} y2={52 + largo}>
          <animate attributeName="opacity" values="0;1;0" dur="1.1s" begin={`${i * 0.27}s`} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values="0 -2;-1 4" dur="1.1s" begin={`${i * 0.27}s`} repeatCount="indefinite" />
        </line>
      ))}
    </g>
  )
}

export function IconoCielo({ cielo, alto = 56, titulo }: { cielo: Cielo; alto?: number; titulo?: string }) {
  const etiqueta = titulo ?? TEXTO_CIELO[cielo]
  return (
    <svg viewBox="0 0 64 64" width={alto} height={alto} role="img" aria-label={etiqueta}>
      <title>{etiqueta}</title>
      {cielo === 'despejado' && <Sol />}
      {cielo === 'poco_nublado' && (
        <>
          <Sol x={27} y={26} r={12} />
          <Nube fill="#f8fafc" sombra="#94a3b8" dx={8} dy={6} escala={0.6} />
        </>
      )}
      {cielo === 'parcial' && (
        <>
          <Sol x={24} y={22} r={10} />
          <Nube fill="#e2e8f0" sombra="#94a3b8" dx={-9} dy={-4} escala={0.6} />
          <Nube fill="#f8fafc" sombra="#94a3b8" dx={4} dy={2} escala={0.85} />
        </>
      )}
      {cielo === 'nublado' && (
        <>
          <Nube fill="#cbd5e1" sombra="#94a3b8" dx={-8} dy={-8} escala={0.7} />
          <Nube fill="#e2e8f0" sombra="#94a3b8" dx={3} dy={2} escala={0.9} />
        </>
      )}
      {cielo === 'nubes_negras' && (
        <>
          <Nube fill="#64748b" sombra="#334155" dx={-8} dy={-8} escala={0.7} />
          <Nube fill="#475569" sombra="#1e293b" dx={3} dy={2} escala={0.9} />
        </>
      )}
      {cielo === 'niebla' && (
        <>
          <Nube fill="#e2e8f0" sombra="#cbd5e1" dy={-6} escala={0.85} flotar={false} />
          <g stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round">
            <line x1="12" y1="50" x2="46" y2="50" />
            <line x1="18" y1="56" x2="52" y2="56">
              <animate attributeName="x1" values="18;14;18" dur="4s" repeatCount="indefinite" />
            </line>
          </g>
        </>
      )}
      {cielo === 'llovizna' && (
        <>
          <Nube fill="#94a3b8" sombra="#64748b" dy={-6} escala={0.95} />
          <Gotas color="#38bdf8" cortas />
        </>
      )}
      {cielo === 'lluvia' && (
        <>
          <Nube fill="#64748b" sombra="#334155" dx={-6} dy={-12} escala={0.65} />
          <Nube fill="#475569" sombra="#1e293b" dx={2} dy={-5} escala={0.92} />
          <Gotas color="#0ea5e9" />
        </>
      )}
      {cielo === 'tormenta' && (
        <>
          <Nube fill="#475569" sombra="#1e293b" dx={-6} dy={-12} escala={0.65} />
          <Nube fill="#334155" sombra="#0f172a" dx={2} dy={-5} escala={0.92} />
          <Gotas color="#0ea5e9" x0={17} />
          <path d="M35 39 L25 53 H32 L27 63 L42 48 H35 L40 39 Z" fill="#facc15" stroke="#ca8a04" strokeWidth="0.8" strokeLinejoin="round">
            <animate attributeName="opacity" values="1;1;0.15;1;0.15;1;1" keyTimes="0;0.6;0.65;0.7;0.75;0.8;1" dur="2.6s" repeatCount="indefinite" />
          </path>
        </>
      )}
      {cielo === 'nieve' && (
        <>
          <Nube fill="#e2e8f0" sombra="#94a3b8" dy={-6} escala={0.95} />
          <g fill="#7dd3fc">
            {[20, 30, 40].map((x, i) => (
              <circle key={x} cx={x} cy={55} r="2.2">
                <animate attributeName="cy" values="51;60" dur="1.8s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0" dur="1.8s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        </>
      )}
    </svg>
  )
}