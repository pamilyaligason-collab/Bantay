import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './helpers'

// Session 12 lane F1: five tabs, the floating Jack button, Discover, and the PIN approval sheet mounted for every signed-in member.
test.use({ viewport: { width: 390, height: 844 } })

type Row = Record<string, unknown>
/** Put rows in a database the app has already created (open it once first, then reload so Dexie and its live queries see the rows). */
async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  // Wait until the app's own Dexie has created this database and store; a bare indexedDB.open would make an empty v1 database.
  await expect.poll(() => page.evaluate(async ([name, st]) => {
    if (!(await indexedDB.databases()).some((d) => d.name === name)) return false
    return new Promise<boolean>((res) => {
      const o = indexedDB.open(name as string)
      o.onerror = () => res(false)
      o.onsuccess = () => { const ok = o.result.objectStoreNames.contains(st as string); o.result.close(); res(ok) }
    })
  }, [dbName, store] as const)).toBe(true)
  await page.evaluate(async ([name, st, list]) => {
    await new Promise<void>((res, rej) => {
      const open = indexedDB.open(name as string)
      open.onerror = () => rej(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction(st as string, 'readwrite')
        for (const r of list as Row[]) tx.objectStore(st as string).put(r)
        tx.oncomplete = () => { open.result.close(); res() }
        tx.onerror = () => rej(tx.error)
      }
    })
  }, [dbName, store, rows] as const)
}

test.beforeEach(async ({ page }) => { await skipOnboarding(page) })

test('five tabs in order; Discover opens with its five sub-tabs and the Coming in this update card', async ({ page }) => {
  await page.goto('/#today')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('button')).toHaveCount(5)
  expect(await nav.getByRole('button').allTextContents()).toEqual(['Today', 'Health', 'Discover', 'Family', 'Safety'])
  await nav.getByRole('button', { name: 'Discover' }).click()
  await expect(page).toHaveURL(/#discover$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Discover' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Discover' })).toHaveAttribute('aria-current', 'page')
  const subs = page.getByRole('group', { name: 'Discover sections' })
  await expect(subs.getByRole('button')).toHaveCount(5)
  expect(await subs.getByRole('button').allTextContents()).toEqual(['Learn', 'Listen', 'Play', 'Watch', 'News'])
  await expect(page.getByText('Coming in this update')).toBeVisible()
  await subs.getByRole('button', { name: 'Watch' }).click()
  await expect(page).toHaveURL(/#discover\/watch$/)
  await expect(subs.getByRole('button', { name: 'Watch' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.sh-jackfab')).toBeVisible() // a sub-tab is still a tab page
  await expect(page.locator('.sh-top')).toHaveCount(1) // and keeps the top bar
})

test('Discover sub-tabs fit at 360 px without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/#discover')
  const subs = page.getByRole('group', { name: 'Discover sections' })
  await expect(subs).toBeVisible()
  const over = await page.evaluate(() => {
    const s = document.querySelector('[aria-label="Discover sections"]')!
    return [s.scrollWidth > s.clientWidth, document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth, ...Array.from(s.querySelectorAll('button')).map((b) => b.getBoundingClientRect().right > window.innerWidth)]
  })
  expect(over.some(Boolean)).toBe(false)
})

test('Jack: on the five tabs, off on full views and own-header pages', async ({ page }) => {
  for (const h of ['today', 'health', 'discover', 'family', 'safety']) {
    await page.goto('/#' + h)
    await expect(page.locator('.sh-jackfab'), h).toBeVisible()
  }
  for (const h of ['me', 'notif', 'privacy', 'sharing', 'weather', 'docs', 'family/people/someone']) {
    await page.goto('/#' + h)
    await page.waitForTimeout(250)
    await expect(page.locator('.sh-jackfab'), h).toHaveCount(0)
  }
})

test('Jack is 56 px, a tap opens the chat, Back closes it, a hold opens the Ask sheet', async ({ page }) => {
  await page.goto('/#today')
  const jack = page.getByRole('button', { name: 'Ask Bantay' })
  const b = (await jack.boundingBox())!
  expect([b.width, b.height]).toEqual([56, 56])
  await jack.click()
  const chat = page.getByRole('dialog', { name: 'Ask Bantay' })
  await expect(chat).toBeVisible()
  await expect(chat.getByRole('button', { name: 'Back' })).toBeVisible()
  await chat.getByRole('button', { name: 'Back' }).click()
  await expect(chat).toHaveCount(0)
  await expect(jack).toBeFocused() // focus comes back to the button that opened Jack
  const c = (await jack.boundingBox())!
  await page.mouse.move(c.x + 28, c.y + 28)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await expect(page.getByRole('dialog', { name: 'What would you like to do?' })).toBeVisible()
  await expect(chat).toHaveCount(0) // the release did not also open Jack
})

test('Simple mode has no Jack button and no tab bar', async ({ page }) => {
  await page.goto('/#today')
  await expect(page.locator('.sh-jackfab')).toBeVisible()
  await seed(page, 'bantay', 'kv', [{ key: 'mode.simple', value: true }])
  await page.reload()
  await expect(page.locator('.bt[data-simple]')).toBeAttached()
  await expect(page.locator('.sh-jackfab')).toHaveCount(0)
  await expect(page.locator('.bt[data-simple] .tabbar')).toBeHidden()
})

test('PIN approval sheet shows on any tab for a pin_approve row; Not Mama marks it seen and closes it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'p-mama', displayName: 'Mama Rosa', handle: 'mama', provider: 'pin' }])))
  await page.goto('/#health')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible() // the app has opened its alert database
  await seed(page, 'bantay-alerts', 'alerts', [{ id: 'a1', personId: 'p-mama', kind: 'pin_approve', template: 'pin_approve', ref: 'req-1', createdAt: new Date().toISOString(), pushedAt: null, seenAt: null, expiresAt: new Date(Date.now() + 3600_000).toISOString() }])
  await page.reload()
  const sheet = page.getByRole('dialog', { name: /Mama wants a new PIN/ })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText(/4-digit number on their screen/)).toBeVisible()
  await sheet.getByRole('button', { name: /Not Mama/ }).click()
  await expect(sheet).toHaveCount(0)
  await page.reload()
  await page.waitForTimeout(400)
  await expect(page.getByRole('dialog', { name: /wants a new PIN/ })).toHaveCount(0) // seen rows do not come back
})
