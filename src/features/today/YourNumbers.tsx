import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { hdb } from '../records/store'
import type { Range, Reading } from '../health/ranges'
import { PreviewTile, Section } from '../look'
import { useActingPersonId } from '../viewas/viewAs'
import { useActivity } from '../health/useActivity'
import { numberTiles, pickExtraTile } from './numbers'

const NONE: Reading[] = []
const NO_RANGES: (Range & { key: string })[] = []

/** Tiny trend line under the label; the value is the visible text (ML-40). */
function Spark({ points }: { points: number[] }) {
  const lo = Math.min(...points), span = Math.max(...points) - lo || 1
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${(i / (points.length - 1)) * 60},${16 - ((v - lo) / span) * 14}`).join('')
  return <svg className="pt-spark" viewBox="0 0 60 18" width="60" height="18" aria-hidden="true" focusable="false"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/** Board "Your numbers": every card at once in a 2-column grid (no swipe row; one column at 195 px). The latest real readings and labs of the person on screen. */
export default function YourNumbers() {
  const personId = useActingPersonId() ?? ''
  const [readings, setReadings] = useState(NONE)
  useEffect(() => {
    if (!personId) return setReadings(NONE)
    const sub = liveQuery(() => hdb.readings.where('personId').equals(personId).toArray()).subscribe({ next: setReadings, error: () => setReadings(NONE) })
    return () => sub.unsubscribe()
  }, [personId])
  const [ranges, setRanges] = useState(NO_RANGES)
  useEffect(() => {
    const sub = liveQuery(() => hdb.thresholds.toArray()).subscribe({ next: setRanges, error: () => setRanges(NO_RANGES) })
    return () => sub.unsubscribe()
  }, [])
  // the doctor's own limits, so Today agrees with the Health hero
  const tiles = useMemo(() => numberTiles(readings, new Date(), (r) => ranges.find((t) => t.key === `${r.personId}:${r.test}`)), [readings, ranges])
  const acts = useActivity(personId)
  const extra = useMemo(() => pickExtraTile(readings, acts, new Date()), [readings, acts])
  return (
    <Section title="Your numbers" link={{ href: '#health', label: 'Health' }} testId="numbers">
      <div className="pt-grid" role="group" aria-label="Your numbers">{[...tiles, ...(extra ? [extra] : [])].map(({ points, ...t }) => <PreviewTile key={t.kicker} {...t} media={points && points.length > 1 ? <Spark points={points} /> : undefined} />)}</div>
    </Section>
  )
}
