import { shortDate, type Activity } from '../model'
import { hm, lastNight, sleepSentence } from './sleepLogic'
import './detail.css'

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** Sleep detail hero (the one hero card on the page): last night's total, a nap when there is one, the time they went to sleep, and one plain sentence for adults. */
export function SleepHero({ acts, age, now }: { acts: Activity[]; age: number | null; now: Date }) {
  const n = lastNight(acts, now)
  if (!n) return <div className="grp sd-hero" data-testid="sleep-hero"><div className="row"><span className="grow">No sleep recorded yet<span className="sub">Sleep shows here once your watch or phone shares it with Bantay.</span></span></div></div>
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const ago = Math.round((today.getTime() - new Date(`${n.day}T12:00:00`).getTime()) / 86_400_000)
  const title = ago === 0 ? 'Last night' : `Last sleep on file · ${shortDate(`${n.day}T12:00:00`)}`
  const sentence = sleepSentence(n.minutes / 60, age)
  return (
    <div className="grp sd-hero" data-testid="sleep-hero">
      <div className="row sd-col">
        <span className="sub">{title}</span>
        <strong className="hv-big">{hm(n.minutes)}</strong>
        {n.napMinutes > 0 && <span className="sub">plus {hm(n.napMinutes)} nap</span>}
        {n.bedAt && <span className="sd-times"><span className="sub">Went to sleep</span> <strong>{clock(n.bedAt)}</strong></span>}
        {sentence && <p className="sd-line" data-testid="sleep-sentence">{sentence}</p>}
      </div>
    </div>
  )
}

/** Shown while no source shares sleep stages: the app stores the minutes asleep only. */
export function SleepStagesRow() {
  return <div className="grp sd-stages"><div className="row"><span className="grow">Deep, light and REM sleep<span className="sub">Deep, light and REM sleep show only when your watch shares them. Bantay does not guess them.</span></span></div></div>
}
