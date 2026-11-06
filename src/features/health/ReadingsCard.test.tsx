import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadingsCard } from './ReadingsCard'
import type { Reading } from './ranges'

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
afterEach(cleanup)

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const rd = (test: string, value: number, unit: string, ago: number): Reading => ({ personId: 'p1', test, value, unit, takenAt: day(ago) })
const show = (readings: Reading[], onAdd?: () => void) => render(<ReadingsCard personId="p1" readings={readings} thresholds={[]} onAdd={onAdd} />)

describe('Readings card', () => {
  it('nothing logged: "--", no chip, no chart, the same first step', () => {
    const add = vi.fn()
    show([], add)
    expect(screen.getByTestId('rc-value').textContent).toBe('--')
    expect(screen.queryByTestId('rc-state')).toBeNull()
    expect(screen.queryByTestId('metric-chart')).toBeNull()
    expect(screen.getByTestId('rc-sub-heart_rate').textContent).toContain('None yet')
    fireEvent.click(screen.getByRole('button', { name: 'Add a reading' }))
    expect(add).toHaveBeenCalledTimes(1)
  })
  it('latest pulse leads with its in-range chip, a 7-day chart, and BP and sugar as sub-tiles', () => {
    show([rd('heart_rate', 72, 'bpm', 0), rd('heart_rate', 64, 'bpm', 3), rd('heart_rate', 90, 'bpm', 20), rd('bp_systolic', 128, 'mmHg', 1), rd('bp_diastolic', 82, 'mmHg', 1), rd('fasting_glucose', 95, 'mg/dL', 2)])
    expect(screen.getByTestId('rc-value').textContent).toContain('72')
    expect(screen.getByTestId('rc-state').textContent).toBe('In range') // verdict.ts vital table: 72 bpm is inside the 60 to 100 guide
    expect(screen.getByTestId('rc-state').className).toContain('hv-state')
    const chart = screen.getByTestId('metric-chart')
    expect(chart.getAttribute('aria-label')).toContain('2 readings') // the 20-day-old one is outside the week
    expect(within(screen.getByTestId('rc-sub-bp_systolic')).getByText('128/82')).toBeTruthy()
    expect(within(screen.getByTestId('rc-sub-fasting_glucose')).getByText('95')).toBeTruthy()
    expect(screen.getByTestId('rc-sub-bp_systolic').getAttribute('href')).toBe('#health/metric/bp_systolic')
  })
  it('a pulse above the guide says High (verdict.ts vital table) with the high chip colour', () => {
    show([rd('heart_rate', 120, 'bpm', 0)])
    expect(screen.getByTestId('rc-state').textContent).toBe('High. Above range')
    expect(screen.getByTestId('rc-state').className).toContain('above')
  })
  it('pins the Today row does not show (default: BP for its nudge, Next visit) stay in a Pinned row inside the card, with Edit pins', async () => {
    show([])
    const pins = screen.getByTestId('glance')
    expect(pins.contains(screen.getByRole('button', { name: 'Edit pins' }))).toBe(true)
    expect(await within(pins).findByTestId('glance-visit')).toBeTruthy()
    expect(within(pins).getByTestId('glance-progress')).toBeTruthy() // BP stays for its Due pill and nudge
  })
  it('no pulse: blood pressure leads and Pulse becomes the sub-tile; no Add button when this person cannot log', () => {
    show([rd('bp_systolic', 124, 'mmHg', 1), rd('bp_diastolic', 79, 'mmHg', 1)])
    expect(screen.getByTestId('rc-value').textContent).toContain('124/79')
    expect(screen.getByTestId('rc-sub-heart_rate').textContent).toContain('None yet')
    expect(screen.queryByRole('button', { name: 'Add a reading' })).toBeNull()
  })
  it('a latest reading older than 7 days says so instead of drawing an empty chart', () => {
    show([rd('heart_rate', 70, 'bpm', 12)])
    expect(screen.queryByTestId('metric-chart')).toBeNull()
    expect(screen.getByText('No readings in the last 7 days.')).toBeTruthy()
  })
  it('D-125: blood pressure not current shows the Due pill and the nudge tile inside the card (default pins)', async () => {
    show([rd('bp_systolic', 118, 'mmHg', 20), rd('bp_diastolic', 76, 'mmHg', 20)])
    const tile = await within(screen.getByTestId('rc-main')).findByTestId('glance-progress')
    expect(tile.querySelector('.nd-due')?.textContent).toBe('Due')
    expect(screen.queryByTestId('glance-steps')).toBeNull() // steps and medicines stay on the Today row and Browse
  })
})

describe('D-142 Readings card', () => {
  it('a watch pulse logged many times a day is one point per day with a low-high band, not a dot per sample', () => {
    const samples = [0, 0.02, 0.04, 0.06, 0.08].map((f, i) => rd('heart_rate', 60 + i * 5, 'bpm', f)).concat([rd('heart_rate', 70, 'bpm', 2), rd('heart_rate', 80, 'bpm', 2.02)])
    show(samples)
    const chart = screen.getByTestId('metric-chart')
    expect(chart.querySelectorAll('circle').length).toBeLessThanOrEqual(2) // two days, not seven samples
    expect(chart.querySelector('.mc-spread')).not.toBeNull()
  })
  it('blood pressure shows once: the sub-tile, and no pinned BP tile unless it is due', async () => {
    show([rd('heart_rate', 72, 'bpm', 0), rd('bp_systolic', 118, 'mmHg', 0), rd('bp_diastolic', 76, 'mmHg', 0)])
    expect(screen.getByTestId('rc-sub-bp_systolic')).toBeTruthy()
    await within(screen.getByTestId('rc-main')).findByTestId('glance-visit')
    expect(within(screen.getByTestId('rc-main')).queryByTestId('glance-progress')).toBeNull()
  })
})
