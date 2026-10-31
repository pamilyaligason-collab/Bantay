import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { track } from '../admin/events'
import BreathSheet from './BreathSheet'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p1' }))

beforeEach(async () => { await db.kv.clear(); vi.mocked(track).mockClear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

/** Runs a 1 minute Box breath to the mood screen. */
async function toMood() {
  render(<BreathSheet onClose={() => undefined} />)
  fireEvent.click(await screen.findByRole('button', { name: /Calm/ }))
  fireEvent.click(screen.getByRole('button', { name: '1 min' }))
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  act(() => { vi.advanceTimersByTime(5000) })
  act(() => { vi.advanceTimersByTime(60_000) })
  vi.useRealTimers()
  await screen.findByText('Well done. How do you feel now?')
}

describe('BreathSheet', () => {
  it.each([['Worse', 1], ['Same', 3], ['Better', 5]] as const)('%s is saved as %i on the 1-5 scale with the person id, and breathe_done is counted once', async (word, v) => {
    await toMood()
    fireEvent.click(screen.getByRole('button', { name: word }))
    await waitFor(async () => expect(((await db.kv.get('selfcare.log'))?.value as unknown[])[0]).toMatchObject({ mood: v, pattern: 'calm', minutes: 1, personId: 'p1' }))
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('action', 'breathe_done')
    expect(screen.getByRole('status').textContent).toBe(`Saved on this phone: ${word}. Rest a moment.`)
  })

  it('Skip saves no mood but still counts the finished breath', async () => {
    await toMood()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(async () => expect(((await db.kv.get('selfcare.log'))?.value as { mood: number | null }[])[0]!.mood).toBeNull())
    expect(track).toHaveBeenCalledWith('action', 'breathe_done')
  })

  it('the mood screen shows Jack well-done and no drawn tick (D-103 rule 8: Jack or a check, never both)', async () => {
    await toMood()
    expect(document.querySelectorAll('img.jack')).toHaveLength(1)
    expect(document.querySelector('.bs-mood svg')).toBeNull()
  })

  it('ending early and closing by hand write nothing and count nothing', async () => {
    const onClose = vi.fn()
    render(<BreathSheet onClose={onClose} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('button', { name: 'End early' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(await db.kv.get('selfcare.log')).toBeUndefined()
    expect(track).not.toHaveBeenCalled()
  })
})
