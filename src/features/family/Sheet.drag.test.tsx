import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sheet from './Sheet'

const motion = (reduce = false) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce, media: q, addEventListener() {}, removeEventListener() {} }))
const pt = (y: number, t: number) => ({ pointerId: 1, clientY: y, timeStamp: t, pointerType: 'touch' })
const grab = () => document.querySelector('.fm-grab-zone')!
const tr = (el: HTMLElement) => parseFloat(el.style.transform.replace('translateY(', ''))

describe('Sheet drag to dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers(); motion()
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 400 }) // jsdom has no layout; the sheet is 400 px tall
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight })

  it('follows the finger 1:1 from the grab point and closes when released past 40%', () => {
    const onClose = vi.fn()
    render(<Sheet title="T" onClose={onClose}><p>x</p></Sheet>)
    const dlg = screen.getByRole('dialog')
    fireEvent.pointerDown(grab(), pt(100, 0))
    fireEvent.pointerMove(dlg, pt(150, 400))
    expect(dlg.style.transform).toBe('translateY(50px)') // 150 - 100, no lag
    fireEvent.pointerMove(dlg, pt(300, 800))
    expect(dlg.style.transform).toBe('translateY(200px)')
    fireEvent.pointerUp(dlg, pt(300, 1200)) // 200 > 160 and standing still
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(280) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('springs back when released short and slow, and resists when pulled up', () => {
    const onClose = vi.fn()
    render(<Sheet title="T" onClose={onClose}><p>x</p></Sheet>)
    const dlg = screen.getByRole('dialog')
    fireEvent.pointerDown(grab(), pt(100, 0))
    fireEvent.pointerMove(dlg, pt(0, 100)) // 100 px up
    expect(tr(dlg)).toBeCloseTo(-48.35, 1) // rubber band, not -100
    fireEvent.pointerMove(dlg, pt(160, 500))
    fireEvent.pointerUp(dlg, pt(160, 1000)) // 60 px, slow
    expect(dlg.style.transform).toBe('')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a fast flick closes it from a short distance', () => {
    const onClose = vi.fn()
    render(<Sheet title="T" onClose={onClose}><p>x</p></Sheet>)
    const dlg = screen.getByRole('dialog')
    fireEvent.pointerDown(grab(), pt(100, 0))
    vi.advanceTimersByTime(20)
    fireEvent.pointerMove(dlg, pt(120, 20))
    vi.advanceTimersByTime(20)
    fireEvent.pointerMove(dlg, pt(160, 40)) // (160-100)/40 = 1.5 px/ms, only 60 px down
    fireEvent.pointerUp(dlg, pt(160, 45))
    act(() => { vi.advanceTimersByTime(280) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a body drag needs 6 px down from a non-control; a button never starts one', () => {
    render(<Sheet title="T" onClose={() => undefined}><p data-testid="p">x</p></Sheet>)
    const dlg = screen.getByRole('dialog')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Close' }), pt(100, 0))
    fireEvent.pointerMove(dlg, pt(200, 50))
    expect(dlg.style.transform).toBe('')
    fireEvent.pointerUp(dlg, pt(200, 60))
    fireEvent.pointerDown(screen.getByTestId('p'), pt(100, 100))
    fireEvent.pointerMove(dlg, pt(104, 120))
    expect(dlg.style.transform).toBe('')
    fireEvent.pointerMove(dlg, pt(130, 140)) // crossed 6 px: the drag starts here, no jump
    expect(dlg.style.transform).toBe('')
    fireEvent.pointerMove(dlg, pt(150, 160))
    expect(dlg.style.transform).toBe('translateY(20px)')
  })

  it('under reduced motion nothing follows the finger, a long drag down still closes at once, a short one does not, and Escape closes', () => {
    motion(true)
    const onClose = vi.fn()
    render(<Sheet title="T" onClose={onClose}><p>x</p></Sheet>)
    const dlg = screen.getByRole('dialog')
    fireEvent.pointerDown(grab(), pt(100, 0))
    fireEvent.pointerMove(dlg, pt(300, 50))
    expect(dlg.style.transform).toBe('') // no follow animation
    fireEvent.pointerUp(dlg, pt(300, 1000)) // 200 px of a 400 px sheet, standing still: past the threshold
    expect(onClose).toHaveBeenCalledTimes(1) // instant, no timer
    onClose.mockClear(); cleanup()
    render(<Sheet title="T" onClose={onClose}><p>x</p></Sheet>)
    const d2 = screen.getByRole('dialog')
    fireEvent.pointerDown(grab(), pt(100, 0))
    fireEvent.pointerMove(d2, pt(140, 500))
    fireEvent.pointerUp(d2, pt(140, 1000)) // 40 px, slow: stays open
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(d2, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('data-fit follows real size changes of the sheet and its content, and the observers go on close', () => {
    const cbs: Array<() => void> = []
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { cbs.push(cb) } observe() {} disconnect = disconnect })
    let sh = 100, ch = 400 // scrollHeight, clientHeight
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => sh })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => ch })
    try {
      const { unmount } = render(<Sheet title="T" onClose={() => undefined}><p>x</p></Sheet>)
      const dlg = screen.getByRole('dialog')
      expect(dlg.hasAttribute('data-fit')).toBe(true)
      sh = 500 // content grew, or the keyboard shrank the sheet; no React render happens
      act(() => cbs.forEach((f) => f()))
      expect(dlg.hasAttribute('data-fit')).toBe(false)
      sh = 100
      act(() => cbs.forEach((f) => f()))
      expect(dlg.hasAttribute('data-fit')).toBe(true)
      unmount()
      expect(disconnect).toHaveBeenCalled()
    } finally {
      delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
    }
  })
})
