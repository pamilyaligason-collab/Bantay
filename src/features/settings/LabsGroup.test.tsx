import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS, readFlags } from '../safety/flags'
import LabsGroup, { setFlag } from './LabsGroup'

const reload = vi.fn()
beforeEach(() => { localStorage.clear(); reload.mockReset() })
afterEach(cleanup)

describe('Labs switches', () => {
  it('one switch per flag in the flags module, showing the defaults', () => {
    render(<LabsGroup />)
    expect(screen.getAllByRole('switch')).toHaveLength(Object.keys(DEFAULTS).length)
    expect(screen.getByRole('switch', { name: 'Offline maps' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Local hazard packs' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/The page reloads/)).toBeTruthy()
  })
  it('a switch writes the stored flags the flags module reads, keeps the others, and reloads', () => {
    localStorage.setItem('bantay.flags', JSON.stringify({ worldFeeds: true }))
    render(<LabsGroup reload={reload} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Offline maps' }))
    expect(readFlags()).toEqual({ ...DEFAULTS, worldFeeds: true, offlineMaps: false })
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('shows a flag that is already on, and turning it off writes false', () => {
    localStorage.setItem('bantay.flags', JSON.stringify({ localPacks: true }))
    render(<LabsGroup reload={reload} />)
    const sw = screen.getByRole('switch', { name: 'Local hazard packs' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(readFlags().localPacks).toBe(false)
  })
  it('with storage refused it does not reload', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const r = vi.fn()
    setFlag('offlineMaps', true, r)
    expect(r).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
