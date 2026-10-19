import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Wizard from '../setup/Wizard'
import { ORDER, TITLES, currentPlatform, onResume, probe, remaining, type Probe, type StepId } from '../setup/steps'
import '../setup/setup.css'

/** Quiet setup card for Today: how many things are left, the one next step, and See all. Same list and same wizard as
 *  features/setup/ChecklistCard (steps.remaining); only the presentation is different. Hidden once everything is done. */
export default function SetupCard() {
  const [left, setLeft] = useState<StepId[]>([])
  const [total, setTotal] = useState(0)
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<StepId | null>(null)
  const refresh = useCallback(() => {
    void probe().then((p) => {
      const platform = currentPlatform()
      setLeft(remaining(p, platform))
      setTotal(remaining(Object.fromEntries(ORDER.map((s) => [s, false])) as Probe, platform).length)
    }).catch(() => undefined)
  }, [])
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

  const n = left.length
  const next = left[0]
  return (
    <>
      {n > 0 && next && (
        <section className="card td-setup" role="region" aria-label={`${n} ${n === 1 ? 'thing' : 'things'} left to set up`}>
          <div className="td-row between">
            <b>{n} {n === 1 ? 'thing' : 'things'} left</b>
            <button type="button" className="td-link" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Hide' : 'See all'}</button>
          </div>
          <div className="td-bar" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.max(0, total - n)}>
            <i style={{ transform: `scaleX(${total > 0 ? Math.max(0, total - n) / total : 0})` }} />
          </div>
          {all ? (
            <ul>{left.map((s) => <li key={s}><button type="button" onClick={() => setOpen(s)}>{TITLES[s]}</button></li>)}</ul>
          ) : (
            <button type="button" className="td-next" onClick={() => setOpen(next)}>Next: {TITLES[next]}</button>
          )}
        </section>
      )}
      {open && createPortal(<div className="wz-ov" ref={ov} role="dialog" aria-modal="true" aria-label="Finish setting up" tabIndex={-1} onKeyDown={(e) => e.key === 'Escape' && close()}><Wizard start={open} onDone={close} /></div>, document.body)}
    </>
  )
}
