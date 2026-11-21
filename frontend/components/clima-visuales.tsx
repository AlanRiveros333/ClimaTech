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
