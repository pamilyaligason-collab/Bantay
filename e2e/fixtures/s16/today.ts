import { expect, type Page } from '@playwright/test'
import { openMeteoFixture } from '../../../src/features/weather/fixture'
import { mock } from '../../health-auth-mock'
import { skipOnboarding } from '../../helpers'

// S16 L1 fixtures (contracts C-11): calm, alertsOff, quake, storm, offline. Auth project (PostgREST mocked, invented data).
// Clock frozen at Tue 2026-10-20 10:00 Manila (the Losartan dose is due 09:45 so Next up shows when `dose` is set).
export const NOW = new Date('2026-10-20T10:00:00+08:00')
export type Variant = 'calm' | 'alertsOff' | 'quake' | 'storm' | 'offline'
type Row = Record<string, unknown>

export async function seed(page: Page, dbName: string, store: string, rows: Row[]) {
  await page.evaluate(async ([name, st, list]) => { // wait until the app's own Dexie made the store (ML-25)
    for (let i = 0; i < 100; i++) {
      const ok = await new Promise<boolean>((res, rej) => {
        const open = indexedDB.open(name as string)
        open.onupgradeneeded = () => { open.transaction?.abort() }
        open.onerror = () => res(false)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(st as string)) { db.close(); res(false); return }
          const tx = db.transaction(st as string, 'readwrite')
          for (const r of list as Row[]) tx.objectStore(st as string).put(r)
          tx.oncomplete = () => { db.close(); res(true) }
          tx.onerror = () => { db.close(); rej(tx.error) }
        }
      })
      if (ok) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`store ${st as string} never appeared in ${name as string}`)
  }, [dbName, store, rows] as const)
}

const issuedAt = NOW.toISOString()
export const QUAKE = { id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now', doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: null, issuedAt, lat: 10.1, lon: 124.0, bulletin: 'b', checkedAt: issuedAt }
export const STORM = { id: 'pagasa-tcws-rosal-champi-dampas', kind: 'tcws', level: 'Signal No. 2', title: 'Wind Signal No. 2 for Dampas, Tagbilaran City: Typhoon Rosal (CHAMPI)', what: 'Strong winds until 6 AM.', where: 'Bohol (near Dampas, Tagbilaran City)', when: '2026-10-20 09:00 PH time', doNow: 'Stay indoors.', source: 'PAGASA', sourceUrl: 'https://www.pagasa.dost.gov.ph/', issuedAt, lat: 9.645705, lon: 123.877951, bulletin: 'b', checkedAt: issuedAt }

/** Opens #today as Lloyd (signed in, mocked) with the variant's data. `dose` seeds a late Losartan so Next up shows. */
export async function startToday(page: Page, variant: Variant = 'calm', opts: { dose?: boolean; scheme?: 'light' | 'dark' } = {}) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(NOW)
  await skipOnboarding(page)
  await page.addInitScript(() => localStorage.setItem('bantay.family', JSON.stringify([{ personId: 'me', displayName: 'Lloyd' }])))
  await mock(page)
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ json: openMeteoFixture({ now: NOW, temp: 31, humidity: 60, feels: 33, code: variant === 'storm' ? 95 : 2, hourlyProb: (h) => (h >= 14 && h <= 17 ? 80 : 10) }) }))
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: opts.scheme ?? 'light' })
  await page.goto('/')
  await expect(page.getByRole('group', { name: 'Quick log' })).toBeVisible()
  const kv: Row[] = []
  if (variant === 'alertsOff') kv.push({ key: 'phone.check', value: { notif_ok: false } })
  if (variant === 'quake') kv.push({ key: 'safety.alerts', value: [QUAKE] })
  if (variant === 'storm') kv.push({ key: 'safety.alerts', value: [STORM] })
  if (kv.length) await seed(page, 'bantay', 'kv', kv)
  if (opts.dose || variant === 'alertsOff') await seed(page, 'bantay-log', 'medications', [{ clientId: 'c1', serverId: 's1', personId: 'me', name: 'Losartan', dose: '50 mg', schedule: { v: 1, times: ['09:45'] }, startedOn: '2026-10-01', medStatus: 'active' }])
  await page.reload() // raw IndexedDB writes do not notify live queries
  await expect(page.getByTestId('salt-line')).toBeVisible()
  await expect(page.getByTestId('weather-hero')).toBeVisible() // the forecast and the kv rows have been read (ML-25)
  if (variant === 'alertsOff') await expect(page.getByTestId('alerts-off')).toBeVisible()
  if (variant === 'quake') await expect(page.getByTestId('warning-card')).toBeVisible()
  if (variant === 'storm') await expect(page.getByTestId('warning-card-storm')).toBeVisible()
  if (opts.dose || variant === 'alertsOff') await expect(page.locator('.td-next')).toBeVisible()
  await page.addStyleTag({ content: '.sync-status, .sh-badge { display: none !important; }' })
}
