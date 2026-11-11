import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// S30 L9 (auth build, PostgREST mocked, invented people): the family map when one member is in Texas and two are in the Philippines.
// The map fits the Philippine pair (not the whole Pacific); a labelled chip for the Texas member pans to them on tap, and "Back to everyone nearby" returns.
// Also Settings > Alerts: the daily digest time is said on this phone's clock. 02:00Z on 11 Nov is 20:00 Tuesday in Texas (UTC-6): 06:45 Manila is 4:45 PM there.
// Shots only when S30_SHOTS=<dir> (390x844 and 360x740, light and dark).
declare const process: { env: Record<string, string | undefined> }
const SHOTS = process.env.S30_SHOTS
test.use({ serviceWorkers: 'block', locale: 'en-US', timezoneId: 'America/Chicago' })

const API = 'https://bantay-test.supabase.test'
const UID = '77777777-7777-4777-8777-777777777777'
const CLOCK = '2026-11-11T02:00:00Z'
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }]
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [
  { id: 'me', display_name: 'Rey', auth_user_id: UID, tz: 'America/Chicago' },
  { id: 'ma', display_name: 'Mama Rosa', auth_user_id: 'u-ma', tz: 'Asia/Manila' },
  { id: 'jo', display_name: 'Joy', auth_user_id: 'u-jo', tz: 'Asia/Manila' }
]
const FAMILY = PEOPLE.map((p) => ({ personId: p.id, displayName: p.display_name }))
const PLACES = [
  { person_id: 'ma', lat: 9.6457, lon: 123.878, accuracy_m: 20, fixed_at: '2026-11-11T01:55:00Z', battery_pct: 80, charging: false },
  { person_id: 'jo', lat: 6.2015, lon: 125.1878, accuracy_m: 20, fixed_at: '2026-11-11T01:50:00Z', battery_pct: 60, charging: false },
  { person_id: 'me', lat: 29.7604, lon: -95.3698, accuracy_m: 20, fixed_at: '2026-11-11T01:58:00Z', battery_pct: 90, charging: true }
]

async function mock(page: Page) {
  await page.addInitScript(([token, u, fam]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify(fam))
    localStorage.setItem('bantay.lastPerson', 'me')
  }, [jwt(), user, FAMILY] as const)
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }))
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-11-10T20:00', temperature_2m: 30, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [10] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t === 'rpc/family_places') return reply(PLACES)
    if (req.method() !== 'GET') return route.fulfill({ status: t.startsWith('rpc/') ? 200 : 201, headers: { ...cors, 'content-type': 'application/json' }, body: t.startsWith('rpc/') ? 'null' : '' })
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }])
    return reply([])
  })
}

async function open(page: Page, hash: string, size: { width: number; height: number }, scheme: 'light' | 'dark') {
  await skipOnboarding(page)
  await page.setViewportSize(size)
  await page.emulateMedia({ colorScheme: scheme })
  await page.clock.setFixedTime(CLOCK)
  await mock(page)
  await page.goto(hash)
}
const shot = async (page: Page, name: string, size: { width: number; height: number }, scheme: string) => {
  if (!SHOTS) return
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  await page.screenshot({ path: `${SHOTS}/${name}-${size.width}x${size.height}-${scheme}.png`, animations: 'disabled' })
}

/** Is the pin of `name` inside the map card's box (Leaflet draws every marker, on screen or not)? */
const pinInside = (page: Page, name: string) => page.evaluate((n) => {
  const pin = document.querySelector(`.leaflet-marker-icon[title="${n}"]`)?.getBoundingClientRect()
  const box = document.querySelector('[data-testid="place-map"], [data-testid="where-map"]')?.getBoundingClientRect()
  return !!pin && !!box && pin.left >= box.left && pin.right <= box.right && pin.top >= box.top && pin.bottom <= box.bottom
}, name)

for (const size of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${size.width}x${size.height} ${scheme}`, () => {
      test('Family map with one member in Texas: the Philippine pins are fitted, a chip names the far member and pans to them', async ({ page }) => {
        await open(page, '/#family/map', size, scheme)
        const far = page.getByTestId('place-far')
        await expect(far).toBeVisible()
        const chip = far.getByRole('button', { name: /^Rey · about 1[34],\d00 km away$/ }) // the map names people by their roster name
        await expect(chip).toBeVisible()
        await expect.poll(() => pinInside(page, 'Mama Rosa')).toBe(true) // the Philippines fills the map, not a corner of the Pacific
        await expect.poll(() => pinInside(page, 'Joy')).toBe(true)
        expect(await pinInside(page, 'Rey')).toBe(false) // the Texas pin is far outside the box
        // ML-44: every far chip sits inside the map box, inset like the "Online map" chip (8px), at both widths
        const insets = () => page.evaluate(() => {
          const map = document.querySelector('[data-testid="place-map"]')!.getBoundingClientRect()
          return [...document.querySelectorAll('[data-testid="place-far"] button')].map((b) => { const r = b.getBoundingClientRect(); return { top: r.top - map.top, right: map.right - r.right, left: r.left - map.left } })
        })
        for (const i of await insets()) { expect(i.top).toBeGreaterThanOrEqual(7.5); expect(i.right).toBeGreaterThanOrEqual(7.5); expect(i.left).toBeGreaterThanOrEqual(7.5) }
        await shot(page, 'family-map-far', size, scheme)
        await chip.click()
        for (const i of await insets()) { expect(i.right).toBeGreaterThanOrEqual(7.5); expect(i.left).toBeGreaterThanOrEqual(7.5) }
        await expect.poll(() => pinInside(page, 'Mama Rosa')).toBe(false)
        await expect(far.getByRole('button', { name: 'Back to everyone nearby' })).toBeVisible()
        await shot(page, 'family-map-panned', size, scheme)
        await far.getByRole('button', { name: 'Back to everyone nearby' }).click()
        await expect.poll(() => pinInside(page, 'Mama Rosa')).toBe(true)
      })

      test('Settings > Alerts says the daily digest time on this phone\'s clock', async ({ page }) => {
        await open(page, '/#me/alerts', size, scheme)
        const live = page.getByRole('link', { name: /Alerts list/ }) // the live row carries the time, the Later row does not
        await expect(live).toContainText('6:45 AM Manila time (4:45 PM Texas time)')
        await expect(page.getByTestId('world-alerts-later')).not.toContainText('Manila')
        await live.scrollIntoViewIfNeeded()
        await shot(page, 'settings-alerts-digest', size, scheme)
      })
    })
  }
}
