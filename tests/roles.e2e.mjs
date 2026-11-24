import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const backend = new URL('../backend/', import.meta.url)
const frontend = new URL('../frontend/', import.meta.url)
const { MongoClient } = createRequire(new URL('package.json', backend))('mongodb')
const frontendRequire = createRequire(new URL('package.json', frontend))
const playwrightHome = process.env.PLAYWRIGHT_HOME ?? '/tmp/opencode/catalogo-stage7-qa'
const { chromium } = createRequire(`${playwrightHome}/package.json`)('playwright-core')
const { preview } = await import(pathToFileURL(frontendRequire.resolve('vite')).href)

const backendPort = Number(process.env.ROLES_BACKEND_PORT ?? 38193)
const webPort = Number(process.env.ROLES_WEB_PORT ?? 38194)
const backendUrl = `http://127.0.0.1:${backendPort}`
const origin = `http://127.0.0.1:${webPort}`
const mongoUrl = 'mongodb://127.0.0.1:27017'
const password = randomBytes(24).toString('hex')
const adminEmail = 'roles-admin@example.com'
const userEmail = 'roles-user@example.com'
const game = { title: 'Juego de prueba de roles', platform: 'PC', releaseDate: '2025-01-01', maxPlayers: 2 }

async function status(response, expected) {
  assert.equal(response.status(), expected,
    `${response.url()}: ${response.status() === expected ? '' : await response.text()}`)
  return response
}

async function signedInPage(browser, email) {
  const context = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { origin } })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await page.getByText(`Sesión de ${email}`, { exact: true }).waitFor()
  return page
}

async function session(page, role, previousId) {
  const response = await status(await page.request.get('/api/auth/get-session'), 200)
  const current = await response.json()
  assert.equal(current.user.role, role)
  assert.ok(current.session.id)
  if (previousId) assert.equal(current.session.id, previousId, 'la sesión original debe seguir activa')
  return current
}

async function blocked(page, userId, gameId) {
  await page.getByText('No tenés permisos para administrar el catálogo.', { exact: true }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Roles de las cuentas' }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Crear juego' }).count(), 0)
  await status(await page.request.get('/api/auth/admin/list-users'), 403)
  await status(await page.request.post('/api/auth/admin/set-role', { data: { userId, role: 'admin' } }), 403)
  await status(await page.request.post('/api/games', { data: game }), 403)
  await status(await page.request.patch(`/api/games/${gameId}`, { data: { platform: 'Switch' } }), 403)
  await status(await page.request.delete(`/api/games/${gameId}`), 403)
}

async function withTestServices(enableRoles, exercise) {
  assert.ok(backendPort && webPort && backendPort !== webPort, 'Usá dos puertos HTTP exclusivos y distintos')
  const mongo = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 4000 })
  const dbName = `catalogo_roles_test_${randomBytes(8).toString('hex')}`
  let db
  let server
  let web
  let browser
  try {
    await mongo.connect()
    db = mongo.db(dbName)
    process.env.API_PROXY_TARGET = backendUrl
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      MONGODB_URI: `${mongoUrl}/${dbName}`,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: origin,
      PORT: String(backendPort),
    }
    delete env.ENABLE_ROLE_MANAGEMENT
    if (enableRoles) env.ENABLE_ROLE_MANAGEMENT = 'true'
    server = spawn(process.execPath, ['dist/server.js'], {
      cwd: fileURLToPath(backend),
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    const stopped = once(server, 'exit')
    await Promise.race([
      once(server.stdout, 'data'),
      stopped.then(([code]) => { throw new Error(`El backend terminó antes de escuchar (código ${code})`) }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('El backend no inició a tiempo')), 8000).unref()
      }),
    ])
    web = await preview({ root: fileURLToPath(frontend), preview: { host: '127.0.0.1', port: webPort, strictPort: true } })
    assert.equal((await fetch(`${origin}/api/health`)).status, 200)

    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' })
    const setup = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { origin } })
    await status(await setup.request.get('/api/auth/admin/list-users'), 401)
    await status(await setup.request.post('/api/auth/admin/set-role', { data: { userId: 'x', role: 'admin' } }), 401)
    for (const email of [adminEmail, userEmail]) {
      const signup = await status(await setup.request.post('/api/auth/sign-up/email', {
        data: { name: email, email, password },
      }), 200)
      assert.equal((await signup.json()).user.role, 'user')
    }
    await setup.close()
    const seeded = await db.collection('user').updateOne({ email: adminEmail }, { $set: { role: 'admin' } })
    assert.equal(seeded.modifiedCount, 1, 'solo se promueve por Mongo al primer administrador')
    await exercise(browser)
  } finally {
    try {
      await browser?.close()
      await web?.close()
    } finally {
      if (server?.pid && server.exitCode === null && server.signalCode === null) {
        const exit = once(server, 'exit')
        server.kill()
        await exit
      }
      try {
        await db?.dropDatabase()
      } finally {
        await mongo.close()
      }
    }
  }
}

test('promoción y degradación con una sesión real en UI y API', { timeout: 75_000 }, async () => {
  await withTestServices(true, async (browser) => {
    const admin = await signedInPage(browser, adminEmail)
    await admin.getByRole('link', { name: 'Administrar catálogo' }).click()
    const roles = admin.getByRole('region', { name: 'Roles de las cuentas' })
    const promote = roles.getByRole('button', { name: `Hacer admin: ${userEmail}` })
    await promote.waitFor()
    const initialAdmin = await session(admin, 'admin')
    assert.equal(await roles.getByRole('listitem').filter({ hasText: adminEmail }).getByRole('button').count(), 0)
    const selfChange = await status(await admin.request.post('/api/auth/admin/set-role', {
      data: { userId: initialAdmin.user.id, role: 'user' },
    }), 403)
    assert.equal((await selfChange.json()).code, 'SELF_ROLE_CHANGE')
    const created = await status(await admin.request.post('/api/games', { data: game }), 201)
    const { id: gameId } = await created.json()
    assert.ok(gameId)

    const user = await signedInPage(browser, userEmail)
    assert.equal(await user.getByRole('link', { name: 'Administrar catálogo' }).count(), 0)
    await user.goto('/admin')
    const initialUser = await session(user, 'user')
    await blocked(user, initialUser.user.id, gameId)
    await status(await admin.request.post('/api/auth/admin/set-role', {
      data: { userId: initialUser.user.id, role: ['user', 'admin'] },
    }), 400)

    await promote.click()
    await roles.getByText(`Rol de ${userEmail} actualizado a admin.`, { exact: true }).waitFor()
    await session(user, 'admin', initialUser.session.id)
    await status(await user.request.get('/api/auth/admin/list-users'), 200)
    await status(await user.request.patch(`/api/games/${gameId}`, { data: { platform: 'Switch' } }), 200)
    await user.reload()
    await user.getByRole('heading', { name: 'Roles de las cuentas' }).waitFor()
    await user.getByRole('link', { name: game.title }).waitFor()
    await user.getByRole('button', { name: 'Crear juego' }).waitFor()

    await roles.getByRole('button', { name: `Quitar rol admin: ${userEmail}` }).click()
    await roles.getByText(`Rol de ${userEmail} actualizado a user.`, { exact: true }).waitFor()
    await session(user, 'user', initialUser.session.id)
    await user.reload()
    await blocked(user, initialUser.user.id, gameId)
    assert.equal((await (await status(await user.request.get(`/api/games/${gameId}`), 200)).json()).platform, 'Switch')
    await status(await admin.request.delete(`/api/games/${gameId}`), 204)
    await session(admin, 'admin', initialAdmin.session.id)
  })
})

test('producción conserva el CRUD, pero deshabilita la gestión de roles por defecto', { timeout: 45_000 }, async () => {
  await withTestServices(false, async (browser) => {
    const admin = await signedInPage(browser, adminEmail)
    const list = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/admin/list-users')
    await admin.getByRole('link', { name: 'Administrar catálogo' }).click()
    await status(await list, 403)
    await admin.getByRole('button', { name: 'Crear juego' }).waitFor()
    assert.equal(await admin.getByRole('heading', { name: 'Roles de las cuentas' }).count(), 0)

    const user = await signedInPage(browser, userEmail)
    const userSession = await session(user, 'user')
    await status(await admin.request.post('/api/auth/admin/set-role', {
      data: { userId: userSession.user.id, role: 'admin' },
    }), 403)
    const created = await status(await admin.request.post('/api/games', { data: game }), 201)
    const { id } = await created.json()
    await status(await admin.request.delete(`/api/games/${id}`), 204)
    await session(user, 'user', userSession.session.id)
  })
})
