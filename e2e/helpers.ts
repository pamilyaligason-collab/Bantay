import type { Page } from '@playwright/test'

/** Call before page.goto('/'). The OnboardingGate reads this localStorage flag (or kv onboarded). */
export const skipOnboarding = (page: Page) => page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))

/** Ask is a choice sheet now: tap the centre tab, then "Talk to Jack Jack" to reach the chat. */
export const openChat = async (page: Page) => {
  await page.getByRole('button', { name: 'Ask Bantay' }).click()
  await page.getByRole('button', { name: /Talk to Jack Jack/ }).click()
}
