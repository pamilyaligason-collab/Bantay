import { expect, test } from '@playwright/test'
import { adminNoLink, adminWriter, member, mockActing, openPicker } from './fixtures/s16/acting'

// S16 L6 privacy gate (D-99). Runs in the "auth" project; the wire is mocked, data invented.
test.use({ viewport: { width: 390, height: 844 } })

test('a member account has no View as row, no bar, and sees themselves', async ({ page }) => {
  await mockActing(page, member)
  for (const hash of ['#me', '#me/family']) {
    await page.goto(`/${hash}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.getByTestId('viewas-row')).toHaveCount(0)
  }
  await page.goto('/#today')
  await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
})

test('an admin with no carer link gets the one reason sentence on the bar, and the audit row is written once', async ({ page }) => {
  const seen = await mockActing(page, adminNoLink)
  await openPicker(page)
  const sheet = page.getByRole('dialog', { name: 'View as' })
  await expect(sheet.getByText('Needs internet to switch')).toBeVisible()
  await expect(sheet.getByText('Every view is recorded in the family history.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Lloyd' })).toHaveCount(0) // you cannot act as yourself
  await sheet.getByRole('button', { name: 'Mama' }).click()
  const bar = page.getByTestId('viewas-bar').first()
  await expect(bar).toContainText('Acting as Mama')
  await expect(bar).toContainText('You can see Mama but not log for Mama. Ask Mama (or an admin) to make you a carer with edit access.')
  expect(seen.audits).toEqual([{ p_person: 'p-mama' }])
})

test('the acting id is memory only: a reload returns to yourself and nothing is stored', async ({ page }) => {
  await mockActing(page, adminWriter)
  await openPicker(page)
  await page.getByRole('dialog', { name: 'View as' }).getByRole('button', { name: 'Mama' }).click()
  await expect(page.getByTestId('viewas-bar').first()).toContainText('Acting as Mama')
  const stored = await page.evaluate(async () => {
    const ls = Object.entries(localStorage).filter(([k, v]) => /acting|viewas/i.test(k) || /acting/i.test(String(v))).map(([k]) => k)
    const dbs = await indexedDB.databases()
    return { ls, dbs: dbs.map((d) => d.name) }
  })
  expect(stored.ls).toEqual([])
  await page.reload()
  await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
})

test('Exit on the bar ends it, and the bar has no horizontal overflow at 360', async ({ page }) => {
  await mockActing(page, adminNoLink)
  await page.setViewportSize({ width: 360, height: 800 })
  await openPicker(page)
  await page.getByRole('dialog', { name: 'View as' }).getByRole('button', { name: 'Mama' }).click()
  const bar = page.getByTestId('viewas-bar').first()
  const box = await bar.boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(360)
  await bar.getByRole('button', { name: 'Exit' }).click()
  await expect(page.getByTestId('viewas-bar')).toHaveCount(0)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`390 px bar and picker shots (${scheme})`, async ({ page }) => {
    test.skip(!process.env.S16_SHOTS, 'S16_SHOTS not set')
    await page.emulateMedia({ colorScheme: scheme })
    await mockActing(page, adminNoLink)
    await openPicker(page)
    await page.screenshot({ path: `docs/session-16/shots/L6/picker-${scheme}.png` })
    await page.getByRole('dialog', { name: 'View as' }).getByRole('button', { name: 'Mama' }).click()
    await page.evaluate(() => { location.hash = '#today' }) // not goto: a reload clears the memory-only acting id
    await expect(page.getByTestId('viewas-bar').first()).toBeVisible()
    await page.screenshot({ path: `docs/session-16/shots/L6/bar-${scheme}.png` })
  })
}

// Needs L1 (NextUp / QuickLog / StormCard pass the acting id and lock with "View only") and L5 (the row in Settings) merged.
test.fixme('an admin with no carer link sees View only on Take and cannot log for Mama', async () => { /* written after the L1 merge */ })
