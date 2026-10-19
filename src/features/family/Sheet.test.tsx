import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sheet from './Sheet'

const motion = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))

describe('Sheet exit', () => {
  beforeEach(() => { vi.useFakeTimers(); motion() })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('sets data-closing, then calls onClose once after 200ms even if closed twice', () => {
    const onClose = vi.fn()
    render(<Sheet title="T" onClose={onClose}><p>x</p></Sheet>)
    const wrap = screen.getByRole('dialog').parentElement!
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(wrap.getAttribute('data-closing')).toBe('true')
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(199) })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clears the timer on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(<Sheet title="T" onClose={onClose}><p>x</p></Sheet>)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    unmount()
    act(() => { vi.advanceTimersByTime(500) })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes at once with reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }))
    const onClose = vi.fn()
    render(<Sheet title="T" onClose={onClose}><p>x</p></Sheet>)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
