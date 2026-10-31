import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BodyHero } from './BodyHero'
import type { NodeView } from './model'

afterEach(cleanup)
const node = (id: NodeView['id'], label: string, value: string, over: Partial<NodeView> = {}): NodeView => ({ id, label, value, note: '7-day avg', state: 'within', code: id === 'bp' ? 'bp_systolic' : id, empty: false, ...over })
const NODES: NodeView[] = [
  node('sleep', 'Sleep', '7h 00', { state: 'none' }), node('mood', 'Mood', 'Good', { state: 'none' }), node('bp', 'BP', '132/84', { state: 'above', note: 'Above target' }),
  node('pulse', 'Pulse', '74', { state: 'none' }), node('sugar', 'Sugar', '118'), node('weight', 'Weight', '61 kg', { state: 'none' }), node('steps', 'Steps', '4,210', { state: 'none' })
]
const props = { canLog: true, canEdit: true, onAdd: () => undefined }

describe('BodyHero', () => {
  it('draws the 7 points, a pulsing glow only on the result that needs a look, and the 4 averages as links with their label first', () => {
    render(<BodyHero nodes={NODES} blank={false} {...props} />)
    const hero = screen.getByTestId('bodyhero')
    expect(hero.querySelectorAll('.hv-pt')).toHaveLength(7)
    expect(hero.querySelectorAll('.hv-glow.warn')).toHaveLength(1)
    expect(hero.querySelectorAll('.hv-glow.ok')).toHaveLength(1) // sugar is in range; unknown points get no glow
    expect(screen.getByRole('link', { name: /^BP 132\/84 Above target/ }).getAttribute('href')).toBe('#health/metric/bp_systolic')
    expect(Array.from(hero.querySelectorAll('.bh-stat')).map((a) => a.getAttribute('data-node'))).toEqual(['bp', 'sugar', 'weight', 'pulse'])
    expect(hero.textContent).toContain('7-day averages')
  })

  it('blank: a faint figure with no organs or glows, one line, and the same two actions', () => {
    render(<BodyHero nodes={NODES.map((n) => ({ ...n, empty: true, value: '--' }))} blank {...props} />)
    const hero = screen.getByTestId('bodyhero')
    expect(hero.textContent).toContain('No readings yet')
    expect(hero.querySelector('.hv-glow, .hv-organs, .hv-pt')).toBeNull()
    expect(screen.getByRole('button', { name: '+ Reading' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Scan' }).getAttribute('href')).toBe('#scan')
  })

  it('without log rights + Reading is a disabled lock that says View only and why; Scan locks without edit rights', () => {
    render(<BodyHero nodes={NODES} blank={false} canLog={false} canEdit={false} onAdd={() => undefined} lockReason="Ask her." />)
    const add = screen.getByRole('button', { name: '+ Reading, view only' }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
    expect(add.textContent).toContain('View only')
    expect(screen.getByText('Ask her.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Scan' })).toBeNull()
  })
})
