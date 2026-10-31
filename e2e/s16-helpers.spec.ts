import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertHero, assertJackClear, assertNoSideways, assertTargets, assertTextContrast } from './v13'

// Self-test of the v13 helpers: each must FAIL on a bad page, otherwise every lane gate is vacuous.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })

const page$ = (inner: string) => `<style>body{margin:0;background:#fff;font:17px sans-serif;color:#1c1b19}.bt{width:390px;height:844px;position:relative}.scroll{height:844px;overflow:auto;position:relative}</style><div class="bt"><main class="scroll">${inner}</main></div>`
const CLEAN = '<div data-hero><h1>Title</h1></div><button type="button" style="height:48px;width:120px">Okay</button><p>Body text</p>'
const load = (page: Page, inner: string) => page.setContent(page$(inner))

test('assertTargets names a 30 px button and passes a 48 px one', async ({ page }) => {
  await load(page, '<button type="button" style="height:30px;width:120px">Tiny</button>')
  await expect(assertTargets(page)).rejects.toThrow(/Tiny 120x30/)
  await load(page, CLEAN); await assertTargets(page)
})

test('assertTextContrast fails muted-on-white at 3.9:1 and passes ink; data-contrast-bg overrides a gradient', async ({ page }) => {
  await load(page, '<p style="color:#818181">Faint line</p>')
  await expect(assertTextContrast(page)).rejects.toThrow(/Faint line.*3\.9/)
  await load(page, CLEAN); await assertTextContrast(page)
  await load(page, '<div data-contrast-bg="#1C2F57" style="background:linear-gradient(#fff,#fff)"><p style="color:#fff">On the sky</p></div>'); await assertTextContrast(page)
  await load(page, '<div style="background:rgb(255 255 255 / .8)"><p style="color:#818181">Over glass</p></div>')
  await expect(assertTextContrast(page)).rejects.toThrow(/Over glass/)
})

test('assertNoSideways fails an element 20 px past the right edge', async ({ page }) => {
  await load(page, '<div style="position:absolute;left:0;top:0;width:410px;height:10px;background:red">wide</div>')
  await expect(assertNoSideways(page)).rejects.toThrow(/past the right edge/)
  await load(page, CLEAN); await assertNoSideways(page)
})

test('assertHero fails with two [data-hero] or none, passes with one', async ({ page }) => {
  await load(page, '<div data-hero>a</div><div data-hero>b</div>')
  await expect(assertHero(page)).rejects.toThrow(/exactly one/)
  await load(page, '<p>none</p>')
  await expect(assertHero(page)).rejects.toThrow(/exactly one/)
  await load(page, CLEAN); await assertHero(page)
})

test('assertJackClear passes on #today and fails when a control sits under the Jack button', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('.sh-jackfab')).toBeVisible()
  await assertJackClear(page)
  await page.evaluate(() => {
    const f = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
    const b = document.createElement('button')
    b.textContent = 'trap'
    b.style.cssText = `position:fixed;left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px;z-index:1`
    document.body.append(b)
  })
  await expect(assertJackClear(page)).rejects.toThrow(/Jack button/)
})
