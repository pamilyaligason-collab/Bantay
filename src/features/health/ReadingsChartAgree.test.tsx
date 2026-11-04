import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReadingsHero } from './ReadingsHero'

const at = (daysAgo: number, hour: number) => { const d = new Date(Date.now() - daysAgo * 86_400_000); d.setHours(hour, 0, 0, 0); return d.toISOString() }
const bp = (sys: number, dia: number, daysAgo: number, hour = 8) => [
  { personId: 'p1', test: 'bp_systolic', value: sys, unit: 'mmHg', takenAt: at(daysAgo, hour) },
  { personId: 'p1', test: 'bp_diastolic', value: dia, unit: 'mmHg', takenAt: at(daysAgo, hour) }
]
afterEach(cleanup)

/** The value each dot stands for, read back from the drawn SVG alone: the grid lines carry the tick labels, so two ticks give the scale. */
function plotted(svg: Element) {
  const lines = [...svg.querySelectorAll('line.mc-grid')].map((l) => Number(l.getAttribute('y1')))
  const labels = [...svg.querySelectorAll('text.mc-t')].map((t) => Number(t.textContent)).filter((n) => Number.isFinite(n))
  const k = (labels[0]! - labels[1]!) / (lines[0]! - lines[1]!) // value per pixel (ticks run highest first)
  const val = (cy: number) => labels[0]! + (cy - lines[0]!) * k
  return { labels, dots: [...svg.querySelectorAll('circle')].map((c) => val(Number(c.getAttribute('cy')))) }
}

describe('Readings chart and number agree (safety)', () => {
  it('the last dot is the headline top number, and the printed axis covers every dot', () => {
    for (const set of [[138, 88, 0.1], [128, 80, 0.3], [152, 96, 0.5]] as const) {
      cleanup()
      render(<ReadingsHero readings={[...bp(set[0], set[1], set[2]), ...bp(126, 82, 1), ...bp(128, 80, 3)]} thresholds={[]} personId="p1" />)
      expect(screen.getByTestId('rd-latest').textContent).toContain(`${set[0]}/${set[1]}`)
      const { labels, dots } = plotted(screen.getByTestId('metric-chart'))
      expect(dots.length).toBe(3)
      expect(Math.round(dots[dots.length - 1]! * 10) / 10).toBe(set[0]) // the dot is at the same value as the number
      expect(Math.max(...labels)).toBeGreaterThanOrEqual(Math.max(...dots) - 0.15 * (labels[0]! - labels[1]!)) // the axis includes the value (within a sliver of a step)
      expect(Math.min(...labels)).toBeLessThanOrEqual(Math.min(...dots) + 0.15 * (labels[0]! - labels[1]!))
      expect(labels.length).toBeGreaterThanOrEqual(2)
    }
  })
  it('a reading stamped after this phone clock is still plotted, at its own date', () => {
    render(<ReadingsHero readings={bp(141, 90, -0.2)} thresholds={[]} personId="p1" />)
    const { dots } = plotted(screen.getByTestId('metric-chart'))
    expect(dots.map((d) => Math.round(d))).toEqual([141])
  })
  it('Morning shows the newest morning pair and plots from the same list', () => {
    render(<ReadingsHero readings={[...bp(150, 95, 0.5, 20), ...bp(132, 84, 1, 7)]} thresholds={[]} personId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Morning' }))
    expect(screen.getByTestId('rd-latest').textContent).toContain('132/84')
    expect(plotted(screen.getByTestId('metric-chart')).dots.map(Math.round)).toEqual([132])
  })
  it('the board bands: a one-sided healthy range is a visible band, and the week has day labels', () => {
    render(<ReadingsHero readings={[...bp(138, 88, 0.1), ...bp(126, 82, 1)]} thresholds={[]} personId="p1" />)
    const svg = screen.getByTestId('metric-chart')
    expect(Number(svg.querySelector('rect.mc-band')!.getAttribute('height'))).toBeGreaterThan(30)
    expect(svg.querySelectorAll('text.mc-d')).toHaveLength(7)
  })
})
