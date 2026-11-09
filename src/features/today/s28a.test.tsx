// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { nearestPlace, placeLabel, BARANGAY_KM } from '../location/nearestPlace'
import { placeLine, placeWords } from '../location/placeWords'
import PagasaMapCard, { PAGASA_MAP_URL, PAGASA_OUTLOOK_URL } from '../safety/PagasaMapCard'
import CalmCard from './CalmCard'
import { takenLabel } from './doneMorph'
import { agoWords, clock12, noBreak } from './timeWords'

afterEach(cleanup)
const NOW = Date.parse('2026-11-09T12:00:00Z')

describe('S28 A: offline place lookup', () => {
  it('names the home barangays at their centre points and nothing far from them', () => {
    expect(nearestPlace({ lat: 9.645705, lon: 123.877951 })).toEqual({ barangay: 'Dampas', town: 'Tagbilaran' })
    expect(placeLabel(nearestPlace({ lat: 6.2015121, lon: 125.1878084 })!)).toBe('Conel, General Santos')
    // 0.02 degrees of latitude = 0.02 * pi/180 * 6371.0088 = 2.22 km north of Dampas: past the 2 km radius
    expect(BARANGAY_KM).toBe(2)
    expect(nearestPlace({ lat: 9.665705, lon: 123.877951 })).toBeNull()
    expect(nearestPlace({ lat: 14.5995, lon: 120.9842 })).toBeNull()
  })
  it('unknown is null, never a default barangay', () => {
    expect(nearestPlace(null)).toBeNull()
    expect(nearestPlace({ lat: NaN, lon: 123.8 })).toBeNull()
  })
  it('a good GPS fix in the barangay reads "<barangay>, <town>"; a rough fix keeps the area', () => {
    const at = { source: 'gps', zone: 'dampas', weather: { lat: 9.6458, lon: 123.878 } }
    expect(placeWords(at, NOW).title).toBe('Dampas, Tagbilaran')
    const rough = placeWords({ ...at, accuracy: 2000 }, NOW)
    expect(placeLine(rough)).toBe('around Tagbilaran')
  })
  it('home zones read "<barangay>, <town>"', () => {
    expect(placeWords({ source: 'zone', zone: 'dampas', picked: true }, NOW).title).toBe('Dampas, Tagbilaran')
  })
})

describe('S28 A: Today times', () => {
  it('a stale fix of 3 days 9 minutes reads "3 days ago" in words, with no "d" or "m" shorthand', () => {
    const fixAt = NOW - (3 * 1440 + 9) * 60_000
    const w = placeWords({ source: 'last', zone: 'dampas', weather: { lat: 9.65, lon: 123.85 }, fixAt }, NOW)
    expect(w.title).toBe('Tagbilaran · last known, 3 days ago')
    expect(w.title).not.toMatch(/\d\s?[dm]\b/)
  })
  it('durations are whole words and singular at 1', () => {
    expect(agoWords(9)).toBe('9 minutes ago'); expect(agoWords(1)).toBe('1 minute ago'); expect(agoWords(60)).toBe('1 hour ago'); expect(agoWords(3 * 1440 + 9)).toBe('3 days ago')
  })
  it('every clock time is h:mm AM/PM in upper case', () => {
    const t = new Date(2026, 10, 9, 21, 9)
    expect(clock12(t)).toBe('9:09 PM')
    expect(takenLabel(t)).toBe('Taken 9:09 PM')
    expect(clock12(new Date(2026, 10, 9, 0, 5))).toBe('12:05 AM')
    expect(clock12('not a time')).toBe('')
  })
  it('the kicker keeps a number with its unit and a time with AM/PM (no orphan wrap)', () => {
    const k = noBreak('Tagbilaran · last known, 3 days ago · as of 9:09 PM')
    expect(k).toBe('Tagbilaran · last known, 3 days ago · as of 9:09 PM')
    expect(k.replace(/ /g, ' ')).toBe('Tagbilaran · last known, 3 days ago · as of 9:09 PM')
  })
})

describe('S28 A: PAGASA map and outlook card', () => {
  it('loads nothing until tapped, then frames panahon.gov.ph; the outlook is a link only', () => {
    const { container } = render(<PagasaMapCard />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('heading', { name: 'PAGASA weather map and outlook' })).toBeTruthy()
    const outlook = screen.getByRole('link', { name: /PAGASA climate outlook and forecasts/ })
    expect(outlook.getAttribute('href')).toBe(PAGASA_OUTLOOK_URL)
    fireEvent.click(screen.getByRole('button', { name: /PAGASA weather map/ }))
    expect(container.querySelector('iframe')!.getAttribute('src')).toBe(PAGASA_MAP_URL)
    expect(container.querySelector('iframe')!.getAttribute('sandbox')).not.toMatch(/allow-top-navigation/)
  })
})

describe('S28 A: Calm radio row', () => {
  it('Relaxing radio opens Listen > Radio (D-178)', () => {
    render(<CalmCard />)
    expect(screen.getByRole('link', { name: /Relaxing radio/ }).getAttribute('href')).toBe('#discover/listen/radio')
  })
})
