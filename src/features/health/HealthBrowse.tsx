import { useState } from 'react'
import { Section } from '../look'
import { Ring } from '../look/Ring'
import { weekProgress } from '../exercise/weekly'
import { labsLine, useTodayDoses } from './GlanceGrid'
import { groupLabs, labRow } from './labsLogic'
import type { Activity } from './model'
import { clock, useQuestionCount } from './PinnedTiles'
import { latestByTest, type Range, type Reading } from './ranges'
import { useActivity } from './useActivity'
import { useVisits } from './useVisits'
import { isVital } from './vitals'
import { nextVisitLine } from './visitsLogic'
import type { DoseState } from './meds'
import './health.css'

/** "12 min this week" from the last 7 days of walks and moves, or "No walks yet". */
export function moveLine(acts: Activity[]): string {
  const m = weekProgress(acts).minutes
  return m > 0 ? `${m} min this week` : 'No walks yet'
}

type Thresholds = (Range & { key: string })[]
/** Counts behind the Labs bars: results to ask about, in range, and with no printed range. Null when there are no papers (no bars, never three empty ones). */
export function labCounts(readings: Reading[], thresholds: Thresholds): { ask: number; usual: number; noRange: number } | null {
  const labs = readings.filter((r) => !isVital(r.test) && Number.isFinite(Date.parse(r.takenAt)))
  if (!labs.length) return null
  const g = groupLabs(latestByTest(labs).map((r) => labRow(r, thresholds.find((t) => t.key === `${r.personId}:${r.test}`))))
  return { ask: g.ask.length, usual: g.usual.length, noRange: g.noRange.length }
}

/** At most three pills for today's doses: Taken, Skipped, or the time still to come. */
export function dosePills(doses: DoseState[]): { text: string; done: boolean }[] {
  return doses.slice(0, 3).map((d) => (d.state === 'taken' ? { text: 'Taken', done: true } : d.state === 'skipped' ? { text: 'Skipped', done: false } : { text: clock(d.at), done: false }))
}

/** Browse photos (public/img/browse, credits in CREDITS.md): Wikimedia Commons, resized, stored in the app (precached by the web service worker, bundled in the native app) so they work offline. */
const DEED: Record<string, string> = { 'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/', 'CC BY 2.5': 'https://creativecommons.org/licenses/by/2.5/' }
const PHOTOS: Record<string, { file: string; credit: string; licence: string; href: string }> = {
  labs: { file: 'labs', credit: 'Frankincense Diala', licence: 'CC0', href: 'https://commons.wikimedia.org/wiki/File:Laboratory_Test_Tubes;_from_a_medical_laboratory_in_Abuja,_Nigeria.jpg' },
  meds: { file: 'meds', credit: 'Stevepb', licence: 'CC0', href: 'https://commons.wikimedia.org/wiki/File:Pill_Organizer_With_Vitamins_And_Medicines.jpg' },
  visits: { file: 'clinic', credit: 'Con.archi', licence: 'CC BY-SA 4.0', href: 'https://commons.wikimedia.org/wiki/File:Corridor_and_entrance_to_Psychology_clinic_and_Consulting_rooms.jpg' },
  move: { file: 'walk', credit: 'John Phelan', licence: 'CC BY 4.0', href: 'https://commons.wikimedia.org/wiki/File:Etowah_River_Park_walking_path,_Canton_GA.jpg' },
  body: { file: 'body', credit: 'Patrick J. Lynch', licence: 'CC BY 2.5', href: 'https://commons.wikimedia.org/wiki/File:Heart_anterior_exterior_view.jpg' }
}

/** The card's picture under a dark bottom gradient; slow zoom (off under reduced motion, in CSS). It reports a failed load so the card keeps a plain tint and dark text. */
function Photo({ file, onBad }: { file: string; onBad: () => void }) {
  return (
    <>
      <img className="hb-img" src={`/img/browse/${file}.webp`} alt="" width={640} height={400} loading="lazy" decoding="async" onError={onBad} />
      <span className="hb-shade" aria-hidden="true" />
    </>
  )
}

function Bars({ c }: { c: { ask: number; usual: number; noRange: number } }) {
  const max = Math.max(1, c.ask, c.usual, c.noRange)
  return (
    <svg className="hb-bars" width="100%" height="48" viewBox="0 0 84 48" preserveAspectRatio="xMinYMax meet" aria-hidden="true" focusable="false">
      {[c.ask, c.usual, c.noRange].map((n, i) => { const h = n ? Math.max(8, Math.round((n / max) * 44)) : 4; return <rect key={i} data-hot={i === 0 && n > 0 ? '' : undefined} x={i * 28} y={48 - h} width="22" height={h} rx="4" /> })}
    </svg>
  )
}

/** Browse: five animated cards in two columns (Labs, Medicines, Visits, Move and food, Body wiki wide), each with a small preview of its live value. Papers live in Family (D-100). Readings has its own card above. */
export function HealthBrowse({ personId, readings, thresholds }: { personId: string; readings: Reading[]; thresholds: Thresholds }) {
  const today = useTodayDoses(personId)
  const visit = nextVisitLine(useVisits(personId))
  const asks = useQuestionCount(personId)
  const acts = useActivity(personId)
  const counts = labCounts(readings, thresholds)
  const pending = today?.doses.filter((d) => d.state === 'pending').length ?? 0
  const medSub = !today ? undefined : !today.doses.length ? (today.hasMeds ? 'Nothing due today' : 'No medicines yet') : `${pending} of ${today.doses.length} left today`
  const pills = today ? dosePills(today.doses) : []
  const wk = weekProgress(acts)
  const [bad, setBad] = useState<Record<string, boolean>>({})
  const card = (key: string, i: number, tint: string, title: string, sub: string | undefined, href: string, preview: React.ReactNode, wide = false) => (
    <a key={key} className="card hb press" href={href} data-tint={tint} data-wide={wide ? '' : undefined} data-photo={bad[key] ? 'off' : 'on'} data-testid={`browse-${key}`} style={{ '--i': i } as React.CSSProperties}>
      {!bad[key] && <Photo file={PHOTOS[key]!.file} onBad={() => setBad((b) => ({ ...b, [key]: true }))} />}
      {preview && <span className="hb-pv">{preview}</span>}
      <span className="hb-t"><b>{title}</b>{sub && <span className="hb-s">{sub}</span>}</span>
    </a>
  )
  return (
    <Section title="Browse" testId="browse">
      <div className="hb-grid">
        {card('labs', 0, 'red', 'Labs', labsLine(readings, thresholds), '#health/labs', counts ? <Bars c={counts} /> : <span className="hb-none">--</span>)}
        {card('meds', 1, 'green', 'Medicines', medSub, '#health/meds', pills.length ? <span className="hb-pills">{pills.map((p, i) => <span key={i} className="hb-pill" data-done={p.done ? '' : undefined}>{p.text}</span>)}</span> : <span className="hb-none">--</span>)}
        {card('visits', 2, 'blue', 'Visits', (visit?.sub && visit.sub !== 'No visit booked yet' ? visit.sub : undefined) ?? (asks ? `${asks} ${asks === 1 ? 'question' : 'questions'} ready to ask` : visit ? undefined : 'Tap to add one'), '#health/visits', <span className="hb-date" data-empty={visit ? undefined : ''}>{visit ? visit.text.replace(/^(Next visit|Follow-up due): /, '') : 'Not booked'}</span>)}
        {card('move', 3, 'amber', 'Move and food', moveLine(acts), '#health/move', <Ring value={wk.pct / 100} size={40} hue="amber" stroke={5} />)}
        {card('body', 4, 'purple', 'Body wiki', 'How each part works', '#health/body', null, true)}
      </div>
      <p className="hb-credits" data-testid="browse-credits">
        <span>Photos:</span>
        {Object.values(PHOTOS).map((p) => <span key={p.file}><a href={p.href} target="_blank" rel="noopener noreferrer">{p.credit}<span className="hb-sr"> on Wikimedia Commons (opens outside)</span></a>, <a href={DEED[p.licence]} target="_blank" rel="noopener noreferrer">{p.licence}</a>, cropped</span>)}
      </p>
    </Section>
  )
}
