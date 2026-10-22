import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { skipOnboarding } from './helpers'

// Runs in the "auth" project (build WITH test Supabase env). Signed in as a made-up member; PostgREST is mocked (the nutrition tables answer
// "not found" like a project where 0024 is not applied yet, so this also proves the app works with local rows only). All data is invented.
// Food and nutrients: Today Meal pill -> Plate sheet -> save -> Salt today card; water; Health > Food and salt. 390x844, light and dark, axe 0.
const API = 'https://bantay-test.supabase.test'
const UID = '55555555-5555-4555-8555-555555555555'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'm-1@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Test One' }, { id: 'ma', display_name: 'Test Two' }]

async function mock(page: Page) {
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ current: { time: '2026-10-20T10:00', temperature_2m: 34.2, relative_humidity_2m: 70, weather_code: 2 }, daily: { precipitation_probability_max: [70] }, hourly: { time: [], precipitation_probability: [] } }) }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (/^(food_entries|water_entries|nutrition_goals)$/.test(t)) return reply({ code: 'PGRST205', message: 'table not found' }, 404) // migration 0024 not applied
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply([{ role: 'member', handle: null }])
    if (t === 'carers') return reply([])
    return reply([])
  })
}

const serious = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.map((n) => `${n.target.join(' ')} [${(n.any[0]?.message ?? '').slice(0, 150)}]`).join(' | ')}`)
// SHOTS=<dir> saves 390x844 screenshots of the screens this lane changed (docs/session-9/shots/w1-nutri)
const SHOTS = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.SHOTS
const shot = async (page: Page, name: string, scheme: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` }) }
const noSideways = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)

async function seed(page: Page, dbName: string, store: string, rows: Record<string, unknown>[]) {
  await page.evaluate(async ([name, st, list]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Record<string, unknown>[]) tx.objectStore(st as string).add(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows] as const)
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.emulateMedia({ colorScheme: scheme })
      await skipOnboarding(page)
      await mock(page)
    })

    test('Quick log is 3 x 3; Log a meal -> pick, step the portion, see salt live -> save -> Meals today updates; salty extras; water; axe clean', async ({ page }) => {
      await page.goto('/')
      const row = page.getByRole('group', { name: 'Quick log' })
      await expect(row.getByRole('button')).toHaveCount(9)
      for (const b of await row.getByRole('button').all()) {
        const box = (await b.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(72)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
      // salt is part of the meals now: there is no separate "Salt today" card
      await expect(page.getByRole('heading', { name: 'Salt today' })).toHaveCount(0)
      const salt = page.locator('section[aria-labelledby="t-meals"]')
      await expect(salt.getByRole('heading', { name: 'Meals today' })).toBeVisible()
      await expect(salt.getByText('Nothing logged yet today.')).toBeVisible()
      expect((await salt.getByRole('button', { name: 'Log a meal' }).boundingBox())!.height).toBeGreaterThanOrEqual(56)
      await shot(page, 'today-meals-empty', scheme)
      expect(await serious(page)).toEqual([])

      await row.getByRole('button', { name: 'Log what you ate' }).click()
      const sheet = page.getByRole('dialog', { name: 'Meal' })
      // the meal comes from the clock; one chip changes it
      const chip = sheet.getByRole('button', { name: /Change/ })
      await expect(chip).toContainText(/Almusal|Tanghalian|Hapunan|Meryenda/)
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(48)
      await expect(sheet.getByRole('button', { name: /Same as yesterday/ })).toHaveCount(0) // nothing yesterday
      await expect(sheet.getByRole('group', { name: 'Salty extras on this meal' }).getByRole('button')).toHaveCount(5)
      await expect(sheet.getByRole('group', { name: 'How much?' })).toHaveCount(0)
      await expect(sheet.getByText('High salt').first()).toBeVisible()
      await shot(page, 'meal-sheet-open', scheme)
      expect(await serious(page)).toEqual([])
      await chip.click()
      await sheet.getByRole('group', { name: 'Meal' }).getByRole('button', { name: /Tanghalian/ }).click()
      await sheet.getByRole('searchbox', { name: 'Search foods' }).fill('adobo')
      await expect(sheet.getByText(/\d+ found/)).toBeVisible()
      await sheet.getByRole('button', { name: /^Add Adobong manok/ }).click()
      await sheet.getByRole('searchbox', { name: 'Search foods' }).fill('kanin')
      await sheet.getByRole('button', { name: /^Add Kanin/ }).click()
      await sheet.getByRole('button', { name: 'More Kanin' }).click() // 1 -> 1 1/2
      await expect(sheet.getByText('2 on your plate')).toBeVisible()
      await expect(sheet.getByTestId('plate-salt')).toHaveText('1,207 mg') // 1204 + 1.5 x 2
      await expect(sheet.getByRole('progressbar', { name: 'Salt today with this meal' })).toHaveAttribute('aria-valuenow', '1207')
      await expect(sheet.getByTestId('plate-keys')).toContainText('Protein')
      await shot(page, 'meal-sheet-plate', scheme)
      const save = sheet.getByRole('button', { name: 'Save meal' })
      expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(56)
      expect(await serious(page)).toEqual([])
      await save.click()
      await expect(page.getByRole('status').filter({ hasText: 'Saved 2 foods for lunch' })).toBeVisible()

      // the card updates: chicken adobo (1204 mg) + 1.5 cups rice (3 mg) = 1207 mg, 60% of 2000 mg, so Under
      await expect(salt.getByTestId('salt-mg')).toContainText('1,207 mg')
      await expect(salt.getByTestId('salt-band')).toHaveText('Under')
      await expect(salt.getByTestId('salt-g')).toHaveText('3 g')
      await expect(salt.getByTestId('salt-top').getByRole('listitem').first()).toContainText('Adobong manok')
      await expect(salt.getByTestId('day-keys')).toContainText('Protein')
      await salt.scrollIntoViewIfNeeded()
      await shot(page, 'today-meals-filled', scheme)
      await expect(salt.getByTestId('kcal')).toContainText('For information only')
      await expect(salt.getByRole('progressbar', { name: 'Sodium today' })).toHaveAttribute('aria-valuenow', '1207')
      expect(await serious(page)).toEqual([])

      // salty extras go on the plate with the meal: toyo (879 mg) + patis (1413 mg) goes over the limit
      await salt.getByRole('button', { name: 'Log a meal' }).click()
      const again = page.getByRole('dialog', { name: 'Meal' })
      for (const extra of ['Toyo', 'Patis']) await again.getByRole('group', { name: 'Salty extras on this meal' }).getByRole('button', { name: new RegExp(`^Add ${extra} to`) }).click()
      await expect(again.getByTestId('plate-salt')).toHaveText('2,292 mg')
      await expect(again.locator('.nu-band')).toHaveText('Over') // 1207 + 2292 = 3499 of 2000
      await again.getByRole('button', { name: 'Save meal' }).click()
      await expect(page.getByRole('dialog', { name: 'Meal' })).toHaveCount(0)
      await expect(salt.getByTestId('salt-band')).toHaveText('Over')
      await expect(salt.getByTestId('salt-mg')).toContainText('3,499 mg')
      expect(await serious(page)).toEqual([])

      // water: 250 ml a tap in the card, and the Water pill opens the same counter
      await salt.getByRole('button', { name: /Add a glass of water/ }).click()
      await expect(salt.getByTestId('water-ml')).toHaveText('250 ml')
      await row.getByRole('button', { name: 'Log water you drank' }).click()
      const wsheet = page.getByRole('dialog', { name: 'Water' })
      await wsheet.getByRole('button', { name: /Add a glass of water/ }).click()
      await expect(wsheet.getByTestId('water-ml')).toHaveText('500 ml')
      expect((await wsheet.getByRole('button', { name: /Add a glass/ }).boundingBox())!.height).toBeGreaterThanOrEqual(56)
      await wsheet.getByRole('button', { name: 'Undo' }).click()
      await expect(wsheet.getByTestId('water-ml')).toHaveText('250 ml')
      expect(await serious(page)).toEqual([])
      await page.keyboard.press('Escape')
      expect(await noSideways(page)).toBe(true)
    })

    test('Health > Food and nutrients: the card, the limit (2000 or 1500), the week next to blood pressure; axe clean', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
      const at = (d: number, h: number) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - d, h).toISOString()
      await seed(page, 'bantay-log', 'food', [
        { clientId: 'f1', personId: 'me', eatenAt: at(0, 12), meal: 'lunch', foodKey: 'chicken_adobo', name: 'Chicken adobo', portion: 1, servingLabel: '1 serving', kcal: 207, sodiumMg: 1204, potassiumMg: 352, proteinG: 23.6 },
        { clientId: 'f2', personId: 'me', eatenAt: at(1, 12), meal: 'lunch', foodKey: 'tuyo', name: 'Dried salted fish', portion: 1, servingLabel: '3 small pieces', kcal: 85, sodiumMg: 1405, potassiumMg: 32, proteinG: 12.6 },
        { clientId: 'f3', personId: 'me', eatenAt: at(3, 12), meal: 'dinner', foodKey: 'sinigang_baboy', name: 'Pork sour soup', portion: 1, servingLabel: '1 bowl', kcal: 261, sodiumMg: 742, potassiumMg: 698, proteinG: 16.9 }
      ])
      await seed(page, 'bantay-health', 'readings', [
        { personId: 'me', takenAt: at(1, 8), test: 'bp_systolic', value: 138, unit: 'mmHg' },
        { personId: 'me', takenAt: at(2, 8), test: 'bp_systolic', value: 132, unit: 'mmHg' }
      ])
      await page.reload()
      await page.evaluate(() => { location.hash = '#health' })
      const link = page.getByRole('link', { name: /Food and nutrients/ })
      await expect(link).toBeVisible()
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(56)
      expect(await serious(page)).toEqual([])
      await link.click()
      await expect(page).toHaveURL(/#health\/nutrition$/)
      await expect(page.getByRole('heading', { name: 'Food and nutrients' })).toBeVisible()
      await shot(page, 'nutrition-screen', scheme)
      const card = page.locator('section[aria-labelledby="nu-salt"]')
      await expect(card.getByTestId('salt-mg')).toContainText('1,204 mg')
      await expect(card.getByTestId('salt-band')).toHaveText('Under') // 1204 / 2000 = 60%
      await expect(card.getByTestId('salt-top').getByRole('listitem')).toHaveCount(1)
      const limit = page.getByRole('group', { name: 'Salt limit' })
      await expect(limit.getByRole('button', { name: '2,000 mg' })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByText('Ask your doctor about your salt limit')).toBeVisible()
      await expect(page.getByRole('link', { name: /WHO fact sheet/ })).toHaveAttribute('href', 'https://www.who.int/news-room/fact-sheets/detail/salt-reduction')
      expect((await limit.getByRole('button', { name: '1,500 mg' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await limit.getByRole('button', { name: '1,500 mg' }).click()
      await expect(page.getByTestId('limit')).toHaveText('1,500 mg')
      await expect(card.getByTestId('salt-band')).toHaveText('Near') // 1204 / 1500 = 80%
      await expect(page.getByRole('status').filter({ hasText: 'Salt limit set to 1,500 mg' })).toBeVisible()
      // the week: sodium chart next to the blood pressure chart, 7 days each
      await expect(page.getByTestId('metric-chart')).toHaveCount(2)
      await expect(page.getByRole('img', { name: /Sodium eaten each day, last 7 days, 3 readings/ })).toBeVisible()
      await expect(page.getByRole('img', { name: /Blood pressure top number, last 7 days, 2 readings/ })).toBeVisible()
      await expect(page.getByRole('list').filter({ hasText: 'Remove' }).getByRole('listitem')).toHaveCount(1)
      expect(await serious(page)).toEqual([])
      expect(await noSideways(page)).toBe(true)
      // the limit survives a reload (saved on this phone first)
      await page.reload()
      await expect(page.getByTestId('limit')).toHaveText('1,500 mg')
    })

    test('Health > Food and nutrients: targets by age and sex, food vs supplement segments, unknown stays unknown; axe clean', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
      const at = (d: number, h: number) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - d, h).toISOString()
      await seed(page, 'bantay-log', 'food', [
        { clientId: 'n1', personId: 'me', eatenAt: at(0, 8), meal: 'breakfast', foodKey: 'pandesal', name: 'Pandesal', portion: 1, servingLabel: '1 piece', kcal: 93, sodiumMg: 172, potassiumMg: 44, proteinG: 3.1, carbsG: 18, fiberG: 0.8, calciumMg: 24, vitdUg: null }
      ])
      await seed(page, 'bantay-log', 'medications', [{ clientId: 'm1', serverId: 'm1', personId: 'me', name: 'Calcium carbonate', strength: '500 mg', medStatus: 'active', status: 'confirmed' }])
      await seed(page, 'bantay-log', 'meds', [{ personId: 'me', name: 'Calcium carbonate', medicationId: 'm1', takenAt: new Date().toISOString() }])
      await page.reload()
      await page.evaluate(() => { location.hash = '#health/nutrition' })
      await expect(page.getByRole('heading', { name: 'Food and nutrients' })).toBeVisible()
      const card = page.getByTestId('nutrients-today')
      // no birth date: amounts without a bar, and a plain reason
      await expect(card.getByText(/Add a birth date/)).toBeVisible()
      await expect(card.getByTestId('nrow-calciumMg')).toContainText('524 mg') // 24 from food + 500 from the supplement
      await expect(card.getByTestId('nrow-vitdUg')).toContainText('No number yet') // unknown, not 0
      await expect(card.getByTestId('nrow-sodiumMg').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '172')
      expect(await serious(page)).toEqual([])
      // a birth date (age 66) but no sex yet: asks once, then the targets appear
      await page.evaluate(() => new Promise<void>((res, rej) => {
        const o = indexedDB.open('bantay')
        o.onerror = () => rej(o.error)
        o.onsuccess = () => { const tx = o.result.transaction('profiles', 'readwrite'); tx.objectStore('profiles').put({ id: 'me', photoPath: null, phone: null, birthdate: '1960-05-01', bloodType: null, allergies: [], conditions: [], medicines: [], updatedAt: null }); tx.oncomplete = () => { o.result.close(); res() } }
      }))
      await page.reload() // a raw IndexedDB write is not seen by the live queries
      const sex = card.getByRole('group', { name: 'Sex for nutrient targets' })
      await expect(sex).toBeVisible()
      expect((await sex.getByRole('button', { name: 'Female' }).boundingBox())!.height).toBeGreaterThanOrEqual(48)
      await sex.getByRole('button', { name: 'Female' }).click()
      const calcium = card.getByTestId('nrow-calciumMg')
      await expect(calcium).toContainText('524 of 1,200 mg') // woman over 50: 1200 mg
      await expect(calcium).toContainText('food 24, supplements 500')
      await expect(calcium.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '524')
      await expect(card.getByTestId('nrow-ironMg')).toContainText('Target 8 mg') // women 51+: 8 mg
      await expect(card.getByTestId('supp-list')).toContainText('Calcium carbonate')
      await expect(card.getByText('From supplements')).toBeVisible()
      await expect(card.getByRole('link', { name: /ods\.od\.nih\.gov/ }).first()).toBeHidden() // sources sit inside the closed details
      await card.getByText('Where the targets come from').click()
      await expect(card.getByRole('link', { name: /ods\.od\.nih\.gov\/factsheets\/Calcium/ })).toBeVisible()
      // a doctor-set potassium limit turns the potassium target into a limit
      await expect(card.getByTestId('nrow-potassiumMg')).toContainText('Target 2,600 mg')
      await card.getByRole('textbox', { name: /potassium limit/i }).fill('2500')
      await card.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(card.getByTestId('nrow-potassiumMg')).toContainText('Limit 2,500 mg')
      await card.scrollIntoViewIfNeeded()
      await card.getByRole('heading', { name: "Today's nutrients" }).scrollIntoViewIfNeeded()
      await shot(page, 'nutrients-today', scheme)
      expect(await serious(page)).toEqual([])
      expect(await noSideways(page)).toBe(true)
    })
  })
}
