import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { skipOnboarding } from './helpers'

test.describe('movement on Today (web, no step counter)', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Did you walk today?' })).toBeVisible()
  })

  test('one tap logs one manual walk and the summary updates', async ({ page }) => {
    await expect(page.getByText('Nothing logged yet today')).toBeVisible()
    await page.getByRole('button', { name: '20 min' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'about 20 minutes' })).toBeVisible()
    await expect(page.getByText('20 min moving')).toBeVisible()
    const rows = await page.evaluate(
      () =>
        new Promise<{ minutes: number; source: string }[]>((res, rej) => {
          const open = indexedDB.open('bantay-log')
          open.onerror = () => rej(open.error)
          open.onsuccess = () => {
            const all = open.result.transaction('activity').objectStore('activity').getAll()
            all.onsuccess = () => res(all.result)
          }
        })
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ minutes: 20, source: 'manual' })
  })

  test('custom minutes', async ({ page }) => {
    await page.getByLabel('Other number of minutes').fill('35')
    await page.getByRole('button', { name: 'Log', exact: true }).click()
    await expect(page.getByText('35 min moving')).toBeVisible()
  })

  test('Today has no serious accessibility violations with the movement cards', async ({ page }) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  })
})

test('Family shows the phone health explainer on the web', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#family')
  await expect(page.getByRole('heading', { name: 'Phone health data' })).toBeVisible()
  await expect(page.getByText(/need the Bantay app/)).toBeVisible()
})
