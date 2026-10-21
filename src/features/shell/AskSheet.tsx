import { useEffect, useRef } from 'react'
import { ASK_EVENT } from '../assistant/Assistant'
import { useDialog } from '../docs/useDialog'
import { openScan, openScanWithFile } from '../scan/open'
import { Icon, type IconName } from './Icon'

const ROWS: { id: 'talk' | 'scan' | 'upload'; icon: IconName; title: string; sub: string }[] = [
  { id: 'talk', icon: 'chat', title: 'Talk to Jack Jack', sub: 'Ask a question or say what you took' },
  { id: 'scan', icon: 'camera', title: 'Scan a paper', sub: 'Take a photo of a lab or prescription' },
  { id: 'upload', icon: 'upload', title: 'Upload a file', sub: 'Choose a photo you already have' }
]

/** Bottom sheet behind the centre Ask tab: three big rows. Back, Escape and a tap outside close it. */
export function AskSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { ref, onKeyDown } = useDialog(onClose)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    history.pushState({ bantayAsk: 1 }, '')
    window.addEventListener('popstate', onClose)
    return () => window.removeEventListener('popstate', onClose)
  }, [onClose])

  const leave = () => { if (history.state?.bantayAsk) history.replaceState(null, ''); onDone() }
  const pick: Record<string, () => void> = {
    talk: () => { leave(); document.querySelector<HTMLElement>('.sh-ask')?.focus(); window.dispatchEvent(new Event(ASK_EVENT)) },
    scan: () => { leave(); openScan() },
    upload: () => file.current?.click()
  }
  const chosen = (f?: File) => { if (!f) return; leave(); openScanWithFile(f) }

  return (
    <div className="ask-back" onClick={onClose}>
      <div ref={ref} className="glass ask-sheet" role="dialog" aria-modal="true" aria-labelledby="ask-title" onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}>
        <h2 id="ask-title">What would you like to do?</h2>
        {ROWS.map((r, i) => (
          <button key={r.id} type="button" className="ask-row" data-autofocus={i === 0 ? '' : undefined} onClick={pick[r.id]}>
            <span className="ask-ic"><Icon name={r.icon} size={26} /></span>
            <span className="grow"><b>{r.title}</b><span className="sub">{r.sub}</span></span>
            <Icon name="chev" />
          </button>
        ))}
        <button type="button" className="btn2 ask-cancel" onClick={onClose}>Cancel</button>
        <input ref={file} type="file" accept="image/*" hidden aria-label="Choose a file" data-testid="ask-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; chosen(f) }} />
      </div>
    </div>
  )
}
