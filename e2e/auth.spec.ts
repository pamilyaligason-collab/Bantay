import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Runs against a build WITH Supabase env (project "auth" in playwright.config.ts). All Supabase traffic is mocked.
const API = 'https://bantay-test.supabase.test'
const UID = '33333333-3333-4333-8333-333333333333'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

async function mock(page: Page, seen: { pins: string[]; rpc: number; oauth: string[] }) {
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
  await expect(page.getByRole('alert')).toHaveText('Handle or PIN is not right')
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
