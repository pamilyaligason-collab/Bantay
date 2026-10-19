import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Bottom sheet for the plan forms. Portal into .bt so it sits above the tab bar; Escape and the dim area close it; focus returns on close. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('input:not([type=checkbox]), textarea, select, button')?.focus()
    return () => prev?.focus?.()
  }, [])
  return createPortal(
    <div className="fm-sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fm-sheet" ref={box} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="fm-grab" />
        <div className="fm-sheet-h"><h2>{title}</h2><button type="button" className="fm-x" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}
