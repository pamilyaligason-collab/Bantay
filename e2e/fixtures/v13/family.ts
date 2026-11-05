import { expect, type Page } from '@playwright/test'
import { mockFamily, NOW, seed } from '../s16/family'

// v13 lane F fixture: Mama with Ate Joy (a nasal spray due 08:00, unmarked, and a BP today), Papa Ben (phone may miss alarms) and Lola Remy. Invented data only. Clock frozen Tue 27 Oct 2026 10:20.
const at = (h: number, m: number) => new Date(2026, 9, 27, h, m, 0).toISOString()
const ALERT = { id: 'a2', personId: 'pa', kind: 'phone_health', template: 'phone_health', ref: null, createdAt: at(9, 0), pushedAt: null, seenAt: null, expiresAt: new Date(2026, 10, 27).toISOString() }

/** D-109: Family opens on Me. Opens the "Who to show" pill and picks a person by name; their card (and Activity) replace yours. */
export async function pickPerson(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /^Who to show/ }).click()
  await page.getByRole('dialog', { name: 'Who to show' }).getByRole('button', { name: new RegExp(name) }).click()
  await expect(page.getByTestId('person-card').first()).toHaveAttribute('aria-label', new RegExp(`^${name}`))
}

/** `person` picks someone after the page has drawn; without it Family stays on Me. */
export async function openFamily(page: Page, o: { readings?: boolean; person?: string } = {}): Promise<void> {
  await mockFamily(page)
  await page.clock.setFixedTime(NOW)
  await page.goto('/#family')
  await expect(page.locator('h1')).toHaveText('Family')
  await seed(page, 'bantay-log', 'activity', [{ personId: 'pa', kind: 'check-in', minutes: null, steps: null, startedAt: at(6, 55), source: 'manual' }])
  await seed(page, 'bantay-log', 'medications', [{ clientId: 'm1', serverId: 'm1', personId: 'ma', name: 'Nasal spray', medStatus: 'active', schedule: { v: 1, times: ['08:00'] } }])
  await seed(page, 'bantay-alerts', 'alerts', [ALERT])
  if (o.readings !== false) await seed(page, 'bantay-health', 'readings', [{ personId: 'ma', test: 'bp_systolic', value: 142, unit: 'mmHg', takenAt: at(7, 0) }, { personId: 'ma', test: 'bp_diastolic', value: 88, unit: 'mmHg', takenAt: at(7, 0) }])
  await page.reload()
  await expect(page.getByTestId('person-card').first()).toBeVisible()
  if (o.person) await pickPerson(page, o.person)
}
