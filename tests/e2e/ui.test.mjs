// Browser end to end (headless Chromium via playwright-core): the flows a person goes through.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { BASE, client, clearRateLimits, lastResetToken, sql, uniqueEmail } from './helpers.mjs'

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
const skip = !existsSync(CHROMIUM) && `no Chromium at ${CHROMIUM} (set CHROMIUM_PATH)`

describe('browser', { skip }, () => {
  let browser, page
  const problems = []
  const email = uniqueEmail('ui')
  const PW = 'correct horse battery'
  let drillResults = ''

  before(async () => {
    clearRateLimits()
    const { chromium } = await import('playwright-core')
    browser = await chromium.launch({ executablePath: CHROMIUM })
    const ctx = await browser.newContext({ locale: 'es-ES', viewport: { width: 390, height: 844 }, acceptDownloads: true })
    page = await ctx.newPage()
    page.on('pageerror', (e) => problems.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error' && !/401|Content Security/.test(m.text())) problems.push(m.text()) })
    page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) problems.push('CSP: ' + m.text()) })
    page.on('dialog', (d) => d.accept())
  })
  after(async () => { await browser?.close() })

  it('signs up in Spanish', async () => {
    await page.goto(BASE + '/')
    assert.match(await page.locator('h1').first().textContent(), /Práctica para las certificaciones de Claude/)
    await page.getByRole('button', { name: 'Crear cuenta' }).first().click()
    await page.fill('#name', 'UI'); await page.fill('#email', email); await page.fill('#password', PW)
    await page.locator('input[type=checkbox]').check()
    await page.locator('form button.btn-primary').click()
    // A new account picks what to prepare first
    await page.waitForSelector('.pick-grid')
    assert.equal(await page.locator('h1').first().textContent(), '¿Qué certificación vas a preparar?')
    assert.equal(await page.locator('.pick-tile').count(), 4)
    await page.getByRole('button', { name: 'Preparar Claude Certified Developer – Foundations' }).click()
    await page.waitForSelector('.tabbar')
    assert.equal(await page.locator('h1').first().textContent(), 'Hoy')
    assert.match(await page.locator('.brand-switch').textContent(), /CCDV-F/)
  })

  it('runs exam simulations in English', async () => {
    await page.goto(BASE + '/#/exams')
    await page.getByRole('button', { name: /Mock rápido/ }).click()
    await page.waitForSelector('.exam')
    assert.match(await page.locator('.exam-foot').textContent(), /Flag/)
    await page.locator('.exam-head button.mono').click()
    await page.getByRole('button', { name: 'Discard attempt' }).click()
    await page.waitForSelector('.topbar')
  })

  it('runs drills in Spanish and charts the result', async () => {
    await page.goto(BASE + '/#/domains')
    await page.getByRole('button', { name: 'Drill', exact: true }).first().click()
    await page.waitForSelector('.exam')
    for (let i = 0; i < 10; i++) {
      const need = Number((await page.locator('.chip', { hasText: /Selecciona/ }).first().textContent()).match(/\d/)[0])
      for (let k = 0; k < need; k++) await page.locator('.option').nth(k).click()
      await page.getByRole('button', { name: 'Comprobar' }).click()
      const submit = page.getByRole('button', { name: 'Entregar' })
      if (await submit.count()) { await submit.first().click(); await page.locator('dialog[open] button.btn-primary').click(); break }
      await page.getByRole('button', { name: 'Siguiente' }).click()
    }
    await page.waitForURL(/#\/results\//)
    drillResults = page.url()
    await page.goto(BASE + '/#/progress')
    await page.waitForSelector('.hbar-row')
    assert.equal(await page.locator('.hbar-row').count(), 8)
    assert.equal(await page.locator('.trend-card').count(), 8)
    assert.ok((await page.locator('.hbar-fill').count()) >= 1)
  })

  it('exports answers as CSV', async () => {
    await page.goto(BASE + '/#/settings')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar respuestas (CSV)' }).click()])
    const csv = readFileSync(await dl.path(), 'utf8')
    assert.equal(csv.charCodeAt(0), 0xfeff)
    assert.equal(csv.trim().split('\r\n').length, 11)
  })

  it('switches certification from the top bar without mixing progress', async () => {
    await page.goto(BASE + '/#/')
    await page.getByRole('button', { name: /Certificación: CCDV-F/ }).click()
    await page.waitForSelector('dialog.cert-dialog[open]')
    assert.equal(await page.locator('dialog.cert-dialog[open] .cert-opt').count(), 4)
    await page.locator('dialog.cert-dialog[open] .cert-opt', { hasText: 'Architect – Foundations' }).click()
    await page.waitForFunction(() => !document.querySelector('dialog.cert-dialog[open]'))
    assert.match(await page.locator('.brand-switch').textContent(), /CCAR-F/)
    assert.match(await page.locator('main p.small').first().textContent(), /Architect – Foundations · 60 preguntas · 120 min/)
    assert.equal(await page.locator('h2#next-h').textContent(), 'Tu primer mock completo')

    await page.goto(BASE + '/#/domains')
    await page.waitForSelector('table.data')
    assert.equal(await page.locator('table.data tbody tr').count(), 5)
    await page.goto(BASE + '/#/exams')
    assert.match(await page.locator('.grid-modes').first().textContent(), /60 preguntas · 120 min/)
    assert.match(await page.locator('body').textContent(), /12 preguntas · corrección al momento/)

    // An attempt of the other certification still opens with its own domains
    await page.goto(drillResults)
    await page.waitForSelector('#score-h')
    assert.match(await page.locator('main').textContent(), /Aplicaciones e integración|Selección y optimización|Agentes y workflows|Ingeniería de prompts|Herramientas y MCP|Seguridad|Claude Code|Evaluación, pruebas/)

    // Exam date: one per certification
    await page.goto(BASE + '/#/settings')
    await page.fill('#exam-date', '2027-01-15')
    await page.locator('#exam-date').blur()
    await page.getByRole('button', { name: 'CCDV-F', exact: true }).click()
    await page.waitForFunction(() => /CCDV-F/.test(document.querySelector('.brand-switch')?.textContent ?? ''))
    assert.equal(await page.locator('label[for=exam-date]').textContent(), 'Fecha del examen · CCDV-F')
    assert.equal(await page.inputValue('#exam-date'), '')

    // Developer's progress is where it was
    await page.goto(BASE + '/#/progress')
    await page.waitForSelector('.hbar-row')
    assert.equal(await page.locator('.hbar-row').count(), 8)

    const uid = sql(`SELECT id FROM "user" WHERE email = '${email}'`)[0].id
    let rows = []
    for (let i = 0; i < 20; i++) {
      rows = sql(`SELECT key, value FROM settings WHERE user_id = '${uid}' ORDER BY key`)
      if (rows.some((r) => r.key === 'exam_date:architect-foundations') && rows.some((r) => r.key === 'cert' && r.value === 'developer-foundations')) break
      await page.waitForTimeout(250)
    }
    assert.deepEqual(rows, [{ key: 'cert', value: 'developer-foundations' }, { key: 'exam_date:architect-foundations', value: '2027-01-15' }])
    await page.goto(BASE + '/#/settings')
  })

  it('notes: confusable pairs, courses for the certification, and a plan that follows the exam date', async () => {
    await page.goto(BASE + '/#/notes/confusions')
    await page.waitForSelector('main article.card')
    assert.equal(await page.locator('.seg-tabs a').count(), 6)
    assert.equal(await page.locator('main article.card').count(), 9)
    assert.match(await page.locator('main').textContent(), /La pregunta clave/)

    await page.goto(BASE + '/#/notes/courses')
    const prep = page.getByRole('link', { name: /Ruta oficial de preparación de CCDV-F/ })
    assert.match(await prep.getAttribute('href'), /claude-certified-developer-foundations/)
    assert.ok(await page.locator('.course-list').first().locator('li').count() >= 6)
    assert.match(await page.locator('main').textContent(), /Building with the Claude API/)

    // Exam in five days: the plan marks week 3 and Home points at the checklist
    const inFive = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)
    await page.goto(BASE + '/#/settings')
    await page.fill('#exam-date', inFive)
    await page.locator('#exam-date').blur()
    await page.goto(BASE + '/#/')
    await page.getByRole('link', { name: /Semana del examen/ }).click()
    await page.waitForURL(/#\/notes\/plan/)
    await page.waitForSelector('.week-card.current')
    const current = page.locator('.week-card.current')
    assert.equal(await current.count(), 1)
    assert.match(await current.textContent(), /Semana 3|semana 3/i)
    assert.ok(await page.locator('#exam-week li').count() >= 5)
    await page.goto(BASE + '/#/settings')
  })

  it('switches language and opens the public legal pages', async () => {
    await page.getByRole('button', { name: 'English' }).first().click()
    assert.match(await page.locator('.tabbar').textContent(), /Home/)
    await page.goto(BASE + '/#/legal/privacidad')
    assert.equal(await page.locator('h1').first().textContent(), 'Privacy policy')
    await page.getByRole('button', { name: 'Español' }).first().click()
  })

  it('a revoked session wipes the account from the device and a crafted ?error link does not blank the page', async () => {
    // Revoke every session of this account from "another device", then let this tab discover it
    const other = client()
    assert.equal((await other('/api/auth/sign-in/email', { method: 'POST', body: { email, password: PW } })).status, 200)
    assert.equal((await other('/api/auth/revoke-sessions', { method: 'POST', body: {} })).status, 200)
    await page.goto(BASE + '/#/settings')
    await page.getByRole('button', { name: 'Sync now' }).or(page.getByRole('button', { name: 'Sincronizar ahora' })).first().click()
    await page.waitForSelector('#email')
    const keys = await page.evaluate(() => Object.keys(localStorage))
    assert.ok(keys.every((k) => !/^ccdvf_(base|outbox|uid|tutor_|pos_)/.test(k)), keys.join(','))
    for (const bad of ['__proto__', 'constructor']) {
      await page.goto(`${BASE}/?error=${bad}#/`)
      await page.waitForSelector('#email')
    }
    await page.goto(BASE + '/#/')
    await page.fill('#email', email); await page.fill('#password', PW)
    await page.locator('form button.btn-primary').click()
    await page.waitForSelector('.topbar')
  })

  it('signing out wipes the account from the device', async () => {
    await page.goto(BASE + '/#/settings')
    await page.getByRole('button', { name: 'Cerrar sesión aquí' }).click()
    await page.waitForSelector('#email')
    const keys = await page.evaluate(() => Object.keys(localStorage))
    assert.ok(keys.every((k) => !/^ccdvf_(base|outbox|tutor_|pos_)/.test(k)), keys.join(','))
  })

  it('resets a forgotten password from the email link', async () => {
    await page.getByRole('button', { name: '¿La olvidaste?' }).click()
    await page.fill('#email', email)
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await page.getByRole('status').waitFor()
    const uid = sql(`SELECT id FROM "user" WHERE email = '${email}'`)[0].id
    let token = null
    for (let i = 0; i < 20 && !token; i++) { token = lastResetToken(uid); if (!token) await page.waitForTimeout(250) }
    await page.goto(`${BASE}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent('/?lang=es')}`)
    await page.fill('#password', 'a brand new password')
    await page.getByRole('button', { name: 'Guardar contraseña' }).click()
    await page.getByText('Contraseña cambiada').waitFor()
    await page.fill('#email', email); await page.fill('#password', 'a brand new password')
    await page.locator('form button.btn-primary').click()
    await page.waitForSelector('.topbar')
  })

  it('had no runtime or CSP errors', () => {
    assert.deepEqual(problems, [])
  })
})
