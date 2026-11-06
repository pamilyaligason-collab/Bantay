import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'
import { pickPerson } from './fixtures/v13/family'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = process.env.SHOT_DIR

// Session 9 W2-FAMILY: Today self-care (breathing), check-in hidden once logged, family status bubbles, the message sheet. No Supabase here, so the thread shows its plain "signed in" state.
const seed = (page: Page, db: string, store: string, rows: unknown[]) =>
  page.evaluate(async ([d, s, r]) => {
    const once = () => new Promise<void>((res, rej) => {
      const o = indexedDB.open(d as string)
      o.onupgradeneeded = () => o.transaction!.abort()
      o.onerror = () => rej(o.error)
      o.onsuccess = () => {
        const h = o.result
        try {
          const tx = h.transaction(s as string, 'readwrite')
          for (const row of r as unknown[]) tx.objectStore(s as string).put(row)
          tx.oncomplete = () => { h.close(); res() }
          tx.onerror = () => { h.close(); rej(tx.error) }
        } catch (e) { h.close(); rej(e) }
      }
    })
    for (let i = 0; i < 50; i++) { try { return await once() } catch { await new Promise((x) => setTimeout(x, 100)) } }
    throw new Error(`could not seed ${d as string}`)
  }, [db, store, rows] as const)
const brief = (v: { id: string; nodes: { target: unknown; any?: { message: string }[] }[] }) => `${v.id}: ${v.nodes.map((n) => `${String(n.target)} ${n.any?.[0]?.message ?? ''}`).join(' | ')}`
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.map(brief)
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test.use({ viewport: { width: 390, height: 844 } })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme })
    test.beforeEach(async ({ page }) => { await skipOnboarding(page) })

    test('Today: the Self-care row opens the full Calm screen (D-142)', async ({ page }) => {
      await page.goto('/')
      const card = page.getByTestId('selfcare')
      await expect(card.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
      await card.scrollIntoViewIfNeeded()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/today-selfcare-${scheme}.png` })
      expect(await axe(page)).toEqual([])
      expect(await noSideways(page)).toBe(true)
      await card.getByRole('link', { name: 'Start breathing' }).click()
      await expect(page).toHaveURL(/#calm$/)
      await expect(page.getByRole('dialog', { name: 'Take a breath' })).toHaveCount(0)
    })

    test('Family: bubbles carry the status emoji; a bubble opens the person page', async ({ page }) => {
      await page.goto('/#family')
      await expect(page.locator('h1')).toHaveText('Family')
      const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString() }
      await seed(page, 'bantay-health', 'people', [{ id: 'p1', name: 'Rey Villar' }, { id: 'p2', name: 'Papa Ben' }, { id: 'p3', name: 'Lola Remy' }])
      await page.reload()
      await seed(page, 'bantay-log', 'activity', [{ personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 40), source: 'manual' }, { personId: 'p2', kind: 'check-in', minutes: null, steps: null, startedAt: at(6, 55), source: 'manual' }])
      await page.reload()
      // v13: the roll call is a carousel of person cards; each card's label carries name and status words, the Open link goes to the person page.
      // D-109: one card at a time, picked in the "Who to show" pill.
      const roll = page.getByRole('group', { name: 'Family roll call' })
      await pickPerson(page, 'Papa Ben')
      await expect(roll.getByRole('article', { name: /^Papa Ben\. OK / })).toBeVisible()
      await expect(roll.getByTestId('person-card')).toHaveCount(1)
      for (const b of await roll.locator('.pc a, .pc button').all()) {
        const box = await b.boundingBox()
        expect(box!.height).toBeGreaterThanOrEqual(44)
        expect(box!.width).toBeGreaterThanOrEqual(44)
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/family-bubbles-${scheme}.png` })
      expect(await axe(page)).toEqual([])
      expect(await noSideways(page)).toBe(true)

      await pickPerson(page, 'Lola Remy')
      await roll.getByRole('link', { name: 'Open Lola' }).click()
      await expect(page).toHaveURL(/#family\/people\/p3$/)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/family-member-${scheme}.png` })
      expect(await axe(page)).toEqual([])
      expect(await noSideways(page)).toBe(true)
    })
  })
}
