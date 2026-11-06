import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { hdb } from '../records/store'
import type { Range, Reading } from '../health/ranges'
import { PreviewTile, Section } from '../look'
import { useActingPersonId } from '../viewas/viewAs'
import { numberTiles } from './numbers'

const NONE: Reading[] = []
const NO_RANGES: (Range & { key: string })[] = []

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
  return (
    <Section title="Your numbers" link={{ href: '#health', label: 'Health' }} testId="numbers">
      <div className="pt-grid" role="group" aria-label="Your numbers">{tiles.map((t) => <PreviewTile key={t.kicker} {...t} />)}</div>
    </Section>
  )
}
