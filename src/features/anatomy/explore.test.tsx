import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Reading } from '../health/ranges'

const data = vi.hoisted(() => ({ readings: [] as Reading[] }))
vi.mock('../records/useHealthData', () => ({ useHealthData: () => ({ readings: data.readings, thresholds: [], personId: 'p' }) }))
import ExploreScreen from './ExploreScreen'

afterEach(cleanup)
const r = (test: string, value: number, labLow: number | null, labHigh: number | null): Reading => ({ personId: 'p', takenAt: '2026-10-01', test, value, labLow, labHigh })

describe('Body wiki', () => {
  it('has a Body wiki title with a Health back link, a chip carousel and a grouped list of parts', () => {
    data.readings = []
    const { container } = render(<ExploreScreen />)
    expect(screen.getByRole('heading', { level: 1, name: 'Body wiki' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Health' }).getAttribute('href')).toBe('#health')
    const chips = container.querySelectorAll('.carousel button.an-chip')
    expect(chips.length).toBe(9)
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(container.querySelector('.an-chip[aria-label="Heart and blood"]')!)
    expect(container.querySelector('.an-chip[aria-label="Heart and blood"]')!.getAttribute('aria-pressed')).toBe('true')
    const list = screen.getByRole('list', { name: 'Parts you can open' })
    const first = list.querySelector('button.rw-main')!
    fireEvent.click(first)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('Body wiki care lists (A1)', () => {
  it('shows the 911 and doctor lists with their sources for the chosen system', () => {
    data.readings = []
    const { container } = render(<ExploreScreen />)
    fireEvent.click(container.querySelector('.an-chip[aria-label="Digestion and liver"]')!)
    expect(screen.getByTestId('care-911').textContent).toBe('Get emergency help (911) if:')
    expect(screen.getByTestId('care-doctor').textContent).toBe('Call a doctor if')
    const l911 = container.querySelector('[data-kind="911"]')!
    expect(l911.textContent).toContain('You vomit blood')
    expect(container.querySelector('[data-kind="doctor"]')!.textContent).toContain('Yellow skin or eyes')
    expect(screen.getByTestId('care-sources').querySelector('a[href^="https://medlineplus.gov/"]')).toBeTruthy()
  })
  it('every system has one Call 911 link under its emergency list, a tel: link at least 48 px tall by style', () => {
    data.readings = []
    const { container } = render(<ExploreScreen />)
    for (const chip of Array.from(container.querySelectorAll('.an-chip'))) {
      fireEvent.click(chip)
      const call = screen.getByTestId('care-call-911')
      expect(call.getAttribute('href')).toBe('tel:911')
      expect(call.textContent).toBe('Call 911')
      expect(call.previousElementSibling!.getAttribute('data-kind')).toBe('911')
    }
  })
  it('lines that rest on press reports of DOH advice are labelled As reported, with the note, and not called DOH pages', () => {
    data.readings = []
    const { container } = render(<ExploreScreen />)
    fireEvent.click(container.querySelector('.an-chip[aria-label="Lungs"]')!)
    const tb = Array.from(container.querySelectorAll('[data-kind="doctor"] li')).find((li) => /two weeks/.test(li.textContent ?? ''))!
    expect(tb.querySelector('.an-rep')!.textContent).toBe('As reported')
    expect(screen.getByTestId('care-reported').textContent).toMatch(/news reports.*not DOH pages/)
    expect(screen.getByTestId('system-care').textContent).toContain('A clinician has not signed them off')
    fireEvent.click(container.querySelector('.an-chip[aria-label="Heart and blood"]')!)
    expect(screen.queryByTestId('care-reported')).toBeNull()
  })
})

describe('Explore rail', () => {
  it('shows one badge for one blood pressure reading, amber, and the pill agrees', () => {
    data.readings = [r('bp_systolic', 150, null, 130), r('bp_diastolic', 95, null, 85)]
    const { container } = render(<ExploreScreen />)
    const heart = container.querySelector('.an-chip[aria-label="Heart and blood"]')!
    expect(heart.querySelector('.an-badge')?.getAttribute('data-n')).toBe('1')
    expect(heart.querySelector('.an-badge')?.getAttribute('data-tone')).toBe('warn')
    fireEvent.click(heart)
    expect(screen.getByTestId('sys-status').textContent).toBe('1 result to look at')
    expect(screen.getByTestId('sys-status').getAttribute('data-tone')).toBe('warn')
  })

  it('unknown results get a plain badge and no green pill', () => {
    data.readings = [r('creatinine', 1, null, null)]
    const { container } = render(<ExploreScreen />)
    expect(container.querySelector('.an-chip[aria-label="Kidneys and bladder"] .an-badge')?.getAttribute('data-tone')).toBe('none')
    expect(container.querySelector('.an-glow')).toBeNull()
    expect(screen.queryByTestId('sys-status')).toBeNull() // default system (skeleton) has none
  })
})

describe('calloutOf (H17)', () => {
  it('names the lead out-of-range result and its system; none when in range', async () => {
    const { calloutOf } = await import('./ExploreScreen')
    const r = (test: string, value: number, extra = {}) => ({ personId: 'p1', test, value, unit: 'U/L', takenAt: new Date().toISOString(), ...extra })
    expect(calloutOf([r('alt', 118, { labLow: 7, labHigh: 55 })], () => undefined)).toEqual({ sys: 'digestion', text: 'ALT high' })
    expect(calloutOf([r('alt', 30, { labLow: 7, labHigh: 55 })], () => undefined)).toBeNull()
  })
})
