import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { assertHero, assertJackClear, assertJackHit, assertNoSideways, assertTargets, assertTextContrast } from './v13'

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
  await load(page, '<div style="background:color-mix(in srgb,#D97706 22%,#fff)"><p style="color:#1c1b19">Mix</p></div>'); await assertTextContrast(page)
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

test('assertJackClear fails a control under the Jack button, at the end and (new) at rest', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('.sh-jackfab')).toBeVisible()
  await assertJackClear(page, { at: 'end' })
  await page.evaluate(() => {
    const f = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
    const b = document.createElement('button')
    b.textContent = 'trap'
    b.style.cssText = `position:fixed;left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px;z-index:1`
    document.body.append(b)
  })
  await expect(assertJackClear(page, { at: 'end' })).rejects.toThrow(/at end:.*Jack button/s)
  await expect(assertJackClear(page, { at: 'rest' })).rejects.toThrow(/at rest:.*Jack button/s)
  await expect(assertJackClear(page)).rejects.toThrow(/at rest:/) // default is both, rest first
})

test('assertJackClear at rest catches a button that only sits under Jack at scroll 0', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('.sh-jackfab')).toBeVisible()
  await page.evaluate(() => {
    const f = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
    const sc = document.querySelector('.bt .scroll') as HTMLElement
    const b = document.createElement('button')
    b.textContent = 'rest-trap'
    b.style.cssText = `position:absolute;left:${f.left}px;top:${f.top + sc.scrollTop}px;width:${f.width}px;height:${f.height}px`
    sc.append(b) // scrolls away with the page: under Jack at rest only
  })
  await expect(assertJackClear(page, { at: 'rest' })).rejects.toThrow(/at rest:.*rest-trap/s)
  await assertJackClear(page, { at: 'end' })
})

test('assertJackHit fails a control whose centre is under Jack (allowed or not) and passes one that is clear', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('.sh-jackfab')).toBeVisible()
  await page.evaluate(() => { // a button under Jack's disc, z-index 0 so Jack is the top element
    const f = document.querySelector('.sh-jackfab')!.getBoundingClientRect()
    const b = document.createElement('button')
    b.className = 'trap'
    b.textContent = 'trap'
    b.style.cssText = `position:fixed;left:${f.left}px;top:${f.top}px;width:${f.width}px;height:${f.height}px;z-index:0`
    document.body.append(b)
  })
  await expect(assertJackHit(page, [], 'trap plain', 'keep')).rejects.toThrow(/centre under Jack/)
  await expect(assertJackHit(page, [{ name: 'trap', sel: 'button.trap' }], 'trap allowed', 'keep')).rejects.toThrow(/centre under Jack/)
  await page.evaluate(() => document.querySelector('.trap')?.remove())
  await assertJackHit(page, [], 'clear', 'keep')
})

test('assertJackHit centre rule: a wide allowed control that is mostly tappable still fails when its centre is on Jack', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#today')
  await expect(page.locator('.sh-jackfab')).toBeVisible()
  const put = (cls: string, dx: number) => page.evaluate(([cls, dx]) => { // a 2x wide, Jack-high button in Jack's own container, one layer under him (z-index 5 vs his 6), centre dx px right of his centre
    const fab = document.querySelector('.sh-jackfab') as HTMLElement
    const w = fab.offsetWidth * 2
    const b = document.createElement('button')
    b.className = cls as string
    b.textContent = cls as string
    b.style.cssText = `position:absolute;left:${fab.offsetLeft + fab.offsetWidth / 2 + (dx as number) - w / 2}px;top:${fab.offsetTop}px;width:${w}px;height:${fab.offsetHeight}px;z-index:5`
    fab.parentElement!.append(b)
  }, [cls, dx] as const)
  await put('wide', 0) // centre on Jack's centre; measured 54 % tappable, so it passes the old tappable rule; the regex pins >50 % so this cannot go vacuous if Jack grows
  await expect(assertJackHit(page, [{ name: 'wide', sel: 'button.wide' }], 'wide allowed', 'keep')).rejects.toThrow(/(5[1-9]|[6-9]\d|100)% tappable, centre under Jack/)
  await page.evaluate(() => document.querySelector('.wide')?.remove())
  await put('wide-ctl', -50) // control: same size, centre 50 px left of Jack's centre (outside his disc), still touching him and mostly tappable: the allowance passes
  await assertJackHit(page, [{ name: 'wide', sel: 'button.wide-ctl' }], 'wide control', 'keep')
})
