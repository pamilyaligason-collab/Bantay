import { useEffect, useMemo, useState } from 'react'
import Sheet from '../../family/Sheet'
import { logReading } from '../../log/store'
import { hdb } from '../../records/store'
import { crisisOf, type Crisis } from '../readingPreview'
import { BP_WORDS, bpPairLevel, type BpArg } from '../verdict'
import { REST_SECONDS, averagePair, bpWeek, parsePair, type BpPair } from './bpLogic'
import CrisisCard from './CrisisCard'
import './bpcheck.css'

type Step = 'one' | 'two' | 'result'
const clock = (d: Date) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** The verdict word on one line, in the colour and icon of the one BP table. */
export function BpWord({ top, bottom, doctor }: { top: number; bottom: number; doctor?: BpArg['doctor'] }) {
  const lv = bpPairLevel(top, bottom, doctor)
  if (!lv) return null // an unknown pair has no word; never read as In range
  const v = BP_WORDS[lv]
  return <span className={`bc-lvl ${v.level}`} data-level={v.level}><span aria-hidden="true">{v.icon === 'check' ? '✓' : v.icon === 'down' ? '↓' : '↑'}</span> {v.word}</span>
}

/** Guided blood pressure check (mockup health-bp, health-bpresult): type a first reading, rest one minute, type a second, then today's average with one verdict word and the 7-day average.
 *  Each reading is saved as its own pair of rows the moment it is typed (local first, synced later), so the family alert (migration 0035) never waits on this flow and a closed app loses nothing.
 *  A dangerous reading goes straight to the crisis card, symptoms first. */
export default function BpCheck({ personId, forName, doctor, onClose, onSaved }: { personId: string; forName: string; doctor?: string; onClose: () => void; onSaved?: (msg: string) => void }) {
  const [step, setStep] = useState<Step>('one')
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [pulse, setPulse] = useState('')
  const [first, setFirst] = useState<{ at: Date; p: BpPair } | null>(null)
  const [second, setSecond] = useState<BpPair | null>(null)
  const [crisis, setCrisis] = useState<Crisis | null>(null)
  const [restEnds, setRestEnds] = useState(0)
  const [left, setLeft] = useState(REST_SECONDS)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [docTargets, setDocTargets] = useState<BpArg['doctor']>()
  const [week, setWeek] = useState<ReturnType<typeof bpWeek>>(null)
  const part = useMemo(() => (new Date().getHours() < 12 ? 'Morning' : 'Evening'), [])

  useEffect(() => { // the doctor's targets for this person, so the word here matches every other screen
    let live = true
    hdb.thresholds.toArray().then((ts) => { if (live) setDocTargets({ top: ts.find((t) => t.key === `${personId}:bp_systolic`), bottom: ts.find((t) => t.key === `${personId}:bp_diastolic`) }) }).catch(() => {})
    return () => { live = false }
  }, [personId])

  useEffect(() => {
    if (step !== 'two') return
    const tick = () => setLeft(Math.max(0, Math.ceil((restEnds - Date.now()) / 1000))) // the clock, not a counter: a throttled background tab still ends on time
    tick()
    const t = window.setInterval(tick, 500)
    return () => window.clearInterval(t)
  }, [step, restEnds])

  const save = async (p: BpPair, at: Date, tracked: boolean) => {
    const takenAt = at.toISOString()
    await logReading({ personId, takenAt, test: 'bp_systolic', value: p.top, unit: 'mmHg' }, { track: tracked })
    await logReading({ personId, takenAt, test: 'bp_diastolic', value: p.bottom, unit: 'mmHg' }, { track: false })
    if (p.pulse != null) await logReading({ personId, takenAt, test: 'heart_rate', value: p.pulse, unit: 'bpm' }, { track: false })
  }

  const submit = async () => {
    const p = parsePair({ top, bottom, pulse })
    if (typeof p === 'string') return setErr(p)
    setBusy(true)
    setErr('')
    const at = new Date()
    try {
      await save(p, at, step === 'one')
    } catch { setErr('Could not save on this phone. Try again.'); setBusy(false); return }
    setBusy(false)
    setTop(''); setBottom(''); setPulse('')
    const c = crisisOf('bp', { top: p.top, bottom: p.bottom })
    if (step === 'one') {
      setFirst({ at, p })
      if (c) return setCrisis(c)
      setRestEnds(Date.now() + REST_SECONDS * 1000)
      setLeft(REST_SECONDS)
      return setStep('two')
    }
    setSecond(p)
    if (c) return setCrisis(c)
    const all = await hdb.readings.where('personId').equals(personId).toArray().catch(() => [])
    setWeek(bpWeek(all, new Date()))
    onSaved?.('Blood pressure saved.')
    setStep('result')
  }

  if (crisis) return <Sheet title="Blood pressure" onClose={onClose}><CrisisCard kind={crisis} doctor={doctor} onClose={onClose} /></Sheet>

  const avg = first && second ? averagePair(first.p, second) : null
  const wk = week
  return (
    <Sheet title="Blood pressure" onClose={onClose}>
      <div className="bc" data-testid="bp-check" data-step={step}>
        <p className="sub bc-eye">{part} check · {step === 'one' ? 'step 1 of 3' : step === 'two' ? 'step 2 of 3' : 'done'} · {forName}</p>
        <div className="bc-steps-bar" aria-hidden="true"><i className="on" /><i className={step !== 'one' ? 'on' : ''} /><i className={step === 'result' ? 'on' : ''} /></div>

        {step === 'two' && first && (
          <>
            <div className="bc-card">
              <b>{left > 0 ? 'Second reading in' : 'Now the second reading'}</b>
              {left > 0 && <div className="bc-ring" role="timer" aria-label={`${left} seconds of rest left`}><b>{mmss(left)}</b><span className="sub">rest, arm on the table</span></div>}
              <ul className="sub bc-tips"><li>Sit back, feet flat, do not talk</li><li>Same arm as the first reading</li></ul>
            </div>
            <div className="bc-card">
              <div className="bc-between"><b>First reading · {clock(first.at)}</b><span className="bc-chip">Typed</span></div>
              <div className="bc-reading"><div><small>Top</small><b>{first.p.top}</b></div><div><small>Bottom</small><b>{first.p.bottom}</b></div><div><small>Pulse</small><b>{first.p.pulse ?? '--'}</b></div></div>
            </div>
          </>
        )}

        {(step === 'one' || (step === 'two' && left === 0)) && (
          <div className="fm-form md-form">
            <div className="ar-three">
              <div><label htmlFor="bc-top">Top</label><input id="bc-top" inputMode="numeric" autoComplete="off" value={top} onChange={(e) => setTop(e.target.value)} /><small>mmHg</small></div>
              <div><label htmlFor="bc-bot">Bottom</label><input id="bc-bot" inputMode="numeric" autoComplete="off" value={bottom} onChange={(e) => setBottom(e.target.value)} /><small>mmHg</small></div>
              <div><label htmlFor="bc-pul">Pulse</label><input id="bc-pul" inputMode="numeric" autoComplete="off" value={pulse} onChange={(e) => setPulse(e.target.value)} /><small>bpm, optional</small></div>
            </div>
            <p className="sub">Example: 120 on top, 80 on the bottom. Sit quietly for 5 minutes first.</p>
            {err && <p className="md-err" role="alert">{err}</p>}
            <div className="bc-row">
              <a className="pill ghost" href="#scan" onClick={onClose}>Photo of monitor</a>
              <button type="button" className="pill primary" disabled={busy} onClick={() => void submit()}>{step === 'one' ? 'Next' : 'Save'}</button>
            </div>
            <p className="sub">Photo readings are always shown to you to check before saving.</p>
          </div>
        )}

        {step === 'result' && avg && (
          <>
            <div className="bc-card">
              <p className="sub bc-eye">Today, average of 2 readings</p>
              <div className="bc-big"><span className="num" data-testid="bp-avg">{avg.top}/{avg.bottom}</span><span className="sub">mmHg{avg.pulse != null ? ` · pulse ${avg.pulse}` : ''}</span></div>
              <div className="bc-between"><BpWord top={avg.top} bottom={avg.bottom} doctor={docTargets} /><span className="sub">Home target under 130/80</span></div>
            </div>
            {wk && (
              <div className="bc-card">
                <div className="bc-between"><b>7-day average</b><span className="sub">{wk.days} of 7 days</span></div>
                <Trend points={wk.points} />
                <div className="bc-between"><b className="num bc-wk" data-testid="bp-week">{wk.top}/{wk.bottom}</b><BpWord top={wk.top} bottom={wk.bottom} doctor={docTargets} /></div>
                <span className="sub">This is the number your doctor wants</span>
              </div>
            )}
            <a className="bc-card bc-link" href="#health/summary" onClick={onClose}><b>Share with {doctor?.trim() || 'your doctor'}</b><span className="sub">A one-page summary, made on this phone</span></a>
            <button type="button" className="pill primary bc-done" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** The top number by day, with the 130 home line. Whole-number axis from the data, never below 100 or above 200. */
function Trend({ points }: { points: { day: string; top: number }[] }) {
  const lo = Math.min(100, ...points.map((p) => p.top - 5))
  const hi = Math.max(140, ...points.map((p) => p.top + 5))
  const y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * 60
  const x = (i: number) => (points.length === 1 ? 160 : 20 + (i * 280) / (points.length - 1))
  const label = `Top number by day, ${points.map((p) => p.top).join(', ')}`
  return (
    <svg viewBox="0 0 320 90" className="bc-trend" role="img" aria-label={label}>
      <line x1="0" x2="320" y1={y(130)} y2={y(130)} stroke="var(--line)" strokeDasharray="4 4" />
      <text x="316" y={y(130) - 5} textAnchor="end" fontSize="13" fill="var(--muted)">130</text>
      {points.length > 1 && <polyline fill="none" stroke="var(--green2)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points.map((p, i) => `${x(i)},${y(p.top)}`).join(' ')} />}
      {points.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p.top)} r={i === points.length - 1 ? 5 : 3} fill="var(--green2)" />)}
      <g fontSize="13" fill="var(--muted)" textAnchor="middle">{points.map((p, i) => <text key={p.day} x={x(i)} y="86">{new Date(`${p.day}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'short' })}</text>)}</g>
    </svg>
  )
}
