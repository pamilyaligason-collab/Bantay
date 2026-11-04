import { describe, expect, it } from 'vitest'
import { HOME_ZONES } from '../../features/location/geo'
import { dialCount } from '../../features/safety/SafetyHub'
import hotlines from './hotlines.json'

// W4: the board says 27 hotlines, the app has said 28. This prints what the app counts for each home zone, so the owner can confirm which is right.
describe('hotline count', () => {
  it('prints the data rows and the "N numbers" the Hotlines row shows for each home zone', () => {
    const rows = hotlines as { id: string; zone: string }[]
    const shown = HOME_ZONES.map((z) => [z.id, dialCount({ weather: { lat: z.lat, lon: z.lon }, source: 'zone', zone: z.id } as never, {})] as const)
    console.info(`HOTLINE COUNT rows=${rows.length} shown=${JSON.stringify(Object.fromEntries(shown))}`)
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length) // no id twice
    expect(shown.every(([, n]) => n > 0)).toBe(true)
  })
})
