import type { Page } from '@playwright/test'

/** Call before page.goto('/'). The OnboardingGate reads this localStorage flag (or kv onboarded). */
export const skipOnboarding = (page: Page) => page.addInitScript(() => localStorage.setItem('bantay.onboarded', '1'))
