import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
// CarerCards is covered by carer-cards.test; here it is a stub that hands out the three callbacks NeedYouNow wires.
const cards = vi.hoisted(() => ({ items: 0 }))
vi.mock('./CarerCards', () => ({
  CarerCards: (p: { onMessage: (id: string) => void; onPhones: () => void; onNote: (t: string) => void }) => cards.items === 0 ? null : (
    <div data-testid="cards">
      <b>Needs you now</b>
      <button onClick={() => p.onMessage('p2')}>msg-ben</button>
      <button onClick={() => p.onMessage('p1')}>msg-me</button>
      <button onClick={p.onPhones}>phones</button>
      <button onClick={() => p.onNote('Marked as taken')}>note</button>
    </div>
  )
}))
vi.mock('./roster', () => ({
  useFamilyPeople: () => ({ people: [{ id: 'p1', name: 'Lloyd Roc', isMe: true }, { id: 'p2', name: 'Ate Joy Cruz', isMe: false }], selfId: 'p1' })
}))
import { messagePrefill } from './Messages'
import NeedYouNow from './NeedYouNow'

afterEach(() => { cleanup(); cards.items = 0; messagePrefill.text = ''; location.hash = '' })

describe('NeedYouNow', () => {
  it('draws nothing at all while the carer cards have nothing (also the state before they load)', () => {
    const { container } = render(<NeedYouNow />)
    expect(container.innerHTML).toBe('')
  })

  it('with items it shows the cards; Message opens the one chat with "@name " ready (kinship title kept), never for yourself', () => {
    cards.items = 2
    render(<NeedYouNow />)
    expect(screen.getByText('Needs you now')).toBeTruthy()
    fireEvent.click(screen.getByText('msg-ben'))
    expect(location.hash).toBe('#family/messages')
    expect(messagePrefill.text).toBe('@Ate Joy ')
    messagePrefill.text = ''
    fireEvent.click(screen.getByText('msg-me'))
    expect(messagePrefill.text).toBe('')
  })

  it('the phones button goes to Me > Phone > Family phones; a note shows as a status toast and clears itself', () => {
    vi.useFakeTimers()
    try {
      cards.items = 1
      render(<NeedYouNow />)
      fireEvent.click(screen.getByText('phones'))
      expect(location.hash).toBe('#me/phone/phones')
      fireEvent.click(screen.getByText('note'))
      expect(screen.getByRole('status').textContent).toBe('Marked as taken')
      act(() => { vi.advanceTimersByTime(4000) })
      expect(screen.queryByRole('status')).toBeNull()
    } finally { vi.useRealTimers() }
  })
})
