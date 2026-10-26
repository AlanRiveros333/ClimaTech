'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/nav-bar'
import PageHeader from '@/components/page-header'

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
    <div className="min-h-dvh">
      <NavBar />
      <main id="contenido" className="page space-y-6 py-8 sm:py-10">
        <PageHeader
          titulo="Gestión de usuarios"
          descripcion="Cambia roles y activa o desactiva cuentas."
        />

        {error && (
          <p role="alert" className="alert alert-error">
            {error}
          </p>
        )}

        <section className="card overflow-hidden">
          {cargando ? (
            <div className="divide-y divide-line" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-6 px-6 py-4">
                  <div className="skeleton h-5 w-40" />
                  <div className="skeleton hidden h-5 w-56 sm:block" />
                  <div className="skeleton ml-auto h-9 w-36" />
                </div>
              ))}
            </div>
          ) : usuarios.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="font-medium text-ink">No hay usuarios registrados</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">
                Las cuentas aparecerán aquí cuando las personas se registren desde la pantalla de
                inicio.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-canvas text-xs font-medium text-ink-2">
                    <th scope="col" className="px-6 py-2.5">
                      Nombre
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Email
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Rol
                    </th>
                    <th scope="col" className="px-6 py-2.5">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {usuarios.map((u) => {
                    const esUnoMismo = u.id === miId
                    const actualizando = actualizandoId === u.id
                    const activo = u.estado === 'activo'
                    return (
                      <tr
                        key={u.id}
                        className="text-ink transition-colors duration-150 hover:bg-canvas/70"
                      >
                        <td className="px-6 py-3 font-medium">
                          {u.nombre_completo}
                          {esUnoMismo && (
                            <span className="badge ml-2 bg-canvas text-ink-2">Tú</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-ink-2">{u.email}</td>
                        <td className="px-3 py-3">
                          <select
                            aria-label={`Rol de ${u.nombre_completo}`}
                            value={u.rol}
                            disabled={esUnoMismo || actualizando}
                            onChange={(e) => actualizar(u.id, { rol: e.target.value })}
                            className="field w-auto py-1.5 disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-60"
                          >
                            <option value="usuario_estandar">Usuario estándar</option>
                            <option value="administrador">Administrador</option>
                          </select>
                        </td>
                        <td className="px-6 py-3">
                          <button
                            type="button"
                            disabled={esUnoMismo || actualizando}
                            aria-label={`${activo ? 'Desactivar' : 'Activar'} cuenta de ${u.nombre_completo}`}
                            onClick={() =>
                              actualizar(u.id, {
                                estado: activo ? 'inactivo' : 'activo',
                              })
                            }
                            className={`badge min-h-8 gap-2 px-3 transition-[background-color,transform] duration-150 ease-out-strong active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${
                              activo
                                ? 'bg-success-soft text-success hover:bg-success-soft/70'
                                : 'bg-canvas text-ink-2 hover:bg-line'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`size-1.5 rounded-full ${activo ? 'bg-success' : 'bg-ink-3'}`}
                            />
                            {activo ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-ink-3">
          No puedes cambiar tu propio rol o estado desde aquí, por seguridad.
        </p>
      </main>
    </div>
  )
}
