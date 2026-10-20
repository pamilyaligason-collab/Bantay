import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Reading } from '../health/ranges'

const data = vi.hoisted(() => ({ readings: [] as Reading[] }))
vi.mock('../records/useHealthData', () => ({ useHealthData: () => ({ readings: data.readings, thresholds: [], personId: 'p' }) }))
import ExploreScreen from './ExploreScreen'

afterEach(cleanup)
const r = (test: string, value: number, labLow: number | null, labHigh: number | null): Reading => ({ personId: 'p', takenAt: '2026-10-01', test, value, labLow, labHigh })

describe('Explore rail', () => {
  it('shows one badge for one blood pressure reading, amber, and the pill agrees', () => {
    data.readings = [r('bp_systolic', 150, null, 130), r('bp_diastolic', 95, null, 85)]
    const { container } = render(<ExploreScreen />)
    const heart = container.querySelector('.an-rb[aria-label="Heart and blood"]')!
    expect(heart.querySelector('.an-badge')?.getAttribute('data-n')).toBe('1')
    expect(heart.querySelector('.an-badge')?.getAttribute('data-tone')).toBe('warn')
    fireEvent.click(heart)
    expect(screen.getByTestId('sys-status').textContent).toBe('1 result to look at')
    expect(screen.getByTestId('sys-status').getAttribute('data-tone')).toBe('warn')
  })

  it('unknown results get a plain badge and no green pill', () => {
    data.readings = [r('creatinine', 1, null, null)]
    const { container } = render(<ExploreScreen />)
    expect(container.querySelector('.an-rb[aria-label="Kidneys and bladder"] .an-badge')?.getAttribute('data-tone')).toBe('none')
    expect(container.querySelector('.an-glow')).toBeNull()
    expect(screen.queryByTestId('sys-status')).toBeNull() // default system (skeleton) has none
  })
})
