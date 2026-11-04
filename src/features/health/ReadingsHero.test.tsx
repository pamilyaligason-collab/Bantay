import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReadingsHero } from './ReadingsHero'

const at = (daysAgo: number, hour: number) => { const d = new Date(Date.now() - daysAgo * 86_400_000); d.setHours(hour, 0, 0, 0); return d.toISOString() }
const bp = (sys: number, dia: number, daysAgo: number, hour = 8) => [
  { personId: 'p1', test: 'bp_systolic', value: sys, unit: 'mmHg', takenAt: at(daysAgo, hour) },
  { personId: 'p1', test: 'bp_diastolic', value: dia, unit: 'mmHg', takenAt: at(daysAgo, hour) }
]
afterEach(cleanup)

describe('ReadingsHero', () => {
  it('draws the BP chart with the green band, the latest pair and a verdict chip', () => {
    render(<ReadingsHero readings={[...bp(130, 84, 1), ...bp(124, 79, 3, 20)]} thresholds={[]} personId="p1" />)
    expect(screen.getByTestId('metric-chart')).toBeTruthy()
    expect(document.querySelector('svg[data-testid=metric-chart] rect.mc-band')).toBeTruthy()
    expect(screen.getByTestId('rd-hero').textContent).toContain('130/84')
    expect(document.querySelector('.hv-state')).toBeTruthy()
  })
  it('Period and Time of day are segmented with aria-pressed', () => {
    render(<ReadingsHero readings={[...bp(130, 84, 1), ...bp(124, 79, 20, 20)]} thresholds={[]} personId="p1" />)
    const week = screen.getByRole('button', { name: 'This week' })
    expect(week.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(screen.getByRole('button', { name: 'This month' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Evening' }))
    expect(screen.getByRole('button', { name: 'Evening' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('group', { name: 'Period' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Time of day' })).toBeTruthy()
  })
  it('no BP this week: says so and draws no chart', () => {
    render(<ReadingsHero readings={bp(130, 84, 20)} thresholds={[]} personId="p1" />)
    expect(screen.getByText('No readings this week. A healthy range shows as the green band.')).toBeTruthy()
    expect(screen.queryByTestId('metric-chart')).toBeNull()
  })
})
