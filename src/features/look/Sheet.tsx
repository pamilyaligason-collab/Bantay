import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../shell/Icon'
import { dragOffset, shouldDismiss, velocityOf, type Sample } from '../family/sheetDrag'
import './v13.css'

/** v13 bottom sheet (contract 4), the family/Sheet behaviour on the look/ classes. Portal into .bt so it sits above the tab bar; Escape, the dim area, the close button and Back (a history entry) close it; focus returns on close; one open at a time.
 *  Closing plays the 200ms exit (data-closing, v13.css) first. With reduced motion, or without matchMedia, it closes at once and nothing follows the finger.
 *  Drag down from the grab handle, or from the body when it is scrolled to the top: the sheet follows the finger 1:1, resists when pulled up, and on release keeps its momentum (family/sheetDrag.ts) to decide between closing and springing back. */
let current: { close: () => void; prev: HTMLElement | null } | null = null // the open sheet: "close me now" and who to give focus back to; a second sheet closes it and inherits the opener

/** Pop the sheet's history entry (one Back press afterwards, no dead entry), then run `then` once the pop has landed. */
export function leaveSheet(then: () => void) {
  if (!history.state?.bantaySheet) return then()
  window.addEventListener('popstate', then, { once: true })
  history.back()
}

export function Sheet({ title, onClose, children, focusTitle = false, hideTitle = false, closeLabel = 'Close', testId, guard }: { title: string; onClose: () => void; children: ReactNode; focusTitle?: boolean; hideTitle?: boolean; closeLabel?: string; testId?: string; /** Returns true to keep the sheet open (the caller shows its own confirm line). */ guard?: () => boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const timer = useRef<number>(0)
  const drag = useRef<{ id: number; y0: number; base: number; live: boolean; samples: Sample[] } | null>(null)
  const still = () => !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const guardRef = useRef(guard)
  guardRef.current = guard
  const close = (popped = false) => {
    if (closing || timer.current) return
    if (guardRef.current?.()) { if (popped) history.pushState({ bantaySheet: 1 }, ''); return } // a Back press already popped our entry: put it back
    if (!popped && history.state?.bantaySheet) history.back() // our entry goes with the sheet; the popstate that follows finds it closing
    if (still()) { timer.current = -1; return onCloseRef.current() } // -1 marks closed so a second tap is ignored
    setClosing(true)
    timer.current = window.setTimeout(() => onCloseRef.current(), 200)
  }
  useEffect(() => {
    const prev = current ? current.prev : document.activeElement as HTMLElement | null // a superseding sheet returns focus to the first opener
    const mine = () => { window.clearTimeout(timer.current); timer.current = -1; onCloseRef.current() } // superseded: gone at once, no exit over the new sheet
    const entry = { close: mine, prev }
    current?.close()
    current = entry
    if (!history.state?.bantaySheet) history.pushState({ bantaySheet: 1 }, '') // StrictMode runs effects twice in dev: one entry only
    const pop = () => close(true)
    window.addEventListener('popstate', pop)
    const first = focusTitle ? box.current?.querySelector<HTMLElement>('h2') : box.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, select, button:not(.lk-x)') // an existing item: start at the title, not in a field
    ;(first ?? box.current)?.focus()
    return () => { window.removeEventListener('popstate', pop); window.clearTimeout(timer.current); if (current === entry) { current = null; prev?.focus?.() } }
  }, [])
  useEffect(() => { // data-fit (touch-action:none, family.css) only while nothing scrolls; re-measured when the sheet or any child resizes (keyboard, child state), not just on render
    const el = box.current
    if (!el) return
    const fit = () => el.toggleAttribute('data-fit', el.scrollHeight <= el.clientHeight)
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit), seen = new Set<Element>()
    const watch = () => [el, ...Array.from(el.children)].forEach((c) => { if (!seen.has(c)) { seen.add(c); ro.observe(c) } })
    watch()
    const mo = new MutationObserver(() => { watch(); fit() })
    mo.observe(el, { childList: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])
  const paint = (offset: number, ease: boolean) => {
    const el = box.current, wrap = el?.parentElement
    if (!el || !wrap || still()) return // reduced motion: the sheet never follows the finger
    el.style.transition = ease ? 'transform var(--dur-sheet) var(--ease-sheet)' : 'none'
    el.style.transform = offset ? `translateY(${offset}px)` : ''
    wrap.style.setProperty('--lk-dim', String(Math.max(0, 1 - Math.max(0, offset) / (el.offsetHeight || 1))))
  }
  /** Where the sheet is right now, mid spring-back included (so a new touch picks it up instead of jumping). */
  const nowOffset = () => {
    try { return new DOMMatrixReadOnly(getComputedStyle(box.current!).transform).m42 || 0 } catch { return 0 }
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (timer.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    const t = e.target as HTMLElement
    const grab = !!t.closest('.lk-grab-zone')
    if (!grab && (box.current!.scrollTop > 0 || t.closest('input, textarea, select, button, a, [contenteditable]'))) return // a body drag only from the top and not from a control
    const base = nowOffset()
    drag.current = { id: e.pointerId, y0: e.clientY, base, live: grab || base !== 0, samples: [{ y: e.clientY, t: performance.now() }] }
    if (drag.current.live) { e.currentTarget.setPointerCapture?.(e.pointerId); paint(base, false) }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.live) {
      const dy = e.clientY - d.y0
      if (dy > 6 && box.current!.scrollTop <= 0) { d.live = true; d.y0 = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId) } // start where the drag began, no jump
      else { if (dy < -6 || box.current!.scrollTop > 0) drag.current = null; return } // it is a scroll
    }
    d.samples = [...d.samples.slice(-5), { y: e.clientY, t: performance.now() }]
    paint(dragOffset(e.clientY - d.y0 + d.base, box.current!.offsetHeight), false)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (!d.live) return
    const h = box.current!.offsetHeight, off = dragOffset(e.clientY - d.y0 + d.base, h)
    if (e.type !== 'pointercancel' && shouldDismiss(off, velocityOf([...d.samples, { y: e.clientY, t: performance.now() }]), h)) {
      if (guardRef.current?.()) { paint(0, true); return }
      if (history.state?.bantaySheet) history.back()
      paint(h, true)
      if (still()) { timer.current = -1; onCloseRef.current() } // reduced motion: a drag down still closes, at once
      else timer.current = window.setTimeout(() => onCloseRef.current(), 280)
    } else paint(0, true)
  }
  /** Tab stays inside the sheet: from the last control it wraps to the first, and Shift+Tab the other way. */
  const trap = (e: KeyboardEvent) => {
    const all = [...(box.current?.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]') ?? [])].filter((x) => !x.hasAttribute('disabled') && x.tabIndex >= 0 && !x.closest('[hidden]'))
    if (!all.length) return
    const first = all[0]!, last = all[all.length - 1]!
    const at = document.activeElement
    if (e.shiftKey && (at === first || !box.current?.contains(at))) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && (at === last || !box.current?.contains(at))) { e.preventDefault(); first.focus() }
  }
  return createPortal(
    <div className="lk-sheet-wrap" data-closing={closing} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="lk-sheet" ref={box} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid={testId ?? 'sheet'} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={(e) => { if (e.key === 'Escape') close(); else if (e.key === 'Tab') trap(e) }}>
        <div className="lk-grab-zone"><div className="lk-grab" /></div>
        {!hideTitle && <div className="lk-sheet-h"><h2 tabIndex={-1}>{title}</h2><button type="button" className="lk-x" aria-label={closeLabel} onClick={() => close()}><Icon name="close" size={20} /></button></div>}
        {children}
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}
