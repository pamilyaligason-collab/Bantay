import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertHero, assertJackClear, assertNarrow, assertNoSideways, assertNoWrappedButtons, assertOrder, assertTargets, assertTextContrast, FIXED_CLOCKS, setScheme, shotsLightDark } from './v13'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// v13 lane C: the Calm page (#calm). Hero first, Ask Jack sheet, Listen and watch (on by default), crisis card from hotlines.json.
// S28 lane B: Listen and watch is the Discover radio (PH stations in three sections, one shared player, D-178) with the 4 checked videos below it in a 2-column grid.

// Specs do not depend on a live stream, so the stream address is stubbed with a local fixture: state logic only. 60 s of 8 kHz 8-bit silence, a WAV made here.
function silentWav(): Buffer {
  const n = 8000 * 60
  const b = Buffer.alloc(44 + n, 128)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40)
  return b
}
const STREAM = /^https:\/\/(azura\.(loveradio|easyrock|dzrh)\.com\.ph|hrmanila\.radioca\.st|playerservices\.streamtheworld\.com)\//
const row = (page: Page, id: 'love' | 'easyrock' | 'dzrh' | 'home' | 'magic') => page.getByTestId(`radio-${id}`)
// the player's audio element is never in the page: record each element that plays so a test can read its state
const spyAudio = (page: Page) => page.addInitScript(() => {
  const seen: HTMLMediaElement[] = []; (window as unknown as { __seen: HTMLMediaElement[] }).__seen = seen
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () { if (!seen.includes(this)) seen.push(this); return play.call(this) }
})
const audioState = (page: Page) => page.evaluate(() => (window as unknown as { __seen: HTMLMediaElement[] }).__seen.map((a) => ({ paused: a.paused, src: a.hasAttribute('src') })))

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })

test.beforeEach(async ({ page }) => {
  if (!test.info().title.startsWith('reduced motion')) await page.clock.setFixedTime(FIXED_CLOCKS[1]) // the reduced-motion check needs a live clock: a fixed one would hide any motion
  await skipOnboarding(page)
  await page.goto('/#calm')
  await expect(page.getByRole('heading', { level: 1, name: 'Calm' })).toBeVisible()
  await expect(page.getByTestId('calm-hero')).toBeVisible()
})

test('route: own header, hero first, sections in order', async ({ page }) => {
  await assertHero(page)
  await assertOrder(page, ['calm-hero', 'calm-exercises', 'calm-mood', 'calm-media', 'calm-crisis'])
  await expect(page.getByRole('link', { name: 'Back to Today' })).toHaveAttribute('href', '#today')
  await expect(page.locator('.sh-top')).toHaveCount(0)
  await expect(page.locator('.sh-jackfab')).toHaveCount(0)
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
  await page.getByTestId('calm-mood').getByRole('button', { name: 'Good', exact: true }).click()
  await expect(page.getByTestId('calm-mood').getByRole('status')).toHaveText('Sign in first, then try again.') // this spec runs signed out; the write path is in MoodCheck.test
})

test('C1: the page is deep navy (D-135, was teal), the orb is 220 px, text passes on it', async ({ page }) => {
  await expect(page.getByTestId('calm')).toHaveCSS('background-color', 'rgb(14, 27, 58)')
  await expect(page.getByTestId('calm')).toHaveCSS('color', 'rgb(255, 255, 255)')
  const box = await page.getByTestId('calm-hero').locator('.bo').boundingBox()
  expect([Math.round(box!.width), Math.round(box!.height)]).toEqual([220, 220])
  await assertTextContrast(page)
})

test('C2: Calm box + 5 min on the page, then Start runs that pattern', async ({ page }) => {
  const hero = page.getByTestId('calm-hero')
  await expect(hero.getByRole('button', { name: 'Sleep 4-7-8 · coming' })).toBeDisabled() // 4-7-8 waits for the clinician gate: the pill only says so
  await hero.getByRole('button', { name: 'Calm box' }).click()
  await hero.getByRole('button', { name: '5 min' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  const run = page.getByTestId('sc-run')
  await expect(run).toBeVisible()
  await expect(run).toContainText('Calm, breath 1')
  await expect(run.locator('.bs-clock')).toHaveText(/0[45]:\d\d/) // 5 min of 16 s breaths = 19 whole breaths = 304 s, so the clock reads 05:0x or 04:5x
})

test('C3: four mood tiles, 72 px or more, and the promise line', async ({ page }) => {
  const faces = page.getByTestId('calm-mood').locator('button[aria-label]')
  await expect(faces).toHaveCount(4)
  for (let i = 0; i < 4; i++) { const b = await faces.nth(i).boundingBox(); expect(b!.width).toBeGreaterThanOrEqual(72); expect(b!.height).toBeGreaterThanOrEqual(72) }
  await expect(page.getByTestId('calm-mood')).toContainText('If you feel unwell, call your family.') // signed out in this spec, so nobody is linked
})

test('Start opens the breath sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('dialog', { name: 'Take a breath' })).toBeVisible()
})

test('radio sections then the video posters; no stream or iframe before the tap', async ({ page }) => {
  await assertOrder(page, ['calm-hero', 'calm-mood', 'calm-media', 'calm-crisis'])
  await expect(page.getByTestId('calm-media').getByRole('heading', { level: 3 })).toHaveText(['Music & Light Rock', 'Pop & Mass', 'News & Talk'])
  await expect(page.locator('[data-testid="calm-media"] li.rd-st')).toHaveCount(5)
  await expect(page.getByRole('button', { name: /^Video, Steps for Stress/ })).toBeVisible() // the 4 video cards sit under the radio, no Show more
  await expect(page.getByTestId('calm-row').getByRole('button', { name: /^Video, / })).toHaveCount(4)
  await expect(page.locator('[data-testid="calm-media"] iframe')).toHaveCount(0)
  await expect(page.locator('audio')).toHaveCount(0)
})

for (const [w, h] of [[390, 844], [450, 949]] as const) {
  test(`${w}: layout: radio cards fill the width, 4 video cards in one column, crisis card after them`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    const m = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect()
      const cards = [...document.querySelectorAll('[data-testid="calm-media"] li.rd-st')].map((c) => c.getBoundingClientRect())
      const vids = [...document.querySelectorAll('[data-testid="calm-row"] .md-list > *')].map((c) => c.getBoundingClientRect())
      return { cardW: new Set(cards.map((c) => Math.round(c.width))).size, vidW: new Set(vids.map((c) => Math.round(c.width))).size, vids: vids.length, vidTops: new Set(vids.map((c) => Math.round(c.top))).size, rowTop: box('[data-testid="calm-row"]').top, lastRadio: Math.max(...cards.map((c) => c.bottom)), crisisTop: box('[data-testid="calm-crisis"]').top, rowBottom: box('[data-testid="calm-row"]').bottom }
    })
    expect(m.cardW).toBe(1)
    expect(m.vids).toBe(4); expect(m.vidW).toBe(1); expect(m.vidTops).toBe(4)
    expect(m.lastRadio).toBeLessThanOrEqual(m.rowTop) // videos come after every station
    expect(m.crisisTop).toBeGreaterThanOrEqual(m.rowBottom)
    for (const sz of await page.locator('[data-testid="calm-media"] .rd-play').evaluateAll((els) => els.map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))) expect(sz).toBeGreaterThanOrEqual(44)
  })
}

test('radio: an error shows the plain line, and offline disables Play with the offline note', async ({ page }) => {
  await page.route(STREAM, (r) => r.fulfill({ status: 403, body: '' }))
  await row(page, 'love').getByRole('button', { name: /^Play/ }).click()
  await expect(row(page, 'love')).toHaveAttribute('data-state', 'error')
  await expect(row(page, 'love')).toContainText('Could not connect, try again.')
  await page.context().setOffline(true)
  await expect(page.getByTestId('calm-media')).toContainText('You are offline.')
  await expect(row(page, 'easyrock').getByRole('button', { name: /^Play/ })).toBeDisabled()
  await page.context().setOffline(false)
  await expect(row(page, 'easyrock').getByRole('button', { name: /^Play/ })).toBeEnabled()
})

test('radio: an SOS from the Jack sheet stops it, with the real hold', async ({ page }) => {
  await spyAudio(page); await page.reload()
  await page.route(STREAM, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }))
  await row(page, 'love').getByRole('button', { name: /^Play/ }).click()
  await expect(row(page, 'love')).toHaveAttribute('data-state', 'playing')
  await page.getByRole('button', { name: 'Ask Jack' }).click()
  await page.getByTestId('jack-sos').locator('.sos-simple-btn').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
  await expect(page.getByTestId('sos-full')).toBeVisible({ timeout: 8000 })
  expect(await audioState(page)).toEqual([{ paused: true, src: false }])
})

test('radio: nothing is requested before a tap; Play shows Connecting, then Playing with bars; Stop ends it', async ({ page }) => {
  await spyAudio(page); await page.reload()
  const asked: string[] = []
  let hold = true
  await page.route(STREAM, async (r) => {
    asked.push(r.request().url())
    while (hold) await new Promise((res) => setTimeout(res, 20))
    await r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() })
  })
  await page.getByTestId('calm-media').scrollIntoViewIfNeeded()
  expect(asked).toEqual([])
  const g = row(page, 'love')
  await g.getByRole('button', { name: 'Play Love Radio' }).click()
  await expect(g).toHaveAttribute('data-state', 'connecting')
  await expect(g).toContainText('Connecting')
  await expect(g.locator('.rd-eq')).toHaveCount(0)
  hold = false
  await expect(g).toHaveAttribute('data-state', 'playing')
  await expect(g).toContainText('Playing now')
  await expect(g.locator('.rd-eq i')).toHaveCount(4)
  expect(asked[0]).toBe('https://azura.loveradio.com.ph/listen/love_radio_manila/radio.mp3')
  await g.getByRole('button', { name: 'Stop Love Radio' }).click()
  await expect(g).toHaveAttribute('data-state', 'idle')
  await expect(g.getByRole('button', { name: 'Play Love Radio' })).toBeVisible()
  expect(await audioState(page)).toEqual([{ paused: true, src: false }])
})

test('radio: starting one stops the other, through the one audio element', async ({ page }) => {
  await spyAudio(page); await page.reload()
  await page.route(STREAM, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }))
  await row(page, 'love').getByRole('button', { name: /^Play/ }).click()
  await expect(row(page, 'love')).toHaveAttribute('data-state', 'playing')
  await row(page, 'dzrh').getByRole('button', { name: /^Play/ }).click()
  await expect(row(page, 'dzrh')).toHaveAttribute('data-state', 'playing')
  await expect(row(page, 'love')).toHaveAttribute('data-state', 'idle')
  expect((await audioState(page)).length).toBe(1)
})

test('radio: stops on leaving Calm and keeps going at #calm/listen', async ({ page }) => {
  await spyAudio(page); await page.reload()
  await page.route(STREAM, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }))
  await row(page, 'love').getByRole('button', { name: /^Play/ }).click()
  await expect(row(page, 'love')).toHaveAttribute('data-state', 'playing')
  await page.evaluate(() => { location.hash = '#calm/listen' })
  await expect(page).toHaveURL(/#calm\/listen$/)
  await expect(row(page, 'love')).toHaveAttribute('data-state', 'playing')
  await page.evaluate(() => { location.hash = '#today' })
  await expect(page.getByTestId('calm-media')).toHaveCount(0)
  const s = await audioState(page)
  expect(s.length).toBeGreaterThan(0)
  for (const a of s) expect(a).toEqual({ paused: true, src: false })
})

test('radio: a failed address ends in one plain line, and Play tries again', async ({ page }) => {
  await page.route(STREAM, (r) => r.fulfill({ status: 403, body: '' }))
  const d = row(page, 'love')
  await d.getByRole('button', { name: /^Play/ }).click()
  await expect(d).toHaveAttribute('data-state', 'error')
  await expect(d).toContainText('Could not connect, try again.')
  await expect(d.getByRole('link', { name: /Official site/ })).toHaveAttribute('href', 'https://www.loveradio.com.ph/')
  await page.unroute(STREAM)
  await page.route(STREAM, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }))
  await d.getByRole('button', { name: /^Try Love Radio again/ }).click()
  await expect(d).toHaveAttribute('data-state', 'playing')
  await expect(d).not.toContainText('Could not connect')
})

test('reduced motion: no looping animation while the radio plays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(STREAM, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }))
  const g = row(page, 'love')
  await g.getByRole('button', { name: /^Play/ }).click()
  await expect(g).toHaveAttribute('data-state', 'playing')
  await expect(g).toContainText('Playing now')
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length)).toBe(0)
})

test('Today radio row opens Philippine radio in Listen (D-178)', async ({ page }) => {
  await page.goto('/#today')
  await page.getByRole('link', { name: /Relaxing radio/ }).click()
  await expect(page).toHaveURL(/#discover\/listen\/radio$/)
  await expect(page.getByTestId('radio')).toBeVisible()
  await expect(page.getByTestId('radio-sec-music')).toBeVisible()
})

test('nothing from YouTube or a station loads before a tap; only the video posters (i.ytimg.com)', async ({ page }) => {
  const hosts: string[] = []
  page.on('request', (r) => hosts.push(new URL(r.url()).hostname))
  await page.reload()
  await expect(page.getByTestId('calm-row').getByRole('button', { name: /^Video, / })).toHaveCount(4)
  await page.getByTestId('calm-media').scrollIntoViewIfNeeded()
  await page.waitForLoadState('networkidle')
  const POSTER_HOST = 'i.ytimg.com' // the one allowed outside host: still pictures, no cookies
  expect(hosts.filter((h) => /youtube-nocookie\.com$|youtube\.com$|loveradio\.com\.ph$|easyrock\.com\.ph$|dzrh\.com\.ph$|radioca\.st$|streamtheworld\.com$|979homeradio\.com$|magic899\.com$/.test(h))).toEqual([])
  expect(hosts.filter((h) => /(^|\.)(ytimg|ggpht|googlevideo)\./.test(h) && h !== POSTER_HOST)).toEqual([])
})

test('crisis: the Source link keeps one line at its 44 px height', async ({ page }) => {
  const src = page.getByTestId('calm-crisis').locator('a.cm-src')
  const h = await src.evaluate((a) => ({ link: a.getBoundingClientRect().height, line: a.parentElement!.getBoundingClientRect().height, display: getComputedStyle(a).display }))
  expect(h.display).toBe('inline-flex')
  expect(Math.round(h.link)).toBe(44) // its base: min-height 44, one line of text (it became block and 64 px when a media rule leaked onto it)
  expect(h.line).toBeLessThanOrEqual(48)
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
      await assertTargets(page)
      await assertNoSideways(page)
      await assertNoWrappedButtons(page)
      await assertTextContrast(page)
      await assertJackClear(page)
    })
  }
}

test('195 px: nothing sideways, 44 px targets, no wrapped buttons, the orb fits the screen', async ({ page }) => {
  await assertNarrow(page)
  await expect(page.getByTestId('calm-hero')).toBeVisible() // assertNarrow reloads; wait for the page before measuring
  const m = await page.evaluate(() => { const o = document.querySelector('[data-testid="calm-hero"] .bo')!.getBoundingClientRect(), h = document.querySelector('[data-testid="calm-hero"]')!.getBoundingClientRect(); return { w: o.width, h: o.height, right: o.right, heroRight: h.right, vw: window.innerWidth } })
  expect(m.w).toBeLessThanOrEqual(m.vw)
  expect(m.right).toBeLessThanOrEqual(m.heroRight - 16 + 0.5) // inside the hero's padding, not the 203 px of the old inline size
  expect(Math.abs(m.w - m.h)).toBeLessThan(1)
})

test('reduced motion: the orb holds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  const orb = page.getByTestId('calm-hero').locator('.bo')
  await expect(orb).toHaveAttribute('data-reduced', 'true')
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length)
  expect(running).toBe(0)
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  const hero = page.getByTestId('calm-hero')
  const read = () => hero.evaluate((h) => ({ word: h.querySelector('.bo-word')?.textContent, t: getComputedStyle(h.querySelector('.bo-orb')!).transform }))
  const a = await read()
  await page.waitForTimeout(1500)
  expect(await read()).toEqual(a)
})

test('shots (V13_SHOTS)', async ({ page }) => {
  test.skip(!process.env.V13_SHOTS, 'set V13_SHOTS=<dir> to write shots')
  await shotsLightDark(page, 'calm')
  await page.getByTestId('calm-media').scrollIntoViewIfNeeded()
  await shotsLightDark(page, 'calm-media')
  await page.route(STREAM, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() })) // a stub: the shot proves the card states, the live stream has its own headed check
  await row(page, 'love').getByRole('button', { name: /^Play/ }).click()
  await expect(row(page, 'love')).toHaveAttribute('data-state', 'playing')
  await shotsLightDark(page, 'calm-radio-playing')
  await row(page, 'love').getByRole('button', { name: /^Stop/ }).click()
  await page.evaluate(() => { const s = document.querySelector('.bt .scroll')!; s.scrollTo(0, s.scrollHeight) }) // the whole card, clear of the tab bar
  await shotsLightDark(page, 'calm-crisis')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('dialog', { name: 'Take a breath' })).toBeVisible()
  await shotsLightDark(page, 'calm-sheet')
})
