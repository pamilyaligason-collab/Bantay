import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Bottom sheet for the plan forms. Portal into .bt so it sits above the tab bar; Escape and the dim area close it; focus returns on close.
 *  Closing plays the 200ms exit (data-closing, shell.css) first. With reduced motion, or without matchMedia, it closes at once. */
export default function Sheet({ title, onClose, children, focusTitle = false }: { title: string; onClose: () => void; children: ReactNode; focusTitle?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const timer = useRef<number>(0)
  const close = () => {
    if (closing || timer.current) return
    if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { timer.current = -1; return onClose() } // -1 marks closed so a second tap is ignored
    setClosing(true)
    timer.current = window.setTimeout(onClose, 200)
  }
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    if (focusTitle) box.current?.querySelector<HTMLElement>('h2')?.focus() // an existing item: start at the title, not in a field
    else box.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, select, button')?.focus()
    return () => { window.clearTimeout(timer.current); prev?.focus?.() }
  }, [])
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
    <div className="fm-sheet-wrap" data-closing={closing} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="fm-sheet" ref={box} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => { if (e.key === 'Escape') close(); else if (e.key === 'Tab') trap(e) }}>
        <div className="fm-grab" />
        <div className="fm-sheet-h"><h2 tabIndex={-1}>{title}</h2><button type="button" className="fm-x" onClick={close}>Close</button></div>
        {children}
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}
