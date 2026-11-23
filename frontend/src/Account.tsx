import { useState } from 'react'
import { auth } from './auth'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const credentials = z.object({
  email: z.email('Ingresá un email válido.'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
  name: z.string().optional(),
})
const registration = credentials.extend({
  name: z.string().trim().min(1, 'Ingresá tu nombre.'),
  password: z.string().min(8, 'Usá al menos 8 caracteres.'),
})

function AccessForm({ signup }: { signup: boolean }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<z.infer<typeof credentials>>({ resolver: zodResolver(signup ? registration : credentials) })

  const submit = handleSubmit(async ({ name, email, password }) => {
    try {
      const result = signup
        ? await auth.signUp.email({ name: name!, email, password })
        : await auth.signIn.email({ email, password })
      if (result.error) setError('root', { message: signup ? 'No se pudo crear la cuenta. Revisá los datos e intentá de nuevo.' : 'No se pudo ingresar. Revisá el email y la contraseña.' })
    } catch {
      setError('root', { message: 'No se pudo conectar con el servidor.' })
    }
  })

  return <form noValidate onSubmit={submit}>
    {signup && <label>Nombre<input autoComplete="name" {...register('name')} aria-describedby="nombre-error" /><small id="nombre-error">{errors.name?.message}</small></label>}
    <label>Email<input type="email" autoComplete="email" {...register('email')} aria-describedby="email-error" /><small id="email-error">{errors.email?.message}</small></label>
    <label>Contraseña<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} {...register('password')} aria-describedby="clave-error" /><small id="clave-error">{errors.password?.message}</small></label>
    {errors.root && <p role="alert">{errors.root.message}</p>}
    <button disabled={isSubmitting}>{signup ? 'Registrarme' : 'Ingresar'}</button>
  </form>
}

export function Account() {
  const { data, isPending, error, refetch } = auth.useSession()
  const [mode, setMode] = useState<'login' | 'signup' | null>(null)
  const [closing, setClosing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [githubError, setGithubError] = useState(
    new URLSearchParams(window.location.search).has('github-error'),
  )

  async function loginWithGitHub() {
    setConnecting(true)
    setGithubError(false)
    try {
      const result = await auth.signIn.social({
        provider: 'github',
        callbackURL: window.location.origin,
        errorCallbackURL: `${window.location.origin}/?github-error=1`,
      })
      if (result.error) setGithubError(true)
    } catch { setGithubError(true) }
    finally { setConnecting(false) }
  }

  async function logout() {
    setClosing(true)
    setFailed(false)
    try {
      const result = await auth.signOut()
      if (result.error) setFailed(true)
      else setMode(null)
    } catch { setFailed(true) }
    finally { setClosing(false) }
  }

  return <section aria-label="Mi cuenta" className="account">
    {isPending ? <span>Consultando sesión…</span> : error ? <>
      <span>No pudimos consultar tu sesión.</span> <button onClick={() => void refetch()}>Reintentar</button>
    </> : data ? <>
      <span>Sesión de {data.user.email}</span> <button onClick={logout} disabled={closing}>Cerrar sesión</button>
      {data.user.role === 'admin' && window.location.pathname !== '/admin' && <a href="/admin">Administrar catálogo</a>}
      {failed && <p role="alert">No se pudo cerrar la sesión.</p>}
    </> : <>
      <button aria-expanded={mode === 'login'} onClick={() => setMode(mode === 'login' ? null : 'login')}>Iniciar sesión</button>
      <button aria-expanded={mode === 'signup'} onClick={() => setMode(mode === 'signup' ? null : 'signup')}>Crear cuenta</button>
      <button onClick={loginWithGitHub} disabled={connecting}>Continuar con GitHub</button>
      {githubError && <p role="alert">No se pudo iniciar sesión con GitHub. Podés volver a intentar o ingresar con email.</p>}
      {mode && <AccessForm key={mode} signup={mode === 'signup'} />}
    </>}
  </section>
}
