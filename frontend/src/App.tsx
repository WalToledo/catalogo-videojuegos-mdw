import { useEffect, useState } from 'react'
import { Account } from './Account'
import { MyNote } from './MyNote'
import { Admin, type Game } from './Admin'

type View = { list: Game[] } | { game: Game } | { message: string }

const releaseFormat = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' })

export default function App() {
  if (/^\/admin\/?$/.test(window.location.pathname)) {
    return <main><Account /><a href="/">← Volver al catálogo</a><h1>Administrar catálogo</h1><Admin /></main>
  }
  return <Catalog />
}

function Catalog() {
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
    <Account />
    {path !== '/' && <a href="/">← Volver al catálogo</a>}
    <h1>{'game' in view ? view.game.title : 'Catálogo de videojuegos'}</h1>
    {'message' in view && <p role="status">{view.message}</p>}
    {'list' in view && <GameList games={view.list} />}
    {'game' in view && <dl>
      <dt>Plataforma</dt><dd>{view.game.platform}</dd>
      <dt>Fecha de lanzamiento</dt><dd><time dateTime={view.game.releaseDate}>{Number.isFinite(Date.parse(view.game.releaseDate)) ? releaseFormat.format(Date.parse(view.game.releaseDate)) : view.game.releaseDate}</time></dd>
      <dt>Máximo de jugadores</dt><dd>{view.game.maxPlayers}</dd>
    </dl>}
    {'game' in view && <MyNote gameId={view.game.id} />}
  </main>
}

function searchText(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

function GameList({ games }: { games: Game[] }) {
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('')
  if (!games.length) return <p>Todavía no hay juegos en el catálogo.</p>

  const platforms = new Map<string, string>()
  for (const game of games) {
    const key = searchText(game.platform)
    if (!platforms.has(key)) platforms.set(key, game.platform)
  }
  const query = searchText(title)
  const matches = games.filter(game => searchText(game.title).includes(query)
    && (!platform || searchText(game.platform) === platform))

  return <>
    <div className="catalog-filters" role="search" aria-label="Buscar en el catálogo">
      <label>Buscar por título<input type="search" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Plataforma<select value={platform} onChange={e => setPlatform(e.target.value)}>
        <option value="">Todas las plataformas</option>
        {[...platforms].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([key, label]) =>
          <option key={key} value={key}>{label}</option>)}
      </select></label>
      {(title || platform) && <button type="button" onClick={() => {
        setTitle('')
        setPlatform('')
      }}>Limpiar filtros</button>}
    </div>
    {matches.length
      ? <ul className="catalog-list">{matches.map(game => <li key={game.id}>
        <a href={`/juegos/${game.id}`}>
          <span className="game-title">{game.title}</span>
          <span className="game-platform">{game.platform}</span>
          <span className="row-chevron" aria-hidden="true" />
        </a>
      </li>)}</ul>
      : <p role="status">Ningún juego coincide con los filtros.</p>}
  </>
}
