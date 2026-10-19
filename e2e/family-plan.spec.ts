import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo
const SHOTS = process.env.SHOT_DIR // set to save 390x844 shots for the screenshot gate

/** Raw IndexedDB writes into the stores the app's Dexie databases created. Retries until the app has opened the database (never creates one). */
const seed = (page: Page, db: string, store: string, rows: unknown[]) =>
  page.evaluate(async ([d, s, r]) => {
    const once = () => new Promise<void>((res, rej) => {
      const o = indexedDB.open(d as string)
      o.onupgradeneeded = () => o.transaction!.abort() // the database does not exist yet: do not create an empty one
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
    for (let i = 0; i < 50; i++) {
      try { return await once() } catch { await new Promise((x) => setTimeout(x, 100)) }
    }
    throw new Error(`could not seed ${d as string}`)
  }, [db, store, rows] as const)

const brief = (v: { id: string; nodes: { target: unknown; any?: { message: string }[] }[] }) => `${v.id}: ${v.nodes.map((n) => `${String(n.target)} ${n.any?.[0]?.message ?? ''}`).join(' | ')}`

test.use({ viewport: { width: 390, height: 844 } })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme })

    test.beforeEach(async ({ page }) => {
      await skipOnboarding(page)
      await page.goto('/#family')
      await expect(page.locator('h1')).toHaveText('Family')
      const today = new Date()
      const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString() }
      await seed(page, 'bantay-health', 'people', [{ id: 'p1', name: 'Lloyd Roc' }, { id: 'p2', name: 'Papa Ben' }, { id: 'p3', name: 'Lola Remy' }])
      await seed(page, 'bantay-log', 'activity', [{ personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 40), source: 'manual' }, { personId: 'p2', kind: 'check-in', minutes: null, steps: null, startedAt: at(6, 55), source: 'manual' }])
      await seed(page, 'bantay', 'profiles', [{ id: 'p2', photoPath: null, phone: '+63 917 123 4567', birthdate: `${today.getFullYear() - 72}-03-05`, bloodType: null, allergies: [], conditions: [], medicines: [], updatedAt: null }])
      await page.reload()
      await expect(page.locator('h1')).toHaveText('Family')
    })

    test('Plan: add an event, a task and a note offline, they survive a reload, and the page is accessible', async ({ page, context }) => {
      await page.getByRole('button', { name: 'Plan' }).click()
      await expect(page).toHaveURL(/#family\/plan$/)
      await context.setOffline(true)
      await expect(page.getByText("Add a reminder for Lola's check-up.")).toBeVisible()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-plan-empty-${scheme}.png` })
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByRole('button', { name: 'Event', exact: true }).click()
      await page.getByLabel('What is happening?').fill('Family dinner at Lola')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-plan-add-${scheme}.png` })
      await page.getByRole('button', { name: 'Save' }).click()
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByLabel('What needs doing?').fill('Buy maintenance medicines')
      await expect(page.getByLabel('Who does it?').locator('option')).toHaveCount(4)
      await page.getByLabel('Who does it?').selectOption('p2')
      await page.getByRole('button', { name: 'Save' }).click()
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByRole('button', { name: 'Note', exact: true }).click()
      await page.getByLabel('Note for the family').fill('Gate code 1234')
      await page.getByLabel('Pin it to the top').check()
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await context.setOffline(false) // the writes above all happened offline; a reload needs the page itself
      await page.reload()
      await expect(page.getByText('Family dinner at Lola')).toBeVisible()
      await expect(page.getByText('Gate code 1234')).toBeVisible()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-plan-today-${scheme}.png` })
      await page.getByRole('checkbox', { name: 'Buy maintenance medicines' }).click()
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: 'Buy maintenance medicines' })).toHaveAttribute('aria-checked', 'true')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-plan-done-${scheme}.png` })
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(r.violations.map(brief)).toEqual([])
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(wide).toBe(false)
    })

    test('People: roll call, member page, and the phone health switches stay reachable', async ({ page }) => {
      await page.goto('/#family')
      await expect(page.getByRole('list', { name: 'Family roll call' })).toBeVisible()
      await expect(page.getByText('No check-in today')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Phone health data' })).toBeVisible()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-people-${scheme}.png` })
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(r.violations.map(brief)).toEqual([])
      await page.getByRole('button', { name: /Papa Ben/ }).click()
      await expect(page).toHaveURL(/#family\/people\/p2$/)
      await expect(page.locator('h1')).toHaveText('Papa Ben')
      await expect(page.getByRole('link', { name: 'Call Papa' })).toHaveAttribute('href', 'tel:+639171234567')
      await expect(page.getByText(/72 years old/)).toBeVisible()
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/app-member-${scheme}.png` })
      const m = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(m.violations.map(brief)).toEqual([])
      await page.getByRole('button', { name: /Back to People/ }).click()
      await expect(page.getByRole('list', { name: 'Family roll call' })).toBeVisible()
    })
  })
}
