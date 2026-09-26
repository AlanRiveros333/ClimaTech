'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/nav-bar'

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EAF8FD] to-white">
      <NavBar />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0B4F6C]/10">
            <Users size={22} color="#0B4F6C" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Gestión de usuarios</h1>
            <p className="text-sm text-slate-500">Cambia roles y activa o desactiva cuentas</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {cargando ? (
            <p className="text-sm text-slate-400">Cargando...</p>
          ) : usuarios.length === 0 ? (
            <p className="text-sm text-slate-400">No hay usuarios registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4">Nombre</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Rol</th>
                    <th className="py-2 pr-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => {
                    const esUnoMismo = u.id === miId
                    const actualizando = actualizandoId === u.id
                    return (
                      <tr key={u.id} className="border-b border-slate-100 text-slate-700">
                        <td className="py-2 pr-4">
                          {u.nombre_completo}
                          {esUnoMismo && (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              Tú
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-slate-500">{u.email}</td>
                        <td className="py-2 pr-4">
                          <select
                            value={u.rol}
                            disabled={esUnoMismo || actualizando}
                            onChange={(e) => actualizar(u.id, { rol: e.target.value })}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="usuario_estandar">Usuario estándar</option>
                            <option value="administrador">Administrador</option>
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            disabled={esUnoMismo || actualizando}
                            onClick={() =>
                              actualizar(u.id, {
                                estado: u.estado === 'activo' ? 'inactivo' : 'activo',
                              })
                            }
                            className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              u.estado === 'activo'
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {u.estado === 'activo' ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400">
          No puedes cambiar tu propio rol o estado desde aquí, por seguridad.
        </p>
      </div>
    </div>
  )
}
