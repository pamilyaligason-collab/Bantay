import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NudgeCard } from './NudgeCard'

afterEach(cleanup)

describe('NudgeCard', () => {
  it('nothing logged: gentle words, no zero, the BP button opens the sheet', () => {
    const onAdd = vi.fn()
    render(<NudgeCard personId="p" readings={[]} canLog onAdd={onAdd} />)
    const card = screen.getByTestId('nudge')
    expect(card.textContent).toContain('0/3')
    expect(card.textContent).toContain('Not yet this week')
    expect(card.textContent).toContain('Check your BP now')
    fireEvent.click(screen.getByRole('button', { name: 'Add BP' }))
    expect(onAdd).toHaveBeenCalledWith('bp')
  })
  it('cannot log for this person: rings only, no buttons', () => {
    render(<NudgeCard personId="p" readings={[]} canLog={false} onAdd={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
