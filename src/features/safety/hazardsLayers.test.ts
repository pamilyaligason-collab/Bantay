import { describe, expect, it } from 'vitest'
import { hazardsFor } from './hazardCards'
import { layerState, NOAH_URL, readDate } from './hazardsLayers'

const dampas = hazardsFor('dampas')

describe('layerState', () => {
  it('flood has no reading and says there is no map', () => {
    expect(layerState('flood', dampas)).toMatchObject({ label: 'Flood', reading: null, text: 'No flood map for this place yet. Hazard maps arrive with the local data pack.' })
  })
  it('landslide reads Low (good), surge reads Safe', () => {
    expect(layerState('landslide', dampas)).toMatchObject({ reading: 'Low', tone: 'good' })
    expect(layerState('surge', dampas)).toMatchObject({ reading: 'Safe', tone: 'good' })
    expect(layerState('surge', dampas).text).toContain('shows your place only')
  })
  it('a place with no readings is not checked', () => {
    const conel = hazardsFor('conel')
    for (const id of ['flood', 'landslide', 'surge'] as const) expect(layerState(id, conel)).toMatchObject({ reading: null, text: 'Not checked for this place yet.' })
  })
})

describe('constants and dates', () => {
  it('NOAH url', () => expect(NOAH_URL).toBe('https://noah.up.edu.ph/'))
  it('readDate', () => {
    expect(readDate('HazardHunterPH, Dampas pin 9.6, 123.8, read 2026-10-17')).toBe('17 Oct 2026')
    expect(readDate('no date')).toBeNull()
  })
})
