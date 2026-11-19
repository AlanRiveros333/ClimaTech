import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'

// El panel de módulos se reemplazó por el asistente, que concentra todas las funciones.
// Se mantiene esta ruta para que el inicio de sesión (que redirige a /dashboard) siga funcionando.
export default async function DashboardPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  redirect('/asistente')
}
