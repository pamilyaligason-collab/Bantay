import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { NOW, seed } from './fixtures/s16/family'
import { assertJackClear, assertJackHit, assertNoSideways, assertTargets, setScheme, type JackAllow } from './v13'
import { shotPath } from './shotPath'

// D-109 lane F: who sees whom on Family. The signed-in phone is the family owner (invented: Rey Villar). Boards: D109FamilyMe (default), D109FamilyMa (Ma picked), D109Switch (the sheet).
// Rey can read five people, is a writer carer of Ma and Papa, and has no link to Tita or Kuya. Shots in docs/d109/shots/family with DOC_SHOTS=1, else under test-results/.
const SHOTS = shotPath('docs/d109/shots/family')
const API = 'https://bantay-test.supabase.test'
const UID = '66666666-6666-4666-8666-666666666666'
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 2_000_000_000 })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'rey@members.bantay.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const PEOPLE = [{ id: 'me', display_name: 'Rey Villar' }, { id: 'ma', display_name: 'Ma' }, { id: 'pa', display_name: 'Papa' }, { id: 'ti', display_name: 'Tita' }, { id: 'ku', display_name: 'Kuya' }]
const at = (d: number, h: number, m: number) => new Date(2026, 9, 27 - d, h, m, 0).toISOString()

async function mockOwner(page: Page, readOnly: string[] = []): Promise<void> { // readOnly: people Rey has a read-only link to
  await page.addInitScript(([token, u]) => {
    localStorage.setItem('sb-bantay-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 2_000_000_000, user: u }))
    localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Rey Villar' }, { personId: 'ma', displayName: 'Ma' }, { personId: 'pa', displayName: 'Papa' }, { personId: 'ti', displayName: 'Tita' }, { personId: 'ku', displayName: 'Kuya' }]))
  }, [jwt(), user] as const)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const reply = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (!url.pathname.startsWith('/rest/v1/')) return reply({})
    const t = url.pathname.replace('/rest/v1/', '')
    if (t.startsWith('rpc/')) return reply(null)
    if (t === 'people') return reply(url.searchParams.has('auth_user_id') ? [{ id: 'me' }] : PEOPLE)
    if (t === 'app_roles') return reply(url.searchParams.get('select') === 'is_owner' ? [{ is_owner: true }] : [{ role: 'admin', handle: null }])
    if (t === 'carers') return reply([{ person_id: 'ma' }, { person_id: 'pa' }, ...(url.searchParams.get('can_write') === 'eq.true' ? [] : readOnly.map((person_id) => ({ person_id })))]) // Ma and Papa are writer links; the read-only ones answer only the unfiltered read
    return reply([])
  })
}

type Data = { readings?: boolean; activity?: boolean; extraNeed?: boolean } // data states for the See all control: all on by default
async function open(page: Page, scheme: 'light' | 'dark', height: number, readOnly: string[] = [], data: Data = {}): Promise<void> {
  await page.setViewportSize({ width: 390, height })
  await skipOnboarding(page)
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await mockOwner(page, readOnly)
  await page.clock.setFixedTime(NOW)
  await page.goto('/#family')
  await expect(page.locator('h1')).toHaveText('Family')
  if (data.activity !== false) await seed(page, 'bantay-log', 'activity', [
    { personId: 'me', kind: 'check-in', minutes: null, steps: null, startedAt: at(0, 7, 40), source: 'manual' },
    { personId: 'ma', kind: 'check-in', minutes: null, steps: null, startedAt: at(0, 6, 55), source: 'manual' },
    { personId: 'pa', kind: 'check-in', minutes: null, steps: null, startedAt: at(1, 9, 0), source: 'manual' },
    { personId: 'ti', kind: 'check-in', minutes: null, steps: null, startedAt: at(0, 7, 10), source: 'manual' }
  ])
  await seed(page, 'bantay-log', 'medications', [{ clientId: 'm1', serverId: 'm1', personId: 'ma', name: 'Nasal spray', medStatus: 'active', schedule: { v: 1, times: ['08:00'] } }, ...(data.extraNeed ? [{ clientId: 'm2', serverId: 'm2', personId: 'pa', name: 'Eye drops', medStatus: 'active', schedule: { v: 1, times: ['08:00'] } }] : [])]) // due 8:00, unmarked at 10:20; extraNeed adds Papa's, so two need rows
  const days = [6, 5, 4, 3, 2, 1, 0]
  if (data.readings !== false) await seed(page, 'bantay-health', 'readings', days.flatMap((d, i) => [
    { personId: 'me', test: 'bp_systolic', value: 118 + (i % 3) * 3, unit: 'mmHg', takenAt: at(d, 7, 0) }, { personId: 'me', test: 'bp_diastolic', value: 76, unit: 'mmHg', takenAt: at(d, 7, 0) },
    { personId: 'ma', test: 'bp_systolic', value: 136 + (i % 3) * 3, unit: 'mmHg', takenAt: at(d, 7, 5) }, { personId: 'ma', test: 'bp_diastolic', value: 84, unit: 'mmHg', takenAt: at(d, 7, 5) },
    { personId: 'ti', test: 'bp_systolic', value: 168, unit: 'mmHg', takenAt: at(d, 7, 8) }, { personId: 'ti', test: 'bp_diastolic', value: 98, unit: 'mmHg', takenAt: at(d, 7, 8) }
  ]))
  await page.reload()
  await expect(page.getByTestId('person-card').first()).toBeVisible()
  await setScheme(page, scheme)
}

const top = (page: Page) => page.locator('.bt .scroll').evaluate((el) => { el.scrollTop = 0 })
const pill = (page: Page, who: string) => page.getByRole('button', { name: `Who to show: ${who}` })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test(`default: Family opens on Me, nobody else is named except Ma's missed medicine (${scheme})`, async ({ page }) => {
      await open(page, scheme, 1060) // the board is 1060 tall
      await expect(pill(page, 'Me')).toBeVisible()
      const cards = page.getByTestId('person-card')
      await expect(cards).toHaveCount(1)
      await expect(cards.first()).toHaveAttribute('aria-label', /^Rey Villar \(you\)\./)
      await expect(page.getByTestId('facesrow')).not.toContainText('checked in') // no "N of M checked in"
      await expect(page.locator('.lt-kicker')).not.toContainText('PEOPLE')
      // Needs: one line for Ma, no medicine name, no number
      const need = page.getByTestId('need-row')
      await expect(need).toHaveCount(1)
      await expect(need).toContainText('Ma: missed a medicine')
      await expect(page.getByTestId('needs')).not.toContainText(/Nasal|\d dose/)
      // People: Rey and the people linked to Rey; Tita and Kuya (owner-only) are in the pill, not on the page
      await expect(page.getByTestId('people-row')).toHaveCount(3)
      const text = (await page.locator('.bt .scroll').innerText()).replace(/\s+/g, ' ')
      expect(text).not.toMatch(/Tita|Kuya|Nasal spray/)
      await expect(page.getByTestId('activity')).toContainText('You')
      await expect(page.getByTestId('activity')).not.toContainText('Ma ·')
      await assertNoSideways(page)
      await assertTargets(page)
      await assertJackClear(page)
      await top(page)
      await page.screenshot({ path: `${SHOTS}/default-${scheme}.png` })
    })

    test(`a read-only link (Tita) shows the check-in alone, no flag word (${scheme})`, async ({ page }) => {
      await open(page, scheme, 844, ['ti'])
      await page.getByRole('button', { name: /See all/ }).click()
      const rows = page.getByTestId('people-row')
      await expect(rows).toHaveCount(4)
      const tita = rows.filter({ hasText: 'Tita' })
      await expect(tita).toContainText('OK today') // her check-in
      await expect(tita).not.toContainText(/Needs a look|high|to check|missed/i) // her 168 reading is not shown to a read-only viewer
      await expect(rows.filter({ hasText: 'Ma' }).first()).toContainText('2 to check') // a writer link keeps the flag word
      await expect(page.getByTestId('need-row')).toHaveCount(1) // only Ma: no line for Tita
      await expect(page.getByTestId('need-row')).not.toContainText('Tita')
    })

    // D-128: Jack covers no small control and no section link; only whole-card links may sit partly under him (named below, more than half tappable). Open Papa on a Needs row and See all are small controls: no allowance.
    const FAMILY_ALLOW: JackAllow[] = [{ name: 'People row', sel: '[data-testid="people-row"] .rw-main' }, { name: 'Needs row', sel: '[data-testid="need-row"] .rw-main' }, { name: 'Together row', sel: '[data-testid="together-list"] a.rw-main' }]
    const STATES: [string, Data, number][] = [['full data', {}, 1], ['no readings, one need row', { readings: false }, 1], ['no readings, two need rows', { readings: false, extraNeed: true }, 2], ['no activity, no readings, two need rows', { activity: false, readings: false, extraNeed: true }, 2]]
    for (const [name, data, needs] of STATES) {
      test(`four people, ${name}: no small control is under Jack, 390 x 844 and 450 x 949 (${scheme})`, async ({ page }) => {
        await open(page, scheme, 844, ['ti'], data)
        for (const [width, height] of [[390, 844], [450, 949]] as const) {
          await page.setViewportSize({ width, height })
          const more = page.getByRole('button', { name: 'See all (4)' })
          await expect(more).toBeVisible()
          await expect(page.getByTestId('need-row')).toHaveCount(needs)
          await expect(page.locator('.sh-jackfab')).toBeVisible() // so the check below is not vacuous
          await top(page)
          await assertJackHit(page, FAMILY_ALLOW, `${name} ${width}x${height} rest`) // every visible button at scroll 0, Open Papa and See all included: hit-tested, only the named whole-card links may be under him
          await more.scrollIntoViewIfNeeded()
          await assertJackHit(page, FAMILY_ALLOW, `${name} ${width}x${height} See all in view`, 'keep') // a peeked Jack: his real hit strip
          expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(44)
          await assertTargets(page)
          await top(page)
          await page.screenshot({ path: `${SHOTS}/seeall-${name.replace(/\W+/g, '-')}-${width}-${scheme}.png` })
        }
      })
    }

    test(`Open on Ma's line puts Ma on show: her card, Activity and the pill follow (${scheme})`, async ({ page }) => {
      await open(page, scheme, 844)
      await page.getByTestId('need-row').getByRole('button', { name: 'Open Ma' }).click()
      const card = page.getByTestId('person-card')
      await expect(card).toHaveCount(1)
      await expect(card).toHaveAttribute('aria-label', /^Ma\. Missed a medicine/)
      await expect(card.getByRole('button', { name: /Mark taken for Ma/ })).toBeVisible() // Rey is her writer carer
      await expect(card.getByRole('link', { name: 'Open Ma' })).toBeVisible()
      await expect(pill(page, 'Ma')).toBeVisible()
      const ac = page.getByTestId('activity')
      await expect(ac.getByTestId('week-chart')).toHaveAttribute('aria-label', /for Ma/)
      await expect(ac).not.toContainText('You')
      await expect(page).toHaveURL(/#family$/) // picking never moves the hash
      await assertNoSideways(page)
      await assertTargets(page)
      await assertJackClear(page)
      await top(page)
      await page.screenshot({ path: `${SHOTS}/selected-${scheme}.png` })
      // leaving Family forgets the pick: it opens on Me again
      await page.goto('/#health')
      await page.goto('/#family')
      await expect(pill(page, 'Me')).toBeVisible()
      await expect(page.getByTestId('person-card').first()).toHaveAttribute('aria-label', /^Rey Villar \(you\)\./)
    })

    test(`the Who to show sheet: Me, You care for, Everyone else; a view-only pick has no Mark taken (${scheme})`, async ({ page }) => {
      await open(page, scheme, 844)
      await pill(page, 'Me').click()
      const sheet = page.getByRole('dialog', { name: 'Who to show' })
      await expect(sheet).toBeVisible()
      await expect(sheet.getByText('You care for', { exact: true })).toBeVisible()
      await expect(sheet.getByText('Everyone else (only your account sees these)', { exact: true })).toBeVisible()
      await expect(sheet.getByText('Family opens on Me every time.')).toBeVisible()
      for (const n of ['Me', 'Ma', 'Papa', 'Tita', 'Kuya']) await expect(sheet.getByRole('button', { name: new RegExp(`^${n}`) })).toBeVisible()
      await expect(sheet.getByText('You are their carer')).toHaveCount(2)
      await expect(sheet.getByText('View only')).toHaveCount(2)
      await expect(sheet.getByText('Showing now')).toHaveCount(1)
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
      await page.screenshot({ path: `${SHOTS}/switch-${scheme}.png` })
      await sheet.getByRole('button', { name: /^Tita/ }).first().click()
      await expect(sheet).toHaveCount(0)
      await expect(pill(page, 'Tita')).toBeVisible()
      const card = page.getByTestId('person-card')
      await expect(card).toHaveAttribute('aria-label', /^Tita\. /)
      await expect(card.getByRole('button', { name: /Mark taken|Answer/ })).toHaveCount(0)
      await assertNoSideways(page)
    })
  })
}
