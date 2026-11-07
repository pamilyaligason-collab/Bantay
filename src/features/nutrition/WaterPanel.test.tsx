import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WaterPanel from './WaterPanel'

const acting = vi.hoisted(() => ({ v: { acting: false, personId: null as string | null, name: '' } }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => acting.v }))
vi.mock('./actions', () => ({ logWater: async () => 'ok', undoWater: async () => 'ok' }))
afterEach(() => { cleanup(); acting.v = { acting: false, personId: null, name: '' } })
const now = new Date(2026, 10, 5, 10)
const panel = (p: Partial<Parameters<typeof WaterPanel>[0]> = {}) => render(<WaterPanel rows={[]} goalMl={1500} now={now} {...p} />)

describe('WaterPanel hints', () => {
  it("shows \"Your doctor's limit\" only for the limit source", () => {
    panel({ source: 'limit' })
    expect(screen.getByText("Your doctor's limit")).toBeTruthy()
    cleanup()
    panel({ source: 'weight' })
    expect(screen.queryByText("Your doctor's limit")).toBeNull()
  })
  it('offers Add your weight for the default and sex sources, only to someone who can add', () => {
    for (const source of ['default', 'sex']) { panel({ source }); expect(screen.getByRole('link', { name: /Add your weight/ }).getAttribute('href')).toBe('#health/metric/weight'); cleanup() }
    for (const source of ['weight', 'child', 'limit', 'saved']) { panel({ source }); expect(screen.queryByRole('link', { name: /Add your weight/ })).toBeNull(); cleanup() }
    panel({ source: 'default', canAdd: false })
    expect(screen.queryByRole('link', { name: /Add your weight/ })).toBeNull()
  })
  it('names the person when acting for someone or given a name; the link still goes to the weight page', () => {
    acting.v = { acting: true, personId: 'p2', name: 'rey dela Cruz' }
    panel({ source: 'default', personId: 'p2' })
    const a = screen.getByRole('link', { name: /Add Rey's weight for a goal that fits Rey/ })
    expect(a.getAttribute('href')).toBe('#health/metric/weight')
    expect(screen.queryByText(/your weight/i)).toBeNull()
    cleanup()
    acting.v = { acting: false, personId: null, name: '' }
    panel({ source: 'sex', name: 'ana lim' })
    expect(screen.getByRole('link', { name: /Add Ana's weight/ })).toBeTruthy()
  })
  it('acting as someone else never lends that name to another person the panel shows', () => {
    acting.v = { acting: true, personId: 'p2', name: 'Rey' }
    panel({ source: 'default', personId: 'p3' })
    expect(screen.queryByText(/Rey/)).toBeNull()
    expect(screen.getByRole('link', { name: /Add your weight for a goal that fits you/ })).toBeTruthy()
    cleanup()
    panel({ source: 'default', personId: 'p3', name: 'ana lim' })
    expect(screen.getByRole('link', { name: /Add Ana's weight/ })).toBeTruthy()
  })
  it('no goal (a baby under 1 year): nothing renders', () => {
    const { container } = panel({ goalMl: null, source: 'none' })
    expect(container.innerHTML).toBe('')
  })
})

describe('WaterPanel limit hint names the person', () => {
  it("another named person: Rey's doctor's limit; self keeps Your doctor's limit", () => {
    panel({ source: 'limit', name: 'rey dela Cruz' })
    expect(screen.getByText("Rey's doctor's limit")).toBeTruthy()
    expect(screen.queryByText("Your doctor's limit")).toBeNull()
  })
})
