import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const g = vi.hoisted(() => ({ waterMl: null as number | null }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => 'p1', useActingCan: () => null }))
vi.mock('./hooks', () => ({ useWater: () => [], useGoal: () => ({ waterMl: g.waterMl, waterSource: 'default' }) }))
vi.mock('./WaterPanel', () => ({ default: () => <p data-testid="panel">panel</p> }))
import WaterSheet from './WaterSheet'

afterEach(cleanup)

describe('WaterSheet', () => {
  it('a baby under 1 year (no goal): one plain line, no panel, no add button', () => {
    g.waterMl = null
    render(<WaterSheet />)
    expect(screen.getByText('No water goal for babies under 1 year. Ask their doctor about water.')).toBeTruthy()
    expect(screen.queryByTestId('panel')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('with a goal the panel shows', () => {
    g.waterMl = 1500
    render(<WaterSheet />)
    expect(screen.getByTestId('panel')).toBeTruthy()
  })
})
