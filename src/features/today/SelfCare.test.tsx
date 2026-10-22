import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import SelfCare from './SelfCare'

beforeEach(async () => { await db.kv.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('SelfCare', () => {
  it('starts a breath, counts down, ends with an optional mood saved on this phone', async () => {
    render(<SelfCare />)
    fireEvent.click(await screen.findByRole('button', { name: /Sleep/ }))
    expect(screen.getByText(/4-7-8 breath is a popular/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Weil/ }).getAttribute('href')).toMatch(/^https:\/\//)
    fireEvent.click(screen.getByRole('button', { name: '1 min' }))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('status').textContent).toBe('Breathe in')
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByRole('status').textContent).toBe('Hold gently')
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('Well done. How do you feel now?')).toBeTruthy()
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: '4 Good' }))
    await waitFor(async () => expect(((await db.kv.get('selfcare.log'))?.value as { mood: number }[])[0]).toMatchObject({ mood: 4, pattern: 'sleep' }))
  })

  it('End early goes back without a log entry', async () => {
    render(<SelfCare />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('button', { name: 'End early' }))
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    expect(await db.kv.get('selfcare.log')).toBeUndefined()
  })
})
