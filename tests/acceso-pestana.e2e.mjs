import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const frontend = new URL('../frontend/', import.meta.url)
const requireFrontend = createRequire(new URL('package.json', frontend))
const { preview } = await import(pathToFileURL(requireFrontend.resolve('vite')).href)
const playwrightHome = process.env.PLAYWRIGHT_HOME ?? '/tmp/opencode/catalogo-stage7-qa'
const { chromium } = createRequire(`${playwrightHome}/package.json`)('playwright-core')

test('conserva los campos de acceso cuando la pestaña vuelve a estar visible', { timeout: 30_000 }, async t => {
  const web = await preview({
    root: fileURLToPath(frontend),
    preview: { host: '127.0.0.1', port: 0 },
  })
  t.after(() => web.close())
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' })
  t.after(() => browser.close())

  for (const mode of ['Iniciar sesión', 'Crear cuenta']) {
    await t.test(mode, async () => {
      const page = await browser.newPage()
      try {
        await page.route('**/api/games', route => route.fulfill({ json: [] }))
        await page.route('**/api/auth/get-session', route => route.fulfill({ body: 'null', contentType: 'application/json' }))
        await page.goto(web.resolvedUrls.local[0])
        await page.getByRole('button', { name: mode, exact: true }).click()
        const email = page.getByLabel('Email', { exact: true })
        const password = page.getByLabel('Contraseña', { exact: true })
        if (mode === 'Crear cuenta') await page.getByLabel('Nombre').fill('Prueba')
        await email.fill('prueba@example.com')
        await password.fill('clave-de-prueba')

        // Retenemos la respuesta para que React llegue a mostrar el estado pendiente.
        const refresh = Promise.withResolvers()
        await page.route('**/api/auth/get-session', route => refresh.resolve(route), { times: 1 })
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
        const route = await refresh.promise
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        assert.equal(await email.count(), 1, 'el formulario debe seguir montado mientras se consulta la sesión')
        await route.fulfill({ body: 'null', contentType: 'application/json' })
        await page.getByRole('button', { name: mode, exact: true }).waitFor()
        assert.equal(await email.inputValue(), 'prueba@example.com')
        assert.equal(await password.inputValue(), 'clave-de-prueba')
        if (mode === 'Crear cuenta') assert.equal(await page.getByLabel('Nombre').inputValue(), 'Prueba')
      } finally {
        await page.close()
      }
    })
  }
})
