import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Tile } from './Kpis'
import type { Kpi } from './kpisLogic'

afterEach(cleanup)
const k = (value: string): Kpi => ({ code: 'doses', href: '#health', label: 'Doses on time', value, unit: '', when: 'this week', sub: 'x', spark: [] })

describe('Kpis tile', () => {
  it('a zero count reads "Not yet", a real figure is shown as is', () => {
    render(<Tile k={k('0 of 4')} />)
    expect(screen.getByText('Not yet').className).toBe('kp-none')
    cleanup()
    render(<Tile k={k('3 of 4')} />)
    expect(screen.queryByText('Not yet')).toBeNull()
    expect(screen.getByText('3 of 4')).toBeTruthy()
  })
})
