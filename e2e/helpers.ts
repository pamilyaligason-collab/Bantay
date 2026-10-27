import type { Page } from '@playwright/test'

/** Call before page.goto('/'). The OnboardingGate reads this localStorage flag (or kv onboarded). */
export const skipOnboarding = (page: Page) => page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))

/** Jack is the floating button now: one tap opens the chat. (Press and hold, or right click, opens the Ask choice sheet.) */
export const openChat = async (page: Page) => {
  await page.getByRole('button', { name: 'Ask Bantay' }).click()
}
