import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Wizard from './Wizard'
import { TITLES, currentPlatform, onResume, probe, remaining, type StepId } from './steps'
import './setup.css'

/** Today card: what is left from setup. Same list as the wizard (steps.remaining), each item opens its own step. */
export default function ChecklistCard() {
  const [left, setLeft] = useState<StepId[]>([])
  const [open, setOpen] = useState<StepId | null>(null)
  const refresh = useCallback(() => { void probe().then((p) => setLeft(remaining(p, currentPlatform()))).catch(() => undefined) }, [])
  useEffect(() => {
    refresh()
    return onResume(refresh)
  }, [refresh])
  const close = useCallback(() => { setOpen(null); refresh() }, [refresh])
  const ov = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    ov.current?.focus()
    return () => { root?.removeAttribute('inert'); prev?.focus?.() }
  }, [open])
  return (
    <>
      {left.length > 0 && (
        <section className="grp wz-card" aria-labelledby="wz-ck">
          <h2 id="wz-ck" className="hd" style={{ margin: 0 }}>{left.length} {left.length === 1 ? 'thing' : 'things'} left to set up</h2>
          <ul>
            {left.map((s) => <li key={s}><button type="button" onClick={() => setOpen(s)}>{TITLES[s]}</button></li>)}
          </ul>
        </section>
      )}
      {open && createPortal(<div className="wz-ov" ref={ov} role="dialog" aria-modal="true" aria-label="Finish setting up" tabIndex={-1} onKeyDown={(e) => e.key === 'Escape' && close()}><Wizard start={open} onDone={close} /></div>, document.body)}
    </>
  )
}
