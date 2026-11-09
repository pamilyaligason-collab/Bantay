import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let synced: number | undefined
const logDose = vi.hoisted(() => vi.fn())
vi.mock('../log/store', () => ({ logDose }))
vi.mock('../notify/store', () => ({ markSeen: vi.fn(async () => undefined) }))
vi.mock('../phonecheck/useKvValue', () => ({ useKvValue: () => synced }))

import { FocusActions as PersonCard } from './PersonCard'
import type { PersonFocus } from './useFocuses'

const item = (kind: string) => ({
  person: { id: 'ma', name: 'Ma Sample', isMe: false, photoPath: null, thumb: null, phone: null },
  focus: { kind, tint: 'red', line: 'Missed a medicine', body: 'Aspirin was due 8 AM.', action: { label: 'Mark taken', kind: 'mark' } },
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

describe('PersonCard Yes, I saw', () => {
  it('a double tap writes one dose', async () => {
    let done!: () => void
    logDose.mockReset(); logDose.mockImplementation(() => new Promise<void>((r) => { done = r }))
    const it0 = item('missed') as unknown as { focus: { action: unknown }; missedDoses: unknown[] }
    it0.focus.action = { label: 'Mark taken', kind: 'mark' }
    it0.missedDoses = [{ med: { name: 'Losartan' }, slot: '09:00', time: '9:00 AM' }]
    render(<PersonCard item={it0 as unknown as PersonFocus} selfName="Me" onNote={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^Mark taken for/ }))
    const yes = screen.getByRole('button', { name: 'Yes, I saw' })
    fireEvent.click(yes); fireEvent.click(yes)
    done()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Yes, I saw' })).toBeNull())
    expect(logDose).toHaveBeenCalledTimes(1)
  })
})
