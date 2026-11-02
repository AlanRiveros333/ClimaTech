// Curvas de nivel: motivo de identidad (valle de Cochabamba / isolíneas climáticas).
// Es decorativo; se calcula una sola vez.
const CONTORNOS = Array.from({ length: 11 }, (_, i) => {
  const base = 40 + i * 38
  let d = ''
  for (let a = 0; a <= 360; a += 6) {
    const t = (a * Math.PI) / 180
    const r = base * (1 + 0.14 * Math.sin(3 * t + 0.6) + 0.07 * Math.sin(5 * t + i * 0.25))
    const x = 400 + r * 1.25 * Math.cos(t)
    const y = 300 + r * 0.85 * Math.sin(t)
    d += `${a === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `
  }
  return d + 'Z'
})

export default function ContourPattern({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 800 600"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1">
        {CONTORNOS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  )
}
