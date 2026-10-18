import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Wizard from './Wizard'
import { TITLES, currentPlatform, probe, remaining, type StepId } from './steps'
import './setup.css'

/** Today card: what is left from setup. Same list as the wizard (steps.remaining), each item opens its own step. */
export default function ChecklistCard() {
  const [left, setLeft] = useState<StepId[]>([])
  const [open, setOpen] = useState<StepId | null>(null)
  const refresh = useCallback(() => { void probe().then((p) => setLeft(remaining(p, currentPlatform()))).catch(() => undefined) }, [])
  useEffect(() => {
    refresh()
    const on = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [refresh])
  const close = useCallback(() => { setOpen(null); refresh() }, [refresh])
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
      {open && createPortal(<div className="wz-ov"><Wizard start={open} onDone={close} /></div>, document.body)}
    </>
  )
}
