import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { auth } from './auth'

const schema = z.object({
  title: z.string().trim().min(1, 'Ingresá un título.'),
  platform: z.string().trim().min(1, 'Ingresá una plataforma.'),
  releaseDate: z.iso.date('Ingresá una fecha válida.'),
  maxPlayers: z.number('Ingresá un número.').int('Usá un número entero.').min(1, 'Debe haber al menos un jugador.'),
})
type Fields = z.infer<typeof schema>
export type Game = Fields & { id: string }

export function Admin() {
  const { data, isPending, error } = auth.useSession()
  if (isPending) return <p>Consultando permisos…</p>
  if (error) return <p role="alert">No pudimos verificar tus permisos.</p>
  if (!data) return <p>Iniciá sesión con una cuenta administradora para acceder.</p>
  if (data.user.role !== 'admin') return <p>No tenés permisos para administrar el catálogo.</p>
  return <Panel key={data.user.id} />
}

function Panel() {
  const [games, setGames] = useState<Game[] | null>(null)
  const [editing, setEditing] = useState<Game | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/games', { signal: controller.signal })
        if (!response.ok) throw new Error()
        setGames(await response.json())
      } catch {
        if (!controller.signal.aborted) setMessage('No pudimos cargar los juegos. Recargá la página para reintentar.')
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  async function mutate(method: 'POST' | 'PATCH' | 'DELETE', id?: string, fields?: Partial<Fields>) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(id ? `/api/games/${id}` : '/api/games', {
        method, headers: fields ? { 'Content-Type': 'application/json' } : undefined,
        body: JSON.stringify(fields),
      })
      if (!response.ok) {
        setMessage(({ 400: 'Revisá los datos del juego.', 401: 'Tu sesión venció. Volvé a ingresar.',
          403: 'No tenés permisos.', 404: 'El juego ya no existe. Recargá el listado.' } as Record<number, string>)[response.status] ?? 'No se pudo guardar el cambio.')
        return false
      }
      if (method === 'DELETE') {
        setGames(list => list!.filter(g => g.id !== id))
      } else {
        const saved: Game = await response.json()
        setGames(list => id ? list!.map(g => g.id === id ? saved : g) : [...list!, saved])
      }
      if (!id || editing?.id === id) setEditing(null)
      setMessage(method === 'DELETE' ? 'Juego eliminado.' : 'Juego guardado.')
      return true
    } catch {
      setMessage('No se pudo conectar con el servidor.')
      return false
    } finally { setBusy(false) }
  }

  return <>
    {message && <p role="status">{message}</p>}
    {games === null ? (!message && <p>Cargando juegos…</p>) : <>
      <GameForm key={editing?.id ?? 'new'} game={editing} busy={busy} cancel={() => setEditing(null)}
        save={fields => mutate(editing ? 'PATCH' : 'POST', editing?.id, fields)} />
      <h2>Juegos del catálogo</h2>
      {!games.length ? <p>Todavía no hay juegos.</p> : <ul>{games.map(game => <li key={game.id}>
        <a href={`/juegos/${game.id}`}>{game.title}</a> · {game.platform}{' '}
        <button disabled={busy} onClick={() => { setEditing(game); setMessage('') }}>Editar</button>{' '}
        <button disabled={busy} onClick={() => {
          if (window.confirm(`¿Eliminar «${game.title}» del catálogo?`)) void mutate('DELETE', game.id)
        }}>Eliminar</button>
      </li>)}</ul>}
    </>}
  </>
}

function GameForm({ game, busy, cancel, save }: {
  game: Game | null; busy: boolean; cancel: () => void; save: (fields: Partial<Fields>) => Promise<boolean>
}) {
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<Fields>({
    resolver: zodResolver(schema), defaultValues: game ?? { title: '', platform: '', releaseDate: '', maxPlayers: 1 },
  })
  const labels = { title: 'Título', platform: 'Plataforma', releaseDate: 'Fecha de lanzamiento', maxPlayers: 'Máximo de jugadores' }
  return <form className="game-form" noValidate onSubmit={handleSubmit(async values => {
    const changes = game ? Object.fromEntries(Object.entries(values).filter(([key, value]) => game[key as keyof Fields] !== value)) : values
    if (!Object.keys(changes).length) { cancel(); return }
    if (await save(changes) && !game) reset()
  })}>
    <h2>{game ? `Editar: ${game.title}` : 'Nuevo juego'}</h2>
    <fieldset disabled={busy}>
      {(Object.keys(labels) as (keyof Fields)[]).map(key => <label key={key}>{labels[key]}
        <input type={key === 'maxPlayers' ? 'number' : key === 'releaseDate' ? 'date' : 'text'}
          {...register(key, { valueAsNumber: key === 'maxPlayers' })} aria-describedby={`${key}-error`} />
        <small id={`${key}-error`}>{errors[key]?.message}</small>
      </label>)}
      <button disabled={Boolean(game) && !isDirty}>{game ? 'Guardar cambios' : 'Crear juego'}</button>
      {game && <button type="button" onClick={cancel}>Cancelar</button>}
    </fieldset>
  </form>
}
