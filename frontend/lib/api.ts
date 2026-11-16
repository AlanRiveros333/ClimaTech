import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Llamada autenticada al backend FastAPI. Lanza Error con un mensaje listo para mostrar.
export async function apiFetch<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) throw new Error('Sesión expirada, vuelve a iniciar sesión.')

  let res: Response
  try {
    res = await fetch(`${API_URL}${ruta}`, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(opciones.headers ?? {}),
      },
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor backend.')
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    const detalle = data?.detail
    if (typeof detalle === 'string') throw new Error(detalle)
    if (Array.isArray(detalle)) {
      throw new Error(detalle.map((d: { msg?: string }) => d.msg).filter(Boolean).join('. '))
    }
    throw new Error('La solicitud no se pudo completar.')
  }

  return data as T
}
