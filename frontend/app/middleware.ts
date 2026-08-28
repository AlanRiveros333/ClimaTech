import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rutas que requieren solo estar autenticado (cualquier rol)
const RUTAS_PROTEGIDAS = ['/dashboard', '/registros', '/proyecciones', '/reportes']

// Rutas exclusivas del administrador
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
  const requiereSesion = RUTAS_PROTEGIDAS.some((r) => path.startsWith(r))
  const requiereAdmin = RUTAS_SOLO_ADMIN.some((r) => path.startsWith(r))

  // Sin sesión intentando entrar a una ruta protegida -> redirige a login
  if ((requiereSesion || requiereAdmin) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  // Ruta exclusiva de admin: verifica el rol en profiles
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
    '/reportes/:path*',
    '/usuarios/:path*',
    '/auditoria/:path*',
  ],
}
