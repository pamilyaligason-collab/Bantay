import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Runs against a build WITH Supabase env (project "auth" in playwright.config.ts). All Supabase traffic is mocked.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

const FAMILY_ROWS = [
  { person_id: 'p-lola', display_name: 'Lola Rosa', handle: 'lola', provider: 'pin' },
  { person_id: 'p-ate', display_name: 'Ate Maria', handle: null, provider: 'google' }
]
const FAMILY = [
  { personId: 'p-lola', displayName: 'Lola Rosa', handle: 'lola', provider: 'pin', initials: 'LR' },
  { personId: 'p-ate', displayName: 'Ate Maria', handle: null, provider: 'google', initials: 'AM' }
]
const trust = (page: Page, flagged: string[] = []) =>
  page.addInitScript(([fam, flags]) => {
    localStorage.setItem('bantay.family', JSON.stringify(fam))
    ;(flags as string[]).forEach((id) => localStorage.setItem(`bantay.passkey.${id}`, '1'))
  }, [FAMILY, flagged] as const)
const logouts: string[] = []
let passkeyCalls = 0
type Seen = { pins: string[]; rpc: number; oauth: string[]; names?: 'ok' | 'abort'; asked?: number }
const fresh = (): Seen => ({ pins: [], rpc: 0, oauth: [], asked: 0 })
const NAME_ROWS = [{ first_name: 'Kuya', initial: 'B', handle: 'ben' }, { first_name: 'Lola', initial: 'R', handle: 'lola' }]
const who = async (page: Page, name: string) => { await page.getByLabel('Who are you?').getByRole('button').filter({ hasText: name }).click() }
const keys = async (page: Page, digits: string) => { for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click() }

async function mock(page: Page, seen: Seen) {
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (url.pathname === '/functions/v1/pin-login') {
      const { pin } = req.postDataJSON()
      seen.pins.push(pin)
      if (pin !== '480193') return reply(401, { ok: false, error: 'bad_credentials', message: 'Handle or PIN is not right' })
      return reply(200, { ok: true, session: { access_token: jwt(), refresh_token: 'refresh-test', expires_in: 3600, token_type: 'bearer' } })
    }
    if (url.pathname === '/functions/v1/family-names') {
      seen.asked = (seen.asked ?? 0) + 1
      if (seen.names === 'abort') return route.abort('internetdisconnected')
      return seen.names === 'ok' ? reply(200, NAME_ROWS) : reply(404, {})
    }
    if (url.pathname === '/rest/v1/rpc/family_profiles') return reply(200, FAMILY_ROWS)
    if (url.pathname.startsWith('/auth/v1/passkeys')) { passkeyCalls++; return reply(400, { error_code: 'passkey_disabled', msg: 'off' }) }
    if (url.pathname === '/rest/v1/people') return reply(200, { id: 'p-lola', display_name: 'Lola Rosa' })
    if (url.pathname === '/auth/v1/logout') { logouts.push(url.searchParams.get('scope') ?? ''); return route.fulfill({ status: 204, headers: cors }) }
    if (url.pathname === '/auth/v1/user') return reply(200, user)
    if (url.pathname === '/rest/v1/rpc/ensure_self_person') { seen.rpc++; return reply(200, '44444444-4444-4444-8444-444444444444') }
    if (url.pathname === '/auth/v1/authorize') { seen.oauth.push(req.url()); return route.fulfill({ status: 200, contentType: 'text/html', body: 'google' }) }
    return reply(404, {})
  })
}

test('signed out shows sign-in; wrong PIN gives the generic error; right PIN lands on Today', async ({ page }) => {
  const seen = { pins: [] as string[], rpc: 0, oauth: [] as string[] }
  await mock(page, seen)
  await skipOnboarding(page)
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Sign in')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign in with your name and PIN' }).click()
  const pin = page.getByLabel('PIN')
  await expect(pin).toHaveAttribute('inputmode', 'numeric')
  await expect(pin).toHaveAttribute('autocomplete', 'off')
  await page.getByLabel('Name').fill('Lola')
  await pin.fill('000001')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('That PIN did not work. 4 tries left.')
  await expect(page.locator('h1')).toHaveText('Sign in')
  await expect(pin).toHaveValue('') // PIN is cleared after a miss

  await pin.fill('480193')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('Today')
  expect(seen.pins).toEqual(['000001', '480193'])
  expect(seen.rpc).toBe(1)
})

test('Continue with Google starts OAuth back to the app origin', async ({ page }) => {
  const seen = { pins: [] as string[], rpc: 0, oauth: [] as string[] }
  await mock(page, seen)
  await page.goto('/')
  const appOrigin = new URL(page.url()).origin
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect.poll(() => seen.oauth.length).toBe(1)
  const u = new URL(seen.oauth[0])
  expect(u.searchParams.get('provider')).toBe('google')
  expect(new URL(u.searchParams.get('redirect_to')!).origin).toBe(appOrigin)
})

for (const size of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
  test(`sign-in at ${size.width}px: no sideways scroll`, async ({ page }) => {
    await page.setViewportSize(size)
    await mock(page, { pins: [], rpc: 0, oauth: [] })
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in with your name and PIN' }).click()
    await expect(page.locator('h1')).toHaveText('Sign in')
    const wide = await page.evaluate(() => {
      const root = document.scrollingElement as Element
      return root.scrollWidth > root.clientWidth || Array.from(document.querySelectorAll('*')).some((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollWidth > el.clientWidth)
    })
    expect(wide).toBe(false)
  })
}

test.describe('quick login (D-24)', () => {
  test('fresh phone: no family names anywhere, one-line promise, axe clean', async ({ page }) => {
    await mock(page, fresh())
    await page.goto('/')
    await expect(page.getByText('First time on this phone? Sign in once and it will remember your family.')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Lola')
    expect(JSON.stringify(await page.evaluate(() => ({ ...localStorage })))).not.toContain('Lola')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })

  test('trusted phone: picker, PIN pad signs in with the chosen handle, wrong PIN is generic', async ({ page }) => {
    const seen = fresh()
    await mock(page, seen)
    await trust(page)
    await skipOnboarding(page)
    await page.goto('/')
    await expect(page.getByLabel('Who are you?')).toBeVisible()
    await expect(page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Lola Rosa' })).toBeVisible()
    await expect(page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Ate Maria' })).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await who(page, 'Lola Rosa')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await keys(page, '000001')
    await expect(page.getByRole('alert')).toHaveText('That PIN did not work. 4 tries left.')
    await keys(page, '480193')
    await expect(page.locator('h1')).toHaveText('Today')
    expect(seen.pins).toEqual(['000001', '480193'])
  })

  test('five wrong PINs show the one-minute wait screen with the 911 button and Forgot PIN?, no admin', async ({ page }) => {
    const seen = fresh()
    await mock(page, seen)
    await trust(page)
    await skipOnboarding(page)
    await page.goto('/')
    await who(page, 'Lola Rosa')
    for (let i = 0; i < 5; i++) { await keys(page, '000001'); await expect.poll(() => seen.pins.length).toBe(i + 1) }
    await expect(page.getByRole('heading', { name: 'Take a short break' })).toBeVisible()
    await expect(page.getByText(/Try your PIN again in (0:[0-5]\d|1:00)/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911')
    await expect(page.locator('body')).not.toContainText(/admin/i)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Forgot PIN?' }).click()
    await expect(page.getByRole('heading', { name: 'Forgot your PIN?' })).toBeVisible()
  })

  test('fresh phone: first names come from the server (D-41); a right PIN signs in; nothing is cached before sign-in', async ({ page }) => {
    const seen = { ...fresh(), names: 'ok' as const }
    await mock(page, seen)
    await skipOnboarding(page)
    await page.goto('/')
    await expect(page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Lola R.' })).toBeVisible()
    await expect(page.getByLabel('Who are you?').getByRole('button').filter({ hasText: 'Kuya B.' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('bantay.family'))).toBeNull()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await who(page, 'Lola R.')
    await keys(page, '000001')
    await expect(page.getByRole('alert')).toHaveText('That PIN did not work. 4 tries left.')
    await keys(page, '480193')
    await expect(page.locator('h1')).toHaveText('Today')
    expect(seen.pins).toEqual(['000001', '480193'])
  })

  test('fresh phone, no signal: No signal line and the handle and PIN form still work', async ({ page }) => {
    const seen = { ...fresh(), names: 'abort' as const }
    await mock(page, seen)
    await skipOnboarding(page)
    await page.goto('/')
    await expect(page.getByText('No signal. Try again when you have data.')).toBeVisible()
    await expect(page.getByLabel('Who are you?')).toHaveCount(0)
    await page.getByRole('button', { name: 'Sign in with your name and PIN' }).click()
    await page.getByLabel('Name').fill('lola')
    await page.getByLabel('PIN').fill('480193')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.locator('h1')).toHaveText('Today')
  })

  test('Forgot PIN? from the PIN pad: family approval asks for a new PIN twice', async ({ page }) => {
    await mock(page, fresh())
    await trust(page)
    await skipOnboarding(page)
    await page.goto('/')
    await who(page, 'Lola Rosa')
    await page.getByRole('button', { name: 'Forgot PIN?' }).click()
    await expect(page.getByRole('heading', { name: 'Forgot your PIN?' })).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: /Ask a family member to approve/ }).click()
    await expect(page.getByRole('heading', { name: 'Choose a new PIN' })).toBeVisible()
    await keys(page, '246810')
    await expect(page.getByRole('heading', { name: 'Type it again' })).toBeVisible()
    await keys(page, '246811')
    await expect(page.getByRole('alert')).toHaveText('Those two did not match. Start again.')
  })

  test('trusted phone: Google member goes to Google', async ({ page }) => {
    const seen = fresh()
    await mock(page, seen)
    await trust(page)
    await page.goto('/')
    await who(page, 'Ate Maria')
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect.poll(() => seen.oauth.length).toBe(1)
  })

  test('OAuth error in the query string is shown and the URL is cleaned', async ({ page }) => {
    await mock(page, fresh())
    await page.goto('/?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance')
    await expect(page.getByRole('alert')).toHaveText('This Google account is not invited yet. Ask your family admin.')
    expect(new URL(page.url()).search).toBe('')
  })

  test('OAuth error in the hash is shown and the URL is cleaned', async ({ page }) => {
    await mock(page, fresh())
    await page.goto('/#error=server_error&error_description=Something+went+wrong')
    await expect(page.getByRole('alert')).toHaveText('Sign-in did not work. Try again.')
    expect(new URL(page.url()).hash).toBe('')
  })

  test('fingerprint first: flagged person starts the prompt at once; failure shows the PIN pad and does not loop', async ({ page }) => {
    passkeyCalls = 0
    await mock(page, fresh())
    await trust(page, ['p-lola'])
    await skipOnboarding(page)
    await page.goto('/')
    await who(page, 'Ate Maria') // not flagged: no prompt
    await expect(page.getByRole('button', { name: /fingerprint or face/i })).toHaveCount(0)
    expect(passkeyCalls).toBe(0)
    await page.getByRole('button', { name: 'Back' }).click()
    await who(page, 'Lola Rosa')
    await expect(page.getByRole('alert')).toContainText('Use your PIN instead')
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeVisible()
    const after = passkeyCalls
    await page.waitForTimeout(500)
    expect(passkeyCalls).toBe(after) // no automatic second prompt
    await keys(page, '480193')
    await expect(page.locator('h1')).toHaveText('Today')
  })

  test('fingerprint prompt: Use PIN instead is one tap away', async ({ page }) => {
    await mock(page, fresh())
    await trust(page, ['p-lola'])
    // Options come back fine; the browser prompt then stays open until aborted (like a real fingerprint sheet).
    await page.route(`${API}/auth/v1/passkeys/authentication/options`, (route) =>
      route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ challenge_id: 'c1', options: { challenge: 'AAAA', timeout: 60000, rpId: 'localhost', userVerification: 'preferred' } }) }))
    await page.addInitScript(() => {
      ;(window as unknown as { __abortedPrompt: boolean }).__abortedPrompt = false
      navigator.credentials.get = (o?: CredentialRequestOptions) => new Promise((_, rej) => {
        o?.signal?.addEventListener('abort', () => { (window as unknown as { __abortedPrompt: boolean }).__abortedPrompt = true; rej(new DOMException('aborted', 'AbortError')) })
      })
    })
    await skipOnboarding(page)
    await page.goto('/')
    await who(page, 'Lola Rosa')
    await expect(page.getByRole('button', { name: '5', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Use PIN instead' }).click()
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeVisible()
    await keys(page, '480193')
    await expect(page.locator('h1')).toHaveText('Today')
    expect(await page.evaluate(() => (window as unknown as { __abortedPrompt: boolean }).__abortedPrompt)).toBe(true) // the prompt was aborted, not left open
    await page.waitForTimeout(500)
    await expect(page.locator('h1')).toHaveText('Today') // and the PIN session survived
  })

  test('passkey hidden when the browser cannot do it', async ({ page }) => {
    await mock(page, fresh())
    await trust(page, ['p-lola'])
    await page.addInitScript(() => { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true }) })
    await page.goto('/')
    await who(page, 'Lola Rosa')
    await expect(page.getByRole('button', { name: 'Use fingerprint or face' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeVisible()
  })

  test('Me > This phone: switch person keeps the picker; forget this phone clears it', async ({ page }) => {
    await mock(page, fresh())
    await trust(page)
    await skipOnboarding(page)
    await page.goto('/')
    await who(page, 'Lola Rosa')
    await keys(page, '480193')
    await expect(page.locator('h1')).toHaveText('Today')
    await page.goto('/#me')
    await expect(page.getByText('Signed in as Lola Rosa')).toBeVisible()
    await page.getByRole('button', { name: 'Not you? Switch person' }).click()
    await expect.poll(() => logouts.at(-1)).toBe('local')
    await expect(page.getByLabel('Who are you?')).toBeVisible() // Switch person lands on the welcome list, not the returning screen
    await who(page, 'Lola Rosa')
    await keys(page, '480193')
    await expect(page.locator('h1')).toHaveText('Me')
    await page.getByRole('button', { name: 'Forget this phone' }).click()
    await expect(page.getByText('First time on this phone?')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('bantay.family'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('bantay.lastPerson'))).toBeNull()
  })

  test('remembered person: a PIN sign-in remembers them; the next visit shows only the mascot and their name', async ({ page }) => {
    await mock(page, fresh())
    await trust(page)
    await skipOnboarding(page)
    await page.goto('/')
    await who(page, 'Lola Rosa')
    await keys(page, '480193')
    await expect(page.locator('h1')).toHaveText('Today')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bantay.lastPerson'))).toBe('p-lola')
    await page.goto('/#me')
    await page.getByRole('button', { name: 'Not you? Switch person' }).click()
    await expect(page.getByLabel('Who are you?')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('bantay.lastPerson'))).toBeNull()
  })

  for (const size of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
    test(`returning screen at ${size.width}px: mascot, one name, no sideways scroll, axe clean`, async ({ page }) => {
      await page.setViewportSize(size)
      await mock(page, fresh())
      await trust(page)
      await page.addInitScript(() => localStorage.setItem('bantay.lastPerson', 'p-lola'))
      await page.goto('/')
      await expect(page.getByAltText('Jack Jack, the Bantay dog')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Hi Lola' })).toBeVisible()
      await expect(page.locator('body')).not.toContainText('Ate Maria')
      await expect(page.getByRole('button', { name: '5', exact: true })).toBeVisible()
      const wide = await page.evaluate(() => { const r = document.scrollingElement as Element; return r.scrollWidth > r.clientWidth || Array.from(document.querySelectorAll('*')).some((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollWidth > el.clientWidth) })
      expect(wide).toBe(false)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.getByRole('button', { name: 'Not you? Switch person' }).click()
      await expect(page.getByLabel('Who are you?')).toBeVisible()
      const box = await page.getByLabel('Who are you?').getByRole('button').first().boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(48)
    })
  }

  for (const size of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
    test(`picker and PIN pad at ${size.width}px: no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(size)
      await mock(page, fresh())
      await trust(page)
      await page.goto('/')
      const wide = () => page.evaluate(() => { const r = document.scrollingElement as Element; return r.scrollWidth > r.clientWidth || Array.from(document.querySelectorAll('*')).some((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollWidth > el.clientWidth) })
      expect(await wide()).toBe(false)
      await who(page, 'Lola Rosa')
      expect(await wide()).toBe(false)
    })

    test(`fingerprint prompt screen at ${size.width}px: no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(size)
      await mock(page, fresh())
      await trust(page, ['p-lola'])
      await page.route(`${API}/auth/v1/passkeys/**`, () => new Promise(() => {}))
      await page.goto('/')
      await who(page, 'Lola Rosa')
      await expect(page.getByRole('button', { name: 'Use PIN instead' })).toBeVisible()
      const wide = await page.evaluate(() => { const r = document.scrollingElement as Element; return r.scrollWidth > r.clientWidth })
      expect(wide).toBe(false)
    })
  }
})
