'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users, UserX } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, EmptyState, LoadingState } from '@/components/page-shell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Usuario = {
  id: string
  nombre_completo: string
  email: string
  rol: 'administrador' | 'usuario_estandar'
  estado: 'activo' | 'inactivo'
  created_at: string
}

export default function UsuariosPage() {
  const supabase = createClient()

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [miId, setMiId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actualizandoId, setActualizandoId] = useState<string | null>(null)

  const cargarUsuarios = useCallback(async () => {
    setCargando(true)
    setError(null)

    const {
      data: { session, user },
    } = await (async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      return { data: { session: sessionData.session, user: sessionData.session?.user ?? null } }
    })()

    if (!session) {
      setError('Sesión expirada, vuelve a iniciar sesión.')
      setCargando(false)
      return
    }
    setMiId(user?.id ?? null)

    try {
      const res = await fetch(`${API_URL}/usuarios`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'No se pudo cargar la lista de usuarios.')
        setCargando(false)
        return
      }

      setUsuarios(data)
    } catch {
      setError('No se pudo conectar con el servidor backend.')
    } finally {
      setCargando(false)
    }
  }, [supabase])

  useEffect(() => {
    cargarUsuarios()
  }, [cargarUsuarios])

  async function actualizar(userId: string, cambios: { rol?: string; estado?: string }) {
    setActualizandoId(userId)
    setError(null)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      setError('Sesión expirada, vuelve a iniciar sesión.')
      setActualizandoId(null)
      return
    }

    try {
      const res = await fetch(`${API_URL}/usuarios/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(cambios),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'No se pudo actualizar el usuario.')
        setActualizandoId(null)
        return
      }

      await cargarUsuarios()
    } catch {
      setError('No se pudo conectar con el servidor backend.')
    } finally {
      setActualizandoId(null)
    }
  }

  const selectorRol = (u: Usuario) => (
    <select
      value={u.rol}
      disabled={u.id === miId || actualizandoId === u.id}
      onChange={(e) => actualizar(u.id, { rol: e.target.value })}
      aria-label={`Rol de ${u.nombre_completo}`}
      className="input w-auto min-w-[10rem] py-1.5 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
    >
      <option value="usuario_estandar">Usuario estándar</option>
      <option value="administrador">Administrador</option>
    </select>
  )

  const botonEstado = (u: Usuario) => (
    <button
      disabled={u.id === miId || actualizandoId === u.id}
      onClick={() => actualizar(u.id, { estado: u.estado === 'activo' ? 'inactivo' : 'activo' })}
      aria-label={`${u.estado === 'activo' ? 'Desactivar' : 'Activar'} cuenta de ${u.nombre_completo}`}
      className={`badge min-h-8 px-3.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        u.estado === 'activo'
          ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {u.estado === 'activo' ? 'Activo' : 'Inactivo'}
    </button>
  )

  const etiquetaTu = (u: Usuario) =>
    u.id === miId && <span className="badge ml-2 bg-slate-100 text-slate-600">Tú</span>

  return (
    <PageShell width="max-w-4xl">
      <PageHeader
        icon={Users}
        title="Gestión de usuarios"
        description="Cambia roles y activa o desactiva cuentas."
      />

      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      <section className="card p-5 sm:p-6">
        {cargando ? (
          <LoadingState text="Cargando usuarios…" />
        ) : usuarios.length === 0 ? (
          <EmptyState icon={UserX} title="No hay usuarios registrados" text="Los usuarios aparecerán aquí cuando se registren." />
        ) : (
          <>
            {/* Tabla: tablet y escritorio */}
            <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th scope="col" className="px-5 py-2.5 sm:px-6">Nombre</th>
                    <th scope="col" className="px-3 py-2.5">Correo</th>
                    <th scope="col" className="px-3 py-2.5">Rol</th>
                    <th scope="col" className="px-5 py-2.5 sm:px-6">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {usuarios.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900 sm:px-6">
                        {u.nombre_completo}
                        {etiquetaTu(u)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{u.email}</td>
                      <td className="px-3 py-3">{selectorRol(u)}</td>
                      <td className="px-5 py-3 sm:px-6">{botonEstado(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tarjetas: celular */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {usuarios.map((u) => (
                <li key={u.id} className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {u.nombre_completo}
                        {etiquetaTu(u)}
                      </p>
                      <p className="truncate text-sm text-slate-600">{u.email}</p>
                    </div>
                    {botonEstado(u)}
                  </div>
                  {selectorRol(u)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="text-xs text-slate-500">
        No puedes cambiar tu propio rol o estado desde aquí, por seguridad.
      </p>
    </PageShell>
  )
}
