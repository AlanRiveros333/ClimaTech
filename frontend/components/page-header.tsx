export default function PageHeader({
  titulo,
  descripcion,
}: {
  titulo: string
  descripcion: string
}) {
  return (
    <header>
      <h1 className="page-title">{titulo}</h1>
      <p className="page-sub">{descripcion}</p>
    </header>
  )
}
