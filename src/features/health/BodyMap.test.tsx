import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FOCUS, VIEW } from '../anatomy/shapes'
import { hotspotTone, mapHeadline, systemCounts, systemOf, systemStatus } from '../anatomy/status'
import { BodyMap } from './BodyMap'
import type { NodeView } from './model'
import type { Reading } from './ranges'

afterEach(cleanup)

const node = (id: NodeView['id'], state: NodeView['state'], empty = false): NodeView => ({ id, label: id, value: empty ? '--' : '1', note: empty ? 'No data yet' : 'today', state, code: id, empty })
const ids: NodeView['id'][] = ['sleep', 'mood', 'bp', 'pulse', 'sugar', 'weight', 'steps']
const all = (state: NodeView['state'], empty = false) => ids.map((i) => node(i, state, empty))

describe('hotspot state mapping', () => {
  it('amber for above or below range, green for within, none for unknown', () => {
    expect(hotspotTone('above')).toBe('warn')
    expect(hotspotTone('below')).toBe('warn')
    expect(hotspotTone('within')).toBe('ok')
    expect(hotspotTone('none')).toBe('none')
    expect(hotspotTone('within', true)).toBe('none') // an empty node never glows
  })

  it('headline is a calm sentence and never calls unknown values steady', () => {
    expect(mapHeadline([node('bp', 'within'), node('sugar', 'within')])).toBe('Your numbers look steady')
    expect(mapHeadline([node('bp', 'above'), node('sugar', 'within')])).toBe('One result needs a look')
    expect(mapHeadline([node('bp', 'above'), node('sugar', 'below')])).toBe('Two results need a look')
    expect(mapHeadline([node('pulse', 'none')])).toBe('Your latest numbers are in')
    expect(mapHeadline(all('none', true))).toBe('Nothing to show yet')
  })
})

describe('body systems for the Explore badges', () => {
  const r = (test: string, value: number, labLow: number | null = null, labHigh: number | null = null): Reading => ({ personId: 'p', takenAt: '2026-10-01', test, value, labLow, labHigh })
  it('maps tests to a system and counts flagged and in-range results', () => {
    expect(systemOf('bp_systolic')).toBe('heart')
    expect(systemOf('hdl')).toBe('heart')
    expect(systemOf('creatinine')).toBe('kidneys')
    expect(systemOf('alt')).toBe('digestion')
    expect(systemOf('hba1c')).toBe('hormones')
    expect(systemOf('something_else')).toBeNull()
    const c = systemCounts([r('creatinine', 2, 0.6, 1.2), r('egfr', 80, 60, null), r('rbc', 8.1)])
    expect(c.kidneys).toEqual({ total: 2, flagged: 1, ok: 1 })
    expect(c.heart).toEqual({ total: 1, flagged: 0, ok: 0 }) // no range: counted, but neither flagged nor green
  })

  it('status pill: amber first, green only with a real range, otherwise plain', () => {
    expect(systemStatus({ total: 3, flagged: 2, ok: 1 })).toEqual({ tone: 'warn', text: '2 results to look at' })
    expect(systemStatus({ total: 1, flagged: 0, ok: 1 })).toEqual({ tone: 'ok', text: '1 result in range' })
    expect(systemStatus({ total: 2, flagged: 0, ok: 0 })?.tone).toBe('none')
    expect(systemStatus({ total: 0, flagged: 0, ok: 0 })).toBeNull()
  })

  it('every system glow point sits inside its window', () => {
    for (const [id, [x, y]] of Object.entries(FOCUS)) {
      const [vx, vy, vw, vh] = VIEW[id]!
      expect(x >= vx && x <= vx + vw && y >= vy && y <= vy + vh, id).toBe(true)
    }
  })
})

describe('BodyMap', () => {
  it('glows amber on a flagged point, green on a within point, nothing on unknown', () => {
    const nodes = [node('bp', 'above'), node('sugar', 'within'), node('pulse', 'none'), node('sleep', 'none', true), node('mood', 'none', true), node('weight', 'none', true), node('steps', 'none', true)]
    const { container } = render(<BodyMap nodes={nodes} />)
    expect(container.querySelectorAll('.hv-glow.warn')).toHaveLength(1)
    expect(container.querySelectorAll('.hv-glow.ok')).toHaveLength(1)
    expect(container.querySelectorAll('.hv-glow')).toHaveLength(2)
    expect(screen.getByTestId('map-headline').textContent).toBe('One result needs a look')
    expect(container.querySelectorAll('a[data-node]')).toHaveLength(7)
  })

  it('all unknown: dimmed figure and no tiles, with the single call to action when given', () => {
    const { container, rerender } = render(<BodyMap nodes={all('none', true)} cta={{ href: '#today', label: 'Log a reading' }} />)
    expect(screen.getByRole('link', { name: 'Log a reading' })).toBeTruthy()
    expect(container.querySelector('[data-node]')).toBeNull()
    rerender(<BodyMap nodes={all('none', true)} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('No data yet')).toBeNull()
    expect(screen.getByText(/No vitals yet/)).toBeTruthy()
  })
})
