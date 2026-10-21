import { expect, test, type Page } from '@playwright/test'
import { openChat, skipOnboarding } from './helpers'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

// The build must know the webhook URL: VITE_ASSISTANT_URL=https://assistant.test/hook PW_PORT=4325 npm run e2e
const HOOK = 'https://assistant.test/hook'
const configured = process.env.VITE_ASSISTANT_URL === HOOK

const count = (page: Page, dbName: string, store: string) =>
  page.evaluate(
    ([d, s]) =>
      new Promise<number>((res, rej) => {
        const r = indexedDB.open(d!)
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          if (!r.result.objectStoreNames.contains(s!)) { r.result.close(); return res(0) } // nothing logged yet
          const c = r.result.transaction(s!, 'readonly').objectStore(s!).count()
          c.onsuccess = () => { r.result.close(); res(c.result) }
        }
      }),
    [dbName, store]
  )

const seedPerson = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const r = indexedDB.open('bantay-health')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const tx = r.result.transaction('people', 'readwrite')
          tx.objectStore('people').put({ id: 'p1', name: 'Test Person' })
          tx.oncomplete = () => { r.result.close(); res() }
        }
      })
  )

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page)
})

test('button opens a dialog, Esc closes it, focus returns', async ({ page }) => {
  await page.goto('/')
  const fab = page.getByRole('button', { name: 'Ask Bantay' })
  await expect(fab).toBeVisible()
  await openChat(page)
  await expect(page.getByRole('dialog', { name: 'Ask Bantay' })).toBeVisible()
  await expect(page.getByLabel('Your question')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(fab).toBeFocused()
})

test('focus stays inside the sheet and the Back gesture closes it', async ({ page }) => {
  await page.goto('/')
  await openChat(page)
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true)
  }
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('h1')).toHaveText('Today')
})

test.describe('with a mocked webhook', () => {
  test.skip(!configured, `build with VITE_ASSISTANT_URL=${HOOK}`)

  test('Confirm saves one record, Discard saves none', async ({ page }) => {
    let auth: string | undefined
    let body: { messages: unknown[] } | undefined
    await page.route(HOOK, async (route) => {
      auth = route.request().headers()['authorization']
      body = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        json: { reply: 'Here is a draft.', tool_calls: [{ name: 'log_med_taken', arguments: { person: 'Test Person', name: 'Test Med' } }] }
      })
    })
    await page.route(HOOK, (route) => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }) : route.fallback())
    await page.goto('/')
    // Opening the sheet makes Dexie create the health database; seed after that.
    await openChat(page)
    await page.keyboard.press('Escape')
    await seedPerson(page)
    const ask = async () => {
      await openChat(page)
      await page.getByLabel('Your question').fill('I took my test med')
      await page.getByRole('button', { name: 'Send' }).click()
      await expect(page.getByRole('group', { name: /Draft/ })).toBeVisible()
    }
    await ask()
    expect(auth).toBeUndefined() // this build has no Supabase env, so no session; the Bearer header is unit tested
    expect(body!.messages).toHaveLength(1)
    await page.getByRole('button', { name: 'Discard' }).click()
    expect(await count(page, 'bantay-log', 'meds')).toBe(0)
    await page.getByLabel('Your question').fill('again')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText('Saved for Test Person.')).toBeVisible()
    expect(await count(page, 'bantay-log', 'meds')).toBe(1)
  })

  test('open_screen navigates by hash', async ({ page }) => {
    await page.route(HOOK, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
        : route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { reply: 'Sure.', tool_calls: [{ name: 'open_screen', arguments: { tab: 'health' } }] } })
    )
    await page.goto('/')
    await openChat(page)
    await page.getByLabel('Your question').fill('show health')
    await page.getByRole('button', { name: 'Send' }).click()
    await page.getByRole('button', { name: 'Open Health' }).click()
    await expect(page).toHaveURL(/#health$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('server limit shows a friendly message', async ({ page }) => {
    await page.route(HOOK, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
        : route.fulfill({ status: 429, headers: { 'access-control-allow-origin': '*' }, json: { error: 'limit' } })
    )
    await page.goto('/')
    await openChat(page)
    await page.getByLabel('Your question').fill('hi')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText(/used all of today/)).toBeVisible()
  })
})
