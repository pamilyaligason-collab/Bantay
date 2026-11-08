import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { dosePills, HealthBrowse, labCounts, moveLine } from './HealthBrowse'
import { labDate } from './labsLogic'
import { labsLine as glanceLabsLine } from './GlanceGrid'
import type { DoseState } from './meds'
import type { Reading } from './ranges'
import { vdb } from './visitsStore'

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const show = (readings: Reading[] = []) => render(<HealthBrowse personId="p1" readings={readings} thresholds={[]} />)

beforeEach(async () => { await Promise.all([db.kv.clear(), ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear(), vdb.appointments.clear(), vdb.followUps.clear()]) })
afterEach(cleanup)

describe('Browse photos (S24)', () => {
  it('each card has its stored photo under a gradient, with a credit line and an outside link per photo', () => {
    show()
    const files: Record<string, string> = { labs: 'labs', meds: 'meds', visits: 'clinic', move: 'walk', body: 'body' }
    for (const [k, f] of Object.entries(files)) {
      const card = screen.getByTestId(`browse-${k}`)
      expect(card.querySelector('img.hb-img')!.getAttribute('src')).toBe(`/img/browse/${f}.webp`)
      expect(card.querySelector('.hb-shade')).toBeTruthy()
      expect(card.getAttribute('data-photo')).toBe('on')
    }
    const links = Array.from(screen.getByTestId('browse-credits').querySelectorAll('a'))
    expect(links).toHaveLength(5)
    for (const a of links) { expect(a.getAttribute('href')).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/); expect(a.getAttribute('rel')).toContain('noopener') }
    expect(links.map((a) => a.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('CC0'), expect.stringContaining('CC BY-SA 4.0')]))
  })
  it('a photo that cannot load leaves a plain tint: no image, no gradient, dark text', () => {
    show()
    const card = screen.getByTestId('browse-labs')
    fireEvent.error(card.querySelector('img.hb-img')!)
    expect(card.querySelector('img')).toBeNull()
    expect(card.querySelector('.hb-shade')).toBeNull()
    expect(card.getAttribute('data-photo')).toBe('off')
    expect(card.textContent).toContain('Labs') // the card still works
  })
})

describe('Browse', () => {
  it('five cards in order with their doors; Body wiki is the wide one with no preview', () => {
    show()
    const ids = ['labs', 'meds', 'visits', 'move', 'body']
    expect(ids.map((k) => screen.getByTestId(`browse-${k}`).getAttribute('href'))).toEqual(['#health/labs', '#health/meds', '#health/visits', '#health/move', '#health/body'])
    const cards = Array.from(document.querySelectorAll('.hb'))
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual(ids.map((k) => `browse-${k}`)) // Readings has its own card above, not a door here
    expect(screen.getByTestId('browse-body').hasAttribute('data-wide')).toBe(true)
    expect(screen.getByTestId('browse-body').querySelector('svg')).toBeNull()
    expect(cards.map((c) => (c as HTMLElement).style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '4']) // staggered rise-in
  })
  it('live values and previews: labs bars, dose pills, next visit, move ring', async () => {
    const readings: Reading[] = [{ personId: 'p1', test: 'ldl', value: 162, unit: 'mg/dL', takenAt: day(2), labLow: 0, labHigh: 130 }]
    await db.kv.put({ key: 'visits.questions.p1', value: ['q'] })
    await ldb.medications.add({ personId: 'p1', name: 'Metformin', schedule: { v: 1, times: ['08:00', '20:00'] } } as never)
    await ldb.activity.add({ personId: 'p1', kind: 'walk', minutes: 12, steps: null, startedAt: new Date().toISOString() } as never)
    show(readings)
    const txt = (k: string) => screen.getByTestId(`browse-${k}`).textContent
    expect(txt('labs')).toContain(`1 to ask · ${labDate(day(2), true)}`) // H9: the count and the date, not the count alone
    expect(screen.getByTestId('browse-labs').querySelectorAll('.hb-bars rect')).toHaveLength(3)
    expect(screen.getByTestId('browse-labs').querySelectorAll('.hb-bars rect[data-hot]')).toHaveLength(1) // the one to ask is the strong bar
    await waitFor(() => expect(txt('meds')).toContain('2 of 2 left today'))
    expect(screen.getByTestId('browse-meds').querySelectorAll('.hb-pill')).toHaveLength(2)
    await waitFor(() => expect(txt('visits')).toContain('1 question ready to ask'))
    expect(txt('visits')).toContain('Not booked')
    expect(screen.getByTestId('browse-visits').querySelector('.hb-date')?.hasAttribute('data-empty')).toBe(true) // D-142: the empty value is card-title size, not the 28 px date
    await waitFor(() => expect(txt('move')).toContain('12 min this week'))
    expect(screen.getByTestId('browse-move').querySelector('svg.rg')).toBeTruthy()
  })
  it('empty person reads honestly: no bars, no pills, "--" previews', async () => {
    show()
    expect(screen.getByTestId('browse-labs').textContent).toContain('No papers yet')
    expect(screen.getByTestId('browse-labs').querySelector('.hb-bars')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('browse-meds').textContent).toContain('No medicines yet'))
    expect(screen.getByTestId('browse-meds').querySelector('.hb-pill')).toBeNull()
    expect(screen.getByTestId('browse-meds').querySelector('.hb-none')!.textContent).toBe('--')
    expect(screen.getByTestId('browse-move').textContent).toContain('No walks yet')
  })
  it('moveLine counts only the last 7 days of walks', () => {
    const a = (kind: string, minutes: number, ago: number) => ({ kind, minutes, steps: null, startedAt: day(ago) })
    expect(moveLine([])).toBe('No walks yet')
    expect(moveLine([a('walk', 20, 1), a('walk', 10, 2), a('walk', 50, 9)])).toBe('30 min this week')
    expect(moveLine([a('walk', 50, 9)])).toBe('No walks yet')
  })
})

describe('Browse previews (pure)', () => {
  const dose = (at: number, state: DoseState['state']) => ({ at, state, name: 'X', key: 'k', medicationId: null, personId: 'p1', slot: 0 }) as unknown as DoseState
  it('dosePills: Taken, Skipped, or the time still to come; three at most', () => {
    expect(dosePills([dose(480, 'taken'), dose(720, 'skipped'), dose(1200, 'pending'), dose(1290, 'pending')])).toEqual([
      { text: 'Taken', done: true }, { text: 'Skipped', done: false }, { text: '8 PM', done: false }
    ])
    expect(dosePills([dose(450, 'pending')])).toEqual([{ text: '7:30 AM', done: false }])
    expect(dosePills([])).toEqual([])
  })
  it('labCounts: null with no papers; the same split the Labs line counts', () => {
    expect(labCounts([], [])).toBeNull()
    const rs: Reading[] = [
      { personId: 'p1', test: 'ldl', value: 162, unit: 'mg/dL', takenAt: day(2), labLow: 0, labHigh: 130 },
      { personId: 'p1', test: 'hdl', value: 55, unit: 'mg/dL', takenAt: day(2), labLow: 40, labHigh: 100 }
    ]
    expect(labCounts(rs, [])).toEqual({ ask: 1, usual: 1, noRange: 0 })
    expect(glanceLabsLine(rs, [])).toContain('1 to ask')
  })
})
