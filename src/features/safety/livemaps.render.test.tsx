import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from './alerts'
import LiveMaps from './LiveMaps'

const rows = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('./store', () => ({ useKv: () => rows.list }))
afterEach(cleanup)

describe('LiveMaps storm list', () => {
  it('shows name, since date and level for an active storm', () => {
    rows.list = [{ id: 'gdacs-TC-1', kind: 'gdacs', issuedAt: '2026-10-12T00:00:00Z', title: 'Tropical Cyclone PEPITO', where: 'Philippines', level: 'Orange' } as Alert]
    render(<LiveMaps loc={{ lat: 9.65, lon: 123.88 }} />)
    expect(screen.getByText('Tropical Cyclone PEPITO')).toBeTruthy()
    expect(screen.getByText(/Orange alert · since \d+ \w+/)).toBeTruthy()
    expect(screen.queryByText('No active storms')).toBeNull()
  })
})
