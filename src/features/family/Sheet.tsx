import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Bottom sheet for the plan forms. Portal into .bt so it sits above the tab bar; Escape and the dim area close it; focus returns on close.
 *  Closing plays the 200ms exit (data-closing, shell.css) first. With reduced motion, or without matchMedia, it closes at once. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
    box.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, select, button')?.focus()
    return () => { window.clearTimeout(timer.current); prev?.focus?.() }
  }, [])
  return createPortal(
    <div className="fm-sheet-wrap" data-closing={closing} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="fm-sheet" ref={box} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <div className="fm-grab" />
        <div className="fm-sheet-h"><h2>{title}</h2><button type="button" className="fm-x" onClick={close}>Close</button></div>
        {children}
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}
