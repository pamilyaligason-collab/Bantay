import { expect, type Page } from '@playwright/test'

/** Call before page.goto('/'). The OnboardingGate reads this localStorage flag (or kv onboarded). */
export const skipOnboarding = (page: Page) => page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))

/** The Weather screen opens a live Windy map by default (D-125): answer the embed so a test never reaches the internet. Call before page.goto. */
export const stubWindy = (page: Page) => page.route('**/embed.windy.com/**', (r) => r.fulfill({ body: '<html></html>', contentType: 'text/html' }))

/** Jack is the floating button: one tap opens the Jack sheet, Chat in it opens the assistant. */
export const openChat = async (page: Page) => {
  await page.getByTestId('jack').click()
  await page.getByTestId('jack-chat').click()
}

/** Wait until the app has resolved the signed-in member: it stamps `profile.selfUser` in its own kv store when getMember() answers (sync/profile.ts selfIdOrCached). The check-in row draws before that, so it is not a sign-in marker. */
export const signedIn = (page: Page) => expect.poll(() => page.evaluate(() => new Promise<boolean>((res) => {
  const o = indexedDB.open('bantay')
  o.onerror = () => res(false)
  o.onsuccess = () => {
    const d = o.result
    if (!d.objectStoreNames.contains('kv')) { d.close(); res(false); return }
    const g = d.transaction('kv').objectStore('kv').get('profile.selfUser')
    g.onsuccess = () => { d.close(); res(!!g.result?.value) }
    g.onerror = () => { d.close(); res(false) }
  }
})), { message: 'the member lookup finished' }).toBe(true)