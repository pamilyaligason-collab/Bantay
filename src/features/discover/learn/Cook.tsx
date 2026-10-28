import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { JackArt } from '../../look'
import { Icon } from '../../shell/Icon'
import { recipe, stepMinutes, stepText } from './data'

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** Ask the browser to keep the screen on (Wake Lock API) for as long as this is mounted. Returns whether it is on; false where the API is missing or refused. */
function useAwake(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    let dead = false
    const get = async () => {
      try {
        const l = await navigator.wakeLock?.request('screen')
        if (!l) return
        if (dead) return void l.release().catch(() => undefined)
        lock = l
        setOn(true)
        l.addEventListener('release', () => setOn(false))
      } catch { setOn(false) } // refused (low battery, background): the page still works
    }
    void get()
    const vis = () => { if (document.visibilityState === 'visible' && (!lock || lock.released)) void get() } // the browser drops the lock when the page is hidden
    document.addEventListener('visibilitychange', vis)
    return () => { dead = true; document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => undefined) }
  }, [])
  return on
}

/** One-tap step timer: `minutes` is the step's time; counts down by the clock so a slow tab does not drift. */
function StepTimer({ minutes }: { minutes: number }) {
  const [end, setEnd] = useState<number | null>(null)
  const [left, setLeft] = useState(minutes * 60)
  useEffect(() => {
    if (end === null) return
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) { setEnd(null); try { navigator.vibrate?.(400) } catch { /* no vibrate */ } }
    }
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [end])
  const done = end === null && left === 0
  return (
    <button type="button" className="sh-pill sh-ghost sh-block lr-timer" data-testid="timer" onClick={() => { if (done) setLeft(minutes * 60); else if (end === null) setEnd(Date.now() + left * 1000); else { setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))); setEnd(null) } }}>
      <Icon name={end === null ? 'clock' : 'pause'} size={22} />
      <span>{done ? 'Time is up. Tap to reset' : end === null ? (left === minutes * 60 ? `Start ${minutes} minute timer` : `Paused at ${clock(left)}. Tap to go on`) : `${clock(left)} left. Tap to pause`}</span>
    </button>
  )
}

/** #discover/learn/cook/<id>: one big step at a time, over the whole screen so nothing is tapped by mistake. */
export default function Cook({ id }: { id: string }) {
  const r = recipe(id)
  const [i, setI] = useState(0)
  const awake = useAwake()
  const box = useRef<HTMLDivElement>(null)
  // The overlay is modal: hide the app behind it from the tab order and screen readers, put focus inside, and let Escape leave.
  useEffect(() => {
    if (!r) return // the not-found card renders inside #root: never make it inert
    const app = document.getElementById('root')
    app?.setAttribute('inert', '')
    box.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') location.hash = '#discover/learn/recipe/' + id }
    document.addEventListener('keydown', esc)
    return () => { app?.removeAttribute('inert'); document.removeEventListener('keydown', esc) }
  }, [id, r])
  if (!r) return <div className="lr"><p className="card sub">We do not have that recipe.</p><a className="sh-pill sh-ghost" href="#discover/learn/recipes">Back to recipes</a></div>
  const step = r.steps[i]
  const mins = stepMinutes(step)
  const last = i === r.steps.length - 1
  // In a portal on <body>: the tab bar and Jack button sit inside the app frame's stacking context, a fixed child of it could not cover them.
  return createPortal(
    <div ref={box} tabIndex={-1} className="lr-cook" role="dialog" aria-modal="true" aria-label={`Cook mode: ${r.name}`} data-testid="cook">
      <div className="lr-row">
        <JackArt name="cooking" size={48} decorative />
        <span className="lr-grow"><span className="eyebrow">{awake ? 'Cook mode, screen stays on' : 'Cook mode'}</span></span>
        <span className="chip" data-testid="cook-step">Step {i + 1} of {r.steps.length}</span>
      </div>
      <div className="lr-cookstep"><p>{stepText(step)}</p>{!last && <span className="sub">Next: {stepText(r.steps[i + 1]).split(/(?<=\.)\s/)[0]}</span>}</div>
      <div className="lr-prog" role="progressbar" aria-valuemin={1} aria-valuemax={r.steps.length} aria-valuenow={i + 1} aria-label="Step progress"><i style={{ width: ((i + 1) / r.steps.length) * 100 + '%' }} /></div>
      {mins !== null && <StepTimer key={i} minutes={mins} />}
      <div className="lr-grid2">
        <button type="button" className="sh-pill sh-ghost sh-block" disabled={i === 0} onClick={() => setI(i - 1)}><Icon name="back" size={22} />Back</button>
        {last
          ? <a className="sh-pill sh-primary sh-block" href={'#discover/learn/recipe/' + r.id}><Icon name="check" size={22} />Done</a>
          : <button type="button" className="sh-pill sh-primary sh-block" onClick={() => setI(i + 1)}>Next<Icon name="chev" size={22} /></button>}
      </div>
      <a className="lr-exit" href={'#discover/learn/recipe/' + r.id}>Leave cook mode</a>
    </div>,
    document.body
  )
}
