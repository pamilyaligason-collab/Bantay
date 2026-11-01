import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let synced: number | undefined
vi.mock('../phonecheck/useKvValue', () => ({ useKvValue: () => synced }))

import { PersonCard } from './PersonCard'
import type { PersonFocus } from './useFocuses'

const item = (kind: string) => ({
  person: { id: 'ma', name: 'Ma Sample', isMe: false, photoPath: null, thumb: null, phone: null },
  focus: { kind, tint: 'red', line: 'Missed a medicine', body: 'Aspirin was due 8 AM.', action: { label: 'Open', kind: 'open' } },
  missedDoses: [], alertIds: [], asks: []
}) as unknown as PersonFocus

afterEach(cleanup)

describe('PersonCard last synced line', () => {
  it('a missed dose says how old the data is', () => {
    synced = Date.now() - 3 * 3_600_000
    render(<PersonCard item={item('missed')} selfName="Me" onNote={() => {}} />)
    expect(screen.getByTestId('pc-sync').textContent).toBe('Last synced 3 h ago')
  })
  it('never synced says so', () => {
    synced = undefined
    render(<PersonCard item={item('missed')} selfName="Me" onNote={() => {}} />)
    expect(screen.getByTestId('pc-sync').textContent).toBe('Not synced yet on this phone')
  })
  it('other cards do not show it', () => {
    synced = Date.now()
    render(<PersonCard item={item('ok')} selfName="Me" onNote={() => {}} />)
    expect(screen.queryByTestId('pc-sync')).toBeNull()
  })
})
