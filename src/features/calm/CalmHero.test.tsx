// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

// The real useKv: instances do not share state, so the hero must re-read after the sheet closes.
vi.mock('../today/BreathSheet', () => ({ default: ({ onClose }: { onClose: () => void }) => <div role="dialog"><button onClick={onClose}>close</button></div> }))
beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

import CalmHero from './CalmHero'

describe('CalmHero with the real useKv', () => {
  it('after the sheet logs a session and closes, the hero says Done once today and shows the new buzz', async () => {
    render(<CalmHero />)
    await waitFor(() => expect(screen.getByText('Not done yet today')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    // another useKv instance (BreathSheet) writes while the sheet is open
    await act(async () => {
      await db.kv.put({ key: 'selfcare.log', value: [{ at: new Date().toISOString(), pattern: 'relax', minutes: 1, mood: 3 }] })
      await db.kv.put({ key: 'selfcare.buzz', value: false })
    })
    fireEvent.click(screen.getByText('close'))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start' })) // BreathSheet does not return focus itself
    await waitFor(() => expect(screen.getByText('Done once today')).toBeTruthy())
    expect(screen.getByRole('switch', { name: 'Gentle buzz' }).getAttribute('aria-checked')).toBe('false')
  })
  it('the buzz switch writes selfcare.buzz', async () => {
    render(<CalmHero />)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Gentle buzz' })).toBeTruthy())
    fireEvent.click(screen.getByRole('switch', { name: 'Gentle buzz' }))
    await waitFor(async () => expect((await db.kv.get('selfcare.buzz'))?.value).toBe(false))
    expect(screen.getByRole('switch', { name: 'Gentle buzz' }).getAttribute('aria-checked')).toBe('false')
  })
  it('the idle orb is hidden from screen readers so its changing word is not announced', () => {
    render(<CalmHero />)
    const orb = screen.getByTestId('calm-hero').querySelector('.bo')!
    expect(orb.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
