import { useEffect, useState } from 'react'

type Game = { id: string; title: string; platform: string; releaseDate: string; maxPlayers: number }
type View = { list: Game[] } | { game: Game } | { message: string }

export default function App() {
  const [view, setView] = useState<View>({ message: 'Cargando catálogo…' })
  const path = window.location.pathname
  const id = /^\/juegos\/([a-f\d]{24})\/?$/i.exec(path)?.[1]

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      if (!id && path !== '/') {
        setView({ message: 'No encontramos esta página.' })
        return
      }
      try {
        const response = await fetch(id ? `/api/games/${id}` : '/api/games', { signal: controller.signal })
        if (id && response.status === 404) {
          setView({ message: 'Este juego no está en el catálogo.' })
          return
        }
        if (!response.ok) throw new Error()
        const data = await response.json()
        setView(id ? { game: data } : { list: data })
      } catch {
        if (!controller.signal.aborted) setView({ message: 'No pudimos cargar el catálogo. Probá recargar la página.' })
      }
    }
    void load()
    return () => controller.abort()
  }, [id, path])

  return <main>
    {path !== '/' && <a href="/">← Volver al catálogo</a>}
    <h1>{'game' in view ? view.game.title : 'Catálogo de videojuegos'}</h1>
    {'message' in view && <p role="status">{view.message}</p>}
    {'list' in view && (view.list.length
      ? <ul>{view.list.map(game => <li key={game.id}><a href={`/juegos/${game.id}`}>{game.title}</a> · {game.platform}</li>)}</ul>
      : <p>Todavía no hay juegos en el catálogo.</p>)}
    {'game' in view && <dl>
      <dt>Plataforma</dt><dd>{view.game.platform}</dd>
      <dt>Fecha de lanzamiento</dt><dd><time dateTime={view.game.releaseDate}>{view.game.releaseDate}</time></dd>
      <dt>Máximo de jugadores</dt><dd>{view.game.maxPlayers}</dd>
    </dl>}
  </main>
}
