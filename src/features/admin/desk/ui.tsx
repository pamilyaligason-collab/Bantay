import { useRef, useState, type ReactNode } from 'react'
import { useDialog } from '../../docs/useDialog'

// Shared dashboard pieces. Pages build on these so every page looks and behaves the same.

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="dk-head">
      <div className="dk-grow"><h1>{title}</h1>{sub && <p className="dk-sub">{sub}</p>}</div>
      {children && <div className="dk-acts">{children}</div>}
    </header>
  )
}

/** Filter bar above a table: put chips, selects and a search input inside. */
export const Filters = ({ children }: { children: ReactNode }) => <div className="dk-filters" role="search">{children}</div>

export type Tone = 'ok' | 'warn' | 'bad' | 'plain'
export const Tag = ({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) => <span className={`dk-tag ${tone}`}>{children}</span>
export const statusTone = (s: string | null | undefined): Tone => (s === 'confirmed' ? 'ok' : s === 'draft' ? 'warn' : s === 'rejected' ? 'bad' : 'plain')

/** Right-hand detail panel (desktop), side sheet (tablet), full screen (phone). */
export function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { ref, onKeyDown } = useDialog(onClose)
  return (
    <aside className="dk-panel" ref={ref} onKeyDown={onKeyDown} role="dialog" aria-label={title}>
      <div className="dk-panel-head"><h2 className="h2 dk-grow">{title}</h2><button className="dk-b" onClick={onClose}>Close</button></div>
      <div className="dk-panel-body">{children}</div>
    </aside>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="dk-empty">{children}</p>

/** Confirm step for every destructive or bulk action. Returns the dialog node and `ask(text, run)`. */
export function useConfirm() {
  const [pending, setPending] = useState<{ text: string; run: () => Promise<void> } | null>(null)
  const [busy, setBusy] = useState(false)
  const close = () => { if (!busy) setPending(null) }
  const go = async () => { if (!pending) return; setBusy(true); try { await pending.run() } finally { setBusy(false); setPending(null) } }
  const node = pending && <ConfirmBox text={pending.text} busy={busy} onCancel={close} onGo={go} />
  return { node, ask: (text: string, run: () => Promise<void>) => setPending({ text, run }) }
}

function ConfirmBox({ text, busy, onCancel, onGo }: { text: string; busy: boolean; onCancel: () => void; onGo: () => void }) {
  const { ref, onKeyDown } = useDialog(onCancel)
  return (
    <div className="dk-scrim">
      <div className="dk-confirm" role="alertdialog" aria-modal="true" aria-describedby="dk-confirm-text" ref={ref} onKeyDown={onKeyDown}>
        <p id="dk-confirm-text">{text}</p>
        <div className="dk-acts"><button className="dk-b" onClick={onCancel} disabled={busy} data-autofocus>Cancel</button><button className="dk-b go" onClick={onGo} disabled={busy}>Confirm</button></div>
      </div>
    </div>
  )
}

/** Status line with an optional Undo, e.g. after confirm/reject. Undo restores the previous status. */
export function useToast() {
  const [t, setT] = useState<{ text: string; undo?: () => void } | null>(null)
  const timer = useRef<number>(undefined)
  const show = (text: string, undo?: () => void) => { window.clearTimeout(timer.current); setT({ text, undo }); timer.current = window.setTimeout(() => setT(null), 8000) }
  const node = (
    <div className="dk-toast" role="status" aria-live="polite">
      {t && <>{t.text}{t.undo && <button className="dk-b" onClick={() => { t.undo?.(); setT(null) }}>Undo</button>}</>}
    </div>
  )
  return { node, show }
}
