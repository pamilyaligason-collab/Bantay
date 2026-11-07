import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WaterPanel from './WaterPanel'

vi.mock('./actions', () => ({ logWater: async () => 'ok', undoWater: async () => 'ok' }))
afterEach(cleanup)
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
  it('no goal (a baby under 1 year): nothing renders', () => {
    const { container } = panel({ goalMl: null, source: 'none' })
    expect(container.innerHTML).toBe('')
  })
})
