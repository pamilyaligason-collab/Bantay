import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import '../shell/shell.css'
import './settings.css'

/** Pick one of a few options (theme, text size, language) in a bottom sheet of radio rows. One history entry: Back closes the sheet (C-4). */
export default function ChoiceSheet<T extends string>({ title, value, options, onPick, onClose, note }: { title: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void; onClose: () => void; note?: string }) {
  useEffect(() => {
    if (!history.state?.bantayChoice) history.pushState({ bantayChoice: 1 }, '') // StrictMode runs effects twice in dev: one entry only
    window.addEventListener('popstate', onClose)
    return () => window.removeEventListener('popstate', onClose)
  }, [onClose])
  const close = () => (history.state?.bantayChoice ? history.back() : onClose())
  const pick = (v: T) => { onPick(v); close() }
  return createPortal(
    <div className="sh sh-sheet-wrap" onClick={close}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        <h2 className="sh-h2">{title}</h2>
        <div role="radiogroup" aria-label={title} className="st-radios">
          {options.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className="st-rad" onClick={() => pick(o.id)}><i aria-hidden="true" />{o.label}</button>
          ))}
        </div>
        {note && <p className="sh-sub">{note}</p>}
        <button type="button" className="sh-pill sh-ghost sh-block" onClick={close}>Cancel</button>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}
