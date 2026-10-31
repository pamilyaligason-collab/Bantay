import type { Page } from '@playwright/test'

/** Call before page.goto('/'). The OnboardingGate reads this localStorage flag (or kv onboarded). */
export const skipOnboarding = (page: Page) => page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))

/** Jack is the floating button: one tap opens the Jack sheet, Chat in it opens the assistant. */
export const openChat = async (page: Page) => {
  await page.getByTestId('jack').click()
  await page.getByTestId('jack-chat').click()
}
