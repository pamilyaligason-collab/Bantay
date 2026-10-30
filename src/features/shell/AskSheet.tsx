import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ASK_EVENT } from '../assistant/Assistant'
import { useDialog } from '../docs/useDialog'
import { openScan, openScanWithFile } from '../scan/open'
import { Icon, type IconName } from './Icon'

const ROWS: { id: 'talk' | 'scan' | 'upload'; icon: IconName; title: string; sub: string }[] = [
  { id: 'talk', icon: 'chat', title: 'Talk to Jack Jack', sub: 'Ask a question or say what you took' },
  { id: 'scan', icon: 'camera', title: 'Scan & Capture', sub: 'Papers, or a photo of your BP monitor or glucose meter' },
  { id: 'upload', icon: 'upload', title: 'Upload a photo', sub: 'Choose a photo you already have' }
]

/** Bottom sheet behind the floating Jack button (press and hold): three big rows. Back, Escape and a tap outside close it. */
export function AskSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { ref, onKeyDown } = useDialog(onClose)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!history.state?.bantayAsk) history.pushState({ bantayAsk: 1 }, '') // StrictMode runs effects twice in dev: one entry only
    window.addEventListener('popstate', onClose)
    return () => window.removeEventListener('popstate', onClose)
  }, [onClose])

  /** Pop our history entry (one Back press afterwards, no dead entry), then run `then` once the pop has landed. */
  const leave = (then: () => void) => {
    onDone()
    if (!history.state?.bantayAsk) return then()
    window.addEventListener('popstate', then, { once: true })
    history.back()
  }
  const pick: Record<string, () => void> = {
    talk: () => leave(() => { document.querySelector<HTMLElement>('.sh-jackfab')?.focus(); window.dispatchEvent(new Event(ASK_EVENT)) }),
    scan: () => leave(openScan),
    upload: () => file.current?.click()
  }
  const chosen = (f?: File) => { if (f) leave(() => openScanWithFile(f)) }

  return createPortal(
    <div className="ask-back" onClick={onClose}>
      <div ref={ref} className="glass ask-sheet" role="dialog" aria-modal="true" aria-labelledby="ask-title" onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}>
        <h2 id="ask-title">What would you like to do?</h2>
        {ROWS.map((r, i) => (
          <button key={r.id} type="button" className="ask-row" data-autofocus={i === 0 ? '' : undefined} onClick={pick[r.id]}>
            <Icon name={r.icon} size={26} tone={({ talk: 'medicine', scan: 'labs', upload: 'vitals' } as const)[r.id]} boxed />
            <span className="grow"><b>{r.title}</b><span className="sub">{r.sub}</span></span>
            <Icon name="chev" />
          </button>
        ))}
        <a className="ask-pdf" href="#family/papers" onClick={(e) => { e.preventDefault(); leave(() => { location.hash = '#family/papers' }) }}>For PDF files use Family &gt; Papers</a>
        <button type="button" className="btn2 ask-cancel" onClick={onClose}>Cancel</button>
        <input ref={file} type="file" accept="image/*" hidden aria-label="Choose a photo" data-testid="ask-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; chosen(f) }} />
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body // out of the glass tab bar: its backdrop-filter would trap position:fixed
  )
}
