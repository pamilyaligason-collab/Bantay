import { expect, type Page } from '@playwright/test'
import { FIXED_CLOCKS } from '../../s16'

// S16 L2 fixtures (contracts.md C-11): Health with a full week of made-up data, an empty person, and the acting person.
// The clock is frozen at 23:30 Manila (ML-38) so a rerun draws the same pixels. Signed-in person is `me` (e2e/health-auth-mock.ts); `ma` is a carer link.

type Rows = Record<string, Record<string, unknown>[]>

/** Puts rows into stores the app already created. Never creates a database itself (an aborted upgrade) and waits until every store exists, so a slow first load under parallel workers cannot race the seed. */
export const seed = async (page: Page, dbName: string, rows: Rows) => {
  await expect.poll(() => page.evaluate(([name, data]) => new Promise<boolean>((res) => {
    const o = indexedDB.open(name as string)
    o.onupgradeneeded = () => o.transaction!.abort()
    o.onerror = (e) => { e.preventDefault(); res(false) }
    o.onsuccess = () => {
      const db = o.result
      const stores = Object.keys(data as Rows)
      if (!stores.every((s) => db.objectStoreNames.contains(s))) { db.close(); return res(false) }
      const tx = db.transaction(stores, 'readwrite')
      for (const [store, list] of Object.entries(data as Rows)) for (const row of list) tx.objectStore(store).put(row)
      tx.oncomplete = () => { db.close(); res(true) }
      tx.onerror = () => { db.close(); res(false) }
    }
  }), [dbName, rows] as const), { message: `${dbName} stores ${Object.keys(rows).join(', ')} written` }).toBe(true)
}

async function open(page: Page, at: string) {
  await page.clock.setFixedTime(at)
  await page.goto('/#health')
  await expect(page.locator('h1').first()).toHaveText('Health')
}

/** Mama-like person `me` with BP above the guide (glow), sugar, weight, pulse, steps, a lab set, three medicines. */
export async function full(page: Page, at: string = FIXED_CLOCKS[0]) {
  await open(page, at)
  const ago = (d: number) => new Date(Date.parse(new Date().toISOString()) - d * 86_400_000).toISOString()
  const r = (test: string, value: number, unit: string, d: number, extra: Record<string, unknown> = {}) => ({ personId: 'me', takenAt: ago(d), test, value, unit, ...extra })
  await seed(page, 'bantay-health', {
    people: [{ id: 'me', name: 'Lloyd Sample' }, { id: 'ma', name: 'Ma Sample' }],
    readings: [
      r('bp_systolic', 138, 'mmHg', 0.1), r('bp_diastolic', 88, 'mmHg', 0.1), r('bp_systolic', 126, 'mmHg', 1), r('bp_diastolic', 82, 'mmHg', 1), r('bp_systolic', 128, 'mmHg', 3), r('bp_diastolic', 80, 'mmHg', 3),
      r('fasting_glucose', 118, 'mg/dL', 2), r('weight', 61, 'kg', 3), r('heart_rate', 74, 'bpm', 0.1),
      r('hba1c', 6.8, '%', 20, { labLow: 4, labHigh: 5.6 }), r('hba1c', 7.1, '%', 110, { labLow: 4, labHigh: 5.6 }), r('ldl', 162, 'mg/dL', 20, { labLow: 0, labHigh: 130 }), r('creatinine', 0.9, 'mg/dL', 20, { labLow: 0.6, labHigh: 1.1 })
    ]
  })
  const med = (name: string, times: string[]) => ({ clientId: `c-${name}`, serverId: `s-${name}`, personId: 'me', name, medStatus: 'active', status: 'confirmed', schedule: { v: 1, times } })
  await seed(page, 'bantay-log', {
    medications: [med('Losartan', ['08:00']), med('Metformin', ['08:00', '20:00']), med('Amlodipine', ['08:00'])],
    activity: [{ personId: 'me', kind: 'steps', minutes: null, steps: 4210, startedAt: ago(0.05), source: 'manual' }, { personId: 'me', kind: 'sleep', minutes: 420, steps: null, startedAt: ago(0.4), source: 'manual' }]
  })
  await page.reload()
  await expect(page.getByTestId('bodyhero')).toBeVisible()
  await expect(page.getByTestId('glance')).toBeVisible()
}

/** A person with no readings at all: the empty hero and the More grid only. */
export async function empty(page: Page, at: string = FIXED_CLOCKS[0]) {
  await open(page, at)
  await expect(page.getByTestId('bodyhero')).toBeVisible()
}

/** Acting as another person needs L6's `enterActing` (the base only has stubs); this seeds the same data as `full` and returns, so the acting spec can call L6's entry afterwards. */
export async function acting(page: Page, at: string = FIXED_CLOCKS[0]) {
  await full(page, at)
}
