import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { hdb } from '../records/store'
import type { Reading } from '../health/ranges'
import { Carousel, PreviewTile, Section } from '../look'
import { useActingPersonId } from '../viewas/viewAs'
import { numberTiles } from './numbers'

const NONE: Reading[] = []

/** Board "Your numbers": the latest real readings and labs of the person on screen. */
export default function YourNumbers() {
  const personId = useActingPersonId() ?? ''
  const [readings, setReadings] = useState(NONE)
  useEffect(() => {
    if (!personId) return setReadings(NONE)
    const sub = liveQuery(() => hdb.readings.where('personId').equals(personId).toArray()).subscribe({ next: setReadings, error: () => setReadings(NONE) })
    return () => sub.unsubscribe()
  }, [personId])
  const tiles = useMemo(() => numberTiles(readings, new Date()), [readings])
  return (
    <Section title="Your numbers" link={{ href: '#health', label: 'Health' }} testId="numbers">
      <Carousel label="Your numbers">{tiles.map((t) => <div key={t.kicker} className="td-num"><PreviewTile {...t} /></div>)}</Carousel>
    </Section>
  )
}
