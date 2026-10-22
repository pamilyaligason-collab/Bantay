import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

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
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['label-content-name-mismatch']).analyze()).violations.map(brief)
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test.use({ viewport: { width: 390, height: 844 } })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme })
    test.beforeEach(async ({ page }) => { await skipOnboarding(page) })

    test('Today: the Self-care card runs a breath, then asks how I feel', async ({ page }) => {
      await page.goto('/')
      const card = page.getByTestId('selfcare')
      await expect(card.getByRole('heading', { name: 'Take a breath' })).toBeVisible()
      await card.scrollIntoViewIfNeeded()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/today-selfcare-${scheme}.png` })
      await card.getByRole('button', { name: /Sleep/ }).click()
      await expect(card.getByRole('link', { name: /Weil/ })).toBeVisible()
      await card.getByRole('button', { name: '1 min' }).click()
      await card.getByRole('button', { name: 'Start' }).click()
      await expect(card.getByRole('status')).toHaveText('Breathe in')
      await expect(page.getByTestId('sc-run')).toBeVisible()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/today-selfcare-running-${scheme}.png` })
      expect(await axe(page)).toEqual([])
      expect(await noSideways(page)).toBe(true)
      await card.getByRole('button', { name: 'End early' }).click()
      await expect(card.getByRole('button', { name: 'Start' })).toBeVisible()
    })

    test('Today: with reduced motion the circle does not move and the countdown carries it', async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto('/')
      await page.getByTestId('selfcare').getByRole('button', { name: 'Start' }).click()
      await expect(page.getByTestId('sc-run').locator('.sc-count')).toHaveText(/^[1-4]$/)
      expect(await page.locator('.sc-circle').evaluate((e) => (e as HTMLElement).style.transform)).toBe('')
    })

    test('Family: bubbles carry the status emoji; a bubble opens messages', async ({ page }) => {
      await page.goto('/#family')
      await expect(page.locator('h1')).toHaveText('Family')
      const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString() }
      await seed(page, 'bantay-health', 'people', [{ id: 'p1', name: 'Lloyd Roc' }, { id: 'p2', name: 'Papa Ben' }, { id: 'p3', name: 'Lola Remy' }])
      await page.reload()
      await seed(page, 'bantay-log', 'activity', [{ personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 40), source: 'manual' }, { personId: 'p2', kind: 'check-in', minutes: null, steps: null, startedAt: at(6, 55), source: 'manual' }])
      await page.reload()
      const roll = page.getByRole('list', { name: 'Family roll call' })
      await expect(roll.getByRole('button', { name: /^Papa Ben, OK / })).toBeVisible()
      await expect(roll.getByTestId('bubble-emoji')).toHaveText(['✅', '💤', '✅'])
      for (const b of await roll.getByRole('button').all()) {
        const box = await b.boundingBox()
        expect(box!.height).toBeGreaterThanOrEqual(48)
        expect(box!.width).toBeGreaterThanOrEqual(48)
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/family-bubbles-${scheme}.png` })
      expect(await axe(page)).toEqual([])
      expect(await noSideways(page)).toBe(true)

      await roll.getByRole('button', { name: /Lola Remy/ }).click()
      const dlg = page.getByRole('dialog', { name: 'Message Lola' })
      await expect(dlg).toBeVisible()
      await expect(dlg.getByRole('link', { name: 'Use Messenger for video' })).toHaveAttribute('href', 'https://www.messenger.com/')
      await expect(dlg.getByTestId('msg-state')).toHaveText('Messages need you to be signed in')
      await expect(dlg.getByRole('button', { name: 'Record a voice note' })).toBeVisible()
      await dlg.getByRole('button', { name: 'Record a voice note' }).click()
      await expect(dlg.getByRole('alert')).toContainText(/Microphone|microphone|Voice notes/)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/family-messages-${scheme}.png` })
      expect(await axe(page)).toEqual([])
      expect(await noSideways(page)).toBe(true)
    })
  })
}
