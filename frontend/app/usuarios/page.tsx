'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users, UserX, Search, ShieldCheck, UserCheck, UserMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import PageShell, { PageHeader, EmptyState, LoadingState, StatTile } from '@/components/page-shell'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Usuario = {
  id: string
  nombre_completo: string
  email: string
  rol: 'administrador' | 'usuario_estandar'
  estado: 'activo' | 'inactivo'
  created_at: string
}

function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function fechaEs(iso: string) {
  const f = new Date(iso)
  return Number.isNaN(f.getTime()) ? '—' : f.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function UsuariosPage() {
  const supabase = createClient()

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [miId, setMiId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actualizandoId, setActualizandoId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

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

  const total = usuarios.length
  const admins = usuarios.filter((u) => u.rol === 'administrador').length
  const activos = usuarios.filter((u) => u.estado === 'activo').length
  const inactivos = total - activos

  const termino = busqueda.trim().toLowerCase()
  const visibles = termino
    ? usuarios.filter((u) => u.nombre_completo.toLowerCase().includes(termino) || u.email.toLowerCase().includes(termino))
    : usuarios

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
      className={`badge min-h-8 gap-1.5 px-3.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        u.estado === 'activo'
          ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      <span className={`size-1.5 rounded-full ${u.estado === 'activo' ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden />
      {u.estado === 'activo' ? 'Activo' : 'Inactivo'}
    </button>
  )

  const avatar = (u: Usuario) => (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800"
    >
      {iniciales(u.nombre_completo)}
    </span>
  )

  const etiquetaTu = (u: Usuario) =>
    u.id === miId && <span className="badge ml-2 bg-slate-100 text-slate-600">Tú</span>

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        title="Gestión de usuarios"
        description="Cambia roles y activa o desactiva cuentas."
      />

      {!cargando && total > 0 && (
        <section aria-label="Resumen de usuarios" className="card grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden lg:grid-cols-4 lg:divide-y-0">
          <StatTile icon={Users} label="Usuarios" value={total} />
          <StatTile icon={ShieldCheck} label="Administradores" value={admins} />
          <StatTile icon={UserCheck} label="Cuentas activas" value={activos} />
          <StatTile icon={UserMinus} label="Cuentas inactivas" value={inactivos} />
        </section>
      )}

      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <p className="text-sm text-slate-600">
            {termino ? `${visibles.length} de ${total} usuarios` : `${total} usuarios`}
          </p>
          <div className="relative w-full sm:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="buscar-usuario" className="sr-only">
              Buscar usuario por nombre o correo
            </label>
            <input
              id="buscar-usuario"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o correo"
              className="input pl-9"
            />
          </div>
        </div>

        {cargando ? (
          <div className="px-5">
            <LoadingState text="Cargando usuarios…" />
          </div>
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={UserX}
            title={termino ? 'Ningún usuario coincide' : 'No hay usuarios registrados'}
            text={termino ? 'Prueba con otro nombre o correo.' : 'Los usuarios aparecerán aquí cuando se registren.'}
          />
        ) : (
          <>
            {/* Tabla: tablet y escritorio */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th scope="col" className="th pl-5">Usuario</th>
                    <th scope="col" className="th">Rol</th>
                    <th scope="col" className="th">Alta</th>
                    <th scope="col" className="th pr-5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {visibles.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          {avatar(u)}
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">
                              {u.nombre_completo}
                              {etiquetaTu(u)}
                            </p>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">{selectorRol(u)}</td>
                      <td className="px-3 py-3 tabular-nums text-slate-600">{fechaEs(u.created_at)}</td>
                      <td className="py-3 pl-3 pr-5">{botonEstado(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tarjetas: celular */}
            <ul className="divide-y divide-slate-100 px-5 md:hidden">
              {visibles.map((u) => (
                <li key={u.id} className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      {avatar(u)}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {u.nombre_completo}
                          {etiquetaTu(u)}
                        </p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                      </div>
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
