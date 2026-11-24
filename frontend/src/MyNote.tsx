import { useEffect, useState, type FormEvent } from 'react'
import { auth } from './auth'

export function MyNote({ gameId }: { gameId: string }) {
  const { data, isPending } = auth.useSession()
  return !isPending && data ? <Editor key={`${gameId}:${data.user.id}`} gameId={gameId} /> : null
}

function Editor({ gameId }: { gameId: string }) {
  const url = `/api/games/${gameId}/my-note`
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error()
        const note: { text: string } = await res.json()
        if (!controller.signal.aborted) setText(note.text)
      } catch {
        if (!controller.signal.aborted) setMessage('No pudimos cargar tu nota.')
      }
    }
    void load()
    return () => controller.abort()
  }, [url])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !text?.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error()
      const note: { text: string } = await res.json()
      setText(note.text)
      setMessage('Nota guardada.')
    } catch {
      setMessage('No pudimos guardar tu nota.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="note-form" onSubmit={save}>
    <label>
      Mi nota privada
      <textarea
        aria-describedby="note-help"
        disabled={text === null || busy}
        value={text ?? ''}
        maxLength={2000}
        rows={4}
        onChange={event => { setText(event.target.value); setMessage('') }}
      />
    </label>
    <p id="note-help">Solo vos podés verla. Hasta 2000 caracteres.</p>
    <button type="submit" disabled={!text?.trim() || busy}>Guardar nota</button>
    <p role="status">{message || (text === null ? 'Cargando nota…' : '')}</p>
  </form>
}
