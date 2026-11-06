import 'fake-indexeddb/auto'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import BreathSheet from './BreathSheet'
import SelfCare from './SelfCare'

beforeEach(async () => { await db.kv.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

const Host = () => { const [on, setOn] = useState(true); return on ? <BreathSheet onClose={() => setOn(false)} /> : null }
const open = async () => { render(<Host />); await screen.findByRole('dialog', { name: 'Take a breath' }) }

describe('SelfCare row and BreathSheet', () => {
  it('is a row with the title as a heading; Start is a link to the full Calm screen, not a sheet (D-142)', () => {
    render(<SelfCare />)
    expect(screen.getByRole('heading', { name: 'Take a breath' })).toBeTruthy()
    expect(screen.getByText(/1 minute \u00b7 in 4, out 6 \u00b7 last: none yet/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start breathing' }).getAttribute('href')).toBe('#calm')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the sheet pushes one history entry', async () => {
    const push = vi.spyOn(history, 'pushState')
    await open()
    expect(push).toHaveBeenCalledWith({ bantayBreathe: true }, '')
    push.mockRestore()
  })

  it('system back closes the sheet', async () => {
    await open()
    await screen.findByRole('dialog')
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('picks a pattern with its why and source, runs, and saves Worse / Same / Better on this phone with the person id slot', async () => {
    await open()
    fireEvent.click(await screen.findByRole('button', { name: /Calm/ }))
    expect(screen.getByText(/Equal counts in, hold, out and rest/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Harvard/ }).getAttribute('href')).toMatch(/^https:\/\//)
    fireEvent.click(screen.getByRole('button', { name: '1 min' }))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getAllByRole('status')[0]!.textContent).toBe('Breathe in')
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getAllByRole('status')[0]!.textContent).toBe('Hold gently')
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('Well done. How do you feel now?')).toBeTruthy()
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Better' }))
    await waitFor(async () => expect(((await db.kv.get('selfcare.log'))?.value as { mood: number }[])[0]).toMatchObject({ mood: 5, pattern: 'calm', personId: null }))
  })

  it('offers Relax and Calm only: 4-7-8 is hidden behind the clinician flag', async () => {
    await open()
    await screen.findByRole('button', { name: /Relax/ })
    expect(screen.getByRole('button', { name: /Calm/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Sleep/ })).toBeNull()
  })

  it('End early goes back to the pick screen without a log entry', async () => {
    await open()
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    fireEvent.click(screen.getByRole('button', { name: 'End early' }))
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    expect(await db.kv.get('selfcare.log')).toBeUndefined()
  })
})
