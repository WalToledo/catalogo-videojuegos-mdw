import { useEffect, useState } from 'react'
import { auth } from './auth'

type Row = { id: string; email: string; role?: string | null }
const size = 20

export function Roles({ self }: { self: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(true)
  const [available, setAvailable] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      setBusy(true)
      setMessage('')
      try {
        const { data, error } = await auth.admin.listUsers({ query: { limit: size, offset: page * size, sortBy: 'email', sortDirection: 'asc' } })
        // En un despliegue con cuentas demo, la gestión puede estar deshabilitada.
        if (error?.status === 403) {
          if (active) setAvailable(false)
          return
        }
        if (error) throw error
        if (active) {
          setAvailable(true)
          setRows(data.users)
          setTotal(data.total)
        }
      } catch {
        if (active) {
          setAvailable(true)
          setRows([])
          setMessage('No pudimos cargar las cuentas.')
        }
      }
      finally { if (active) setBusy(false) }
    }
    void load()
    return () => { active = false }
  }, [page])

  async function change(user: Row) {
    const role = user.role === 'admin' ? 'user' : 'admin'
    setBusy(true)
    setMessage('')
    try {
      const { error } = await auth.admin.setRole({ userId: user.id, role })
      if (error) throw error
      setRows(list => list.map(row => row.id === user.id ? { ...row, role } : row))
      setMessage(`Rol de ${user.email} actualizado a ${role}.`)
    } catch { setMessage('No se pudo cambiar el rol.') }
    finally { setBusy(false) }
  }
  if (!available) return null

  return <section aria-labelledby="roles-title">
    <h2 id="roles-title">Roles de las cuentas</h2>
    <ul>{rows.map(user => {
      const action = user.role === 'admin' ? 'Quitar rol admin' : 'Hacer admin'
      return <li key={user.id}>
        {user.email} · {user.role ?? 'user'}{' '}
        {user.id !== self && <button disabled={busy} aria-label={`${action}: ${user.email}`} onClick={() => void change(user)}>
          {action}
        </button>}
      </li>
    })}</ul>
    {total > size && <nav aria-label="Páginas de cuentas">
      <button disabled={busy || !page} onClick={() => setPage(page - 1)}>Anterior</button>
      <button disabled={busy || (page + 1) * size >= total} onClick={() => setPage(page + 1)}>Siguiente</button>
    </nav>}
    <p role="status">{message}</p>
  </section>
}
