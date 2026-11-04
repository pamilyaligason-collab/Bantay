import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { zoneAlert } from '../today/heroCards'
import { weatherWarning } from './warning'

const alert = (o: Partial<Alert>): Alert => ({
  id: 'a1', kind: 'tcws', level: 'Signal No. 2', title: 'Typhoon signal no. 2', what: 'w', where: 'Bohol', when: 'Tonight', doNow: 'Charge phones.',
  source: 'PAGASA', sourceUrl: null, issuedAt: new Date().toISOString(), lat: 6.2, lon: 125.19, bulletin: 'b', ...o
})
const here = { lat: 6.2015121, lon: 125.1878084 }
const south = (km: number) => here.lat - km / 111.195
const quake = alert({ id: 'q', kind: 'quake', level: 'Magnitude 4.2', title: 'Earthquake M4.2', lat: south(400), lon: here.lon })
const typhoon = alert({ id: 't', kind: 'tcws', title: 'Typhoon signal no. 2', lat: south(200), lon: here.lon })

describe('the D-114 quake hold belongs to Simple Today only', () => {
  it('Today keeps it: a fresh small far quake holds the one slot against a typhoon signal 200 km away', () => {
    expect(zoneAlert([quake, typhoon], here)?.id).toBe('q')
  })
  it('the Weather row follows plain ranking: the typhoon signal, not the far quake', () => {
    expect(weatherWarning([quake, typhoon], here, false)?.kind).toBe('tcws')
    expect(weatherWarning([typhoon, quake], here, false)?.kind).toBe('tcws')
  })
  it('the Weather row still leads with an urgent quake (a red-card one)', () => {
    const red = alert({ id: 'r', kind: 'quake', level: 'Magnitude 6.8', title: 'Earthquake M6.8', lat: south(50), lon: here.lon })
    expect(weatherWarning([red, typhoon], here, false)?.kind).toBe('quake')
  })
})
