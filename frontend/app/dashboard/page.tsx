import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'
import LogoutButton from './logout-button'

export default async function DashboardPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">
            Hola, {profile.nombre_completo}
          </h1>
          <LogoutButton />
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-slate-100 py-2">
            <dt className="text-slate-500">Rol</dt>
            <dd className="font-medium text-slate-900">{profile.rol}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-2">
            <dt className="text-slate-500">Estado</dt>
            <dd className="font-medium text-slate-900">{profile.estado}</dd>
          </div>
        </dl>

        <p className="mt-6 text-sm text-slate-400">
          Aquí irán los módulos de registros, proyecciones y reportes en las siguientes fases.
        </p>
      </div>
    </div>
  )
}
