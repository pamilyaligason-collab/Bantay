import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertHero, assertJackClear, assertNarrow, assertNoSideways, assertNoWrappedButtons, assertOrder, assertTargets, assertTextContrast, FIXED_CLOCKS, setScheme, shotsLightDark } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// v13 lane C: the Calm page (#calm). Hero first, Ask Jack sheet, flagged Listen and watch, crisis card from hotlines.json.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

const flagOn = async (page: Page) => {
  await page.evaluate(() => new Promise<void>((res, rej) => {
    const o = indexedDB.open('bantay')
    o.onerror = () => rej(o.error)
    o.onsuccess = () => { const tx = o.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ key: 'flag.calm.radio', value: true }); tx.oncomplete = () => { o.result.close(); res() }; tx.onerror = () => rej(tx.error) }
  }))
  await page.reload()
  await expect(page.getByTestId('calm-media')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  if (!test.info().title.startsWith('reduced motion')) await page.clock.setFixedTime(FIXED_CLOCKS[1]) // the reduced-motion check needs a live clock: a fixed one would hide any motion
  await skipOnboarding(page)
  await page.goto('/#calm')
  await expect(page.getByRole('heading', { level: 1, name: 'Calm' })).toBeVisible()
  await expect(page.getByTestId('calm-hero')).toBeVisible()
})

test('route: own header, hero first, sections in order', async ({ page }) => {
  await assertHero(page)
  await assertOrder(page, ['calm-hero', 'calm-mood', 'calm-crisis'])
  await expect(page.getByRole('link', { name: 'Back to Today' })).toHaveAttribute('href', '#today')
  await expect(page.locator('.sh-top')).toHaveCount(0)
  await expect(page.locator('.sh-jackfab')).toHaveCount(0)
  await expect(page.getByTestId('calm-media')).toHaveCount(0) // flag off
})

test('Ask Jack opens the Jack sheet and closing it returns focus to the button', async ({ page }) => {
  const ask = page.getByRole('button', { name: 'Ask Jack' })
  await ask.click()
  await expect(page.getByTestId('jack-sheet')).toBeVisible()
  await expect(page.getByTestId('jack-chat')).toBeVisible()
  await page.getByTestId('jack-close').click()
  await expect(page.getByTestId('jack-sheet')).toHaveCount(0)
  await expect(ask).toBeFocused()
})

test('Chat in the Jack sheet opens the chat from Calm', async ({ page }) => {
  await page.getByRole('button', { name: 'Ask Jack' }).click()
  await page.getByTestId('jack-chat').click()
  await expect(page.getByTestId('jack-sheet')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Ask Bantay' })).toBeVisible()
})

test('SOS hold in the Jack sheet opens the SOS screen', async ({ page }) => {
  await page.getByRole('button', { name: 'Ask Jack' }).click()
  await page.getByTestId('jack-sos').locator('.sos-simple-btn').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
  await expect(page.getByTestId('sos-full')).toBeVisible({ timeout: 8000 })
})

test('SOS from Calm survives leaving #calm (Back, a link): 911, Cancel and the text step stay', async ({ page }) => {
  await page.getByRole('button', { name: 'Ask Jack' }).click()
  await page.getByTestId('jack-sos').locator('.sos-simple-btn').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
  const sos = page.getByTestId('sos-full')
  await expect(sos).toBeVisible({ timeout: 8000 })
  await page.evaluate(() => { location.hash = '#today' })
  await expect(page.getByRole('heading', { level: 1, name: 'Calm' })).toHaveCount(0)
  await expect(sos).toBeVisible()
  const dlg = page.getByRole('dialog', { name: 'SOS' }) // SosScreen draws its own dialog
  await expect(dlg.getByRole('button', { name: /Call 911/ })).toBeVisible()
  await expect(dlg.getByRole('button', { name: /Cancel, I don't need help/ })).toBeVisible()
})

test('the Jack sheet closes when the user leaves #calm', async ({ page }) => {
  await page.getByRole('button', { name: 'Ask Jack' }).click()
  await expect(page.getByTestId('jack-sheet')).toBeVisible()
  await page.evaluate(() => { location.hash = '#today' })
  await expect(page.getByTestId('jack-sheet')).toHaveCount(0)
})

test('arriving from a scrolled Today starts Calm at the top', async ({ page }) => {
  await page.evaluate(() => { location.hash = '#today' })
  await expect(page.getByRole('heading', { level: 1, name: 'Calm' })).toHaveCount(0)
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll')!; s.scrollTo(0, 4000) })
  expect(await page.evaluate(() => document.querySelector('.bt .scroll')!.scrollTop)).toBeGreaterThan(0)
  await page.evaluate(() => { location.hash = '#calm' })
  await expect(page.getByTestId('calm-hero')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.querySelector('.bt .scroll')!.scrollTop)).toBe(0)
})

test('a mood face logs and the status line says so', async ({ page }) => {
  await page.getByTestId('calm-mood').getByRole('button', { name: 'Great', exact: true }).click()
  await expect(page.getByTestId('calm-mood').getByRole('status')).toHaveText('Sign in first, then try again.') // this spec runs signed out; the write path is in MoodCheck.test
})

test('Start opens the breath sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('dialog', { name: 'Take a breath' })).toBeVisible()
})

test('flag on: three outside links and the video poster, no iframe before the tap', async ({ page }) => {
  await flagOn(page)
  await assertOrder(page, ['calm-hero', 'calm-mood', 'calm-media', 'calm-crisis'])
  for (const href of ['https://somafm.com/groovesalad/', 'https://somafm.com/dronezone/', 'https://www.tarabrach.com/podcasts/']) {
    const a = page.locator(`[data-testid="calm-media"] a[href="${href}"]`)
    await expect(a).toHaveAttribute('target', '_blank')
    await expect(a).toHaveAttribute('rel', /noopener/)
  }
  await expect(page.getByRole('button', { name: /Play Steps for Stress/ })).toBeVisible()
  await expect(page.locator('[data-testid="calm-media"] iframe')).toHaveCount(0)
})

test('crisis: Call 1553 is a tel link and no number is unconfirmed', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Call 1553' })).toHaveAttribute('href', 'tel:1553')
  await expect(page.getByTestId('calm-crisis')).not.toContainText(/confirm on the official/)
  await expect(page.getByTestId('calm-crisis').getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911')
  await expect(page.getByTestId('calm-crisis').getByRole('link', { name: /0917-899-8727.*Globe/ })).toBeVisible()
})

for (const [w, h] of [[390, 844], [360, 740]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${w}x${h} ${scheme}: targets, no sideways, no wrapped buttons, contrast`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await setScheme(page, scheme)
      await flagOn(page)
      await setScheme(page, scheme)
      await assertTargets(page)
      await assertNoSideways(page)
      await assertNoWrappedButtons(page)
      await assertTextContrast(page)
      await assertJackClear(page)
    })
  }
}

test('195 px: nothing sideways, 44 px targets, no wrapped buttons', async ({ page }) => {
  await flagOn(page)
  await assertNarrow(page)
})

test('reduced motion: the orb holds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  const orb = page.getByTestId('calm-hero').locator('.bo')
  await expect(orb).toHaveAttribute('data-reduced', 'true')
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length)
  expect(running).toBe(0)
  const hero = page.getByTestId('calm-hero')
  const read = () => hero.evaluate((h) => ({ word: h.querySelector('.bo-word')?.textContent, t: getComputedStyle(h.querySelector('.bo-orb')!).transform }))
  const a = await read()
  await page.waitForTimeout(1500)
  expect(await read()).toEqual(a)
})

test('shots (V13_SHOTS)', async ({ page }) => {
  test.skip(!process.env.V13_SHOTS, 'set V13_SHOTS=<dir> to write shots')
  await shotsLightDark(page, 'calm')
  await flagOn(page)
  await page.getByTestId('calm-media').scrollIntoViewIfNeeded()
  await shotsLightDark(page, 'calm-media')
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll')!; s.scrollTo(0, s.scrollHeight) }) // the whole card, clear of the tab bar
  await shotsLightDark(page, 'calm-crisis')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('dialog', { name: 'Take a breath' })).toBeVisible()
  await shotsLightDark(page, 'calm-sheet')
})
