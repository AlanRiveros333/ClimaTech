import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas que requieren sesión para cualquier rol.
const RUTAS_PROTEGIDAS = [
  '/dashboard',
  '/registros',
  '/proyecciones',
  '/aeropuerto',
  '/reportes',
  '/ia',
  '/alertas',
  '/fenomenos',
  '/asistente',
]

// Rutas exclusivas del administrador.
const RUTAS_SOLO_ADMIN = ['/usuarios', '/auditoria']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const requiereSesion = RUTAS_PROTEGIDAS.some((ruta) => path === ruta || path.startsWith(`${ruta}/`))
  const requiereAdmin = RUTAS_SOLO_ADMIN.some((ruta) => path === ruta || path.startsWith(`${ruta}/`))

  if ((requiereSesion || requiereAdmin) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  if (requiereAdmin && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (profile?.rol !== 'administrador') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/registros/:path*',
    '/proyecciones/:path*',
    '/aeropuerto/:path*',
    '/reportes/:path*',
    '/usuarios/:path*',
    '/auditoria/:path*',
    '/ia/:path*',
    '/alertas/:path*',
    '/fenomenos/:path*',
    '/asistente/:path*',
  ],
}
