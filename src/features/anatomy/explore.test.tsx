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
