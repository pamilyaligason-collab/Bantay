import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import type { Reading } from '../health/ranges'
import { ldb } from '../log/store'
import { EmptyState, LargeTitle, Segmented } from '../look'
import { hdb } from '../records/store'
import { useVisiblePeople } from './useFocuses'
import { buildFeed, feedFilter, type FeedFilter } from './feedLogic'
import FmAvatar from './FmAvatar'
import { faceName } from './FacesRow'
import { listPhotos, type Photo } from './memoriesApi'
import { listMessages, type Msg } from './messagesApi'
import { useFamilyPeople } from './roster'
import './v13-family.css'

const EMPTY: Record<FeedFilter, { t: string; b: string }> = {
  all: { t: 'Nothing shared yet', b: 'Check-ins, shared readings, photos and messages show here.' },
  health: { t: 'No readings shared yet', b: 'A blood pressure reading shows here once someone saves one.' },
  photos: { t: 'No photos yet', b: 'Family photos show here.' },
  checkins: { t: 'No check-ins yet', b: 'An I\'m OK from anyone shows here.' }
}
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) }

/** Family feed (board FamilyFeed), UI shell behind the `bantay.flag.feed` flag: read-only posts built from check-ins, shared BP readings, photos and chat text. Posting, hearts and replies come with lane P. */
export default function FamilyFeed() {
  const { selfId } = useFamilyPeople()
  const people = useVisiblePeople()
  const [f, setF] = useState<FeedFilter>('all')
  const [d, setD] = useState<{ checkins: { personId: string; kind: string; startedAt: string }[]; readings: Reading[]; thresholds: { key: string; high?: number | null }[] } | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const key = people.map((p) => p.id).join(',')
  useEffect(() => {
    const ids = key ? key.split(',') : []
    const sub = liveQuery(async () => ({
      checkins: (await ldb.activity.where('personId').anyOf(ids).toArray()).filter((a) => a.kind === 'check-in'),
      readings: (await hdb.readings.where('personId').anyOf(ids).toArray()).filter((r) => r.test === 'bp_systolic' || r.test === 'bp_diastolic'),
      thresholds: await hdb.thresholds.toArray()
    })).subscribe({ next: setD, error: () => setD({ checkins: [], readings: [], thresholds: [] }) })
    let live = true
    void listPhotos(12).then((r) => { if (live && r.ok) setPhotos(r.data) })
    void listMessages(20).then((r) => { if (live && r.ok) setMsgs(r.data) })
    return () => { live = false; sub.unsubscribe() }
  }, [key])
  const items = useMemo(() => feedFilter(buildFeed({ checkins: d?.checkins ?? [], readings: d?.readings ?? [], photos, msgs, selfId, now: new Date(), thresholds: d?.thresholds ?? [] }), f), [d, photos, msgs, selfId, f])
  return (
    <>
      <LargeTitle back={{ href: '#family', label: 'Family' }} title="Family feed" />
      <Segmented label="Show" value={f} onChange={setF} options={[{ id: 'all', label: 'All' }, { id: 'health', label: 'Health' }, { id: 'photos', label: 'Photos' }, { id: 'checkins', label: 'Check-ins' }]} />
      {!d ? <p className="sub" aria-busy="true">Loading…</p> : items.length === 0 ? <EmptyState icon="msg" title={EMPTY[f].t} body={EMPTY[f].b} /> : (
        <ul className="fp-list" aria-label="Family feed">
          {items.map((it) => {
            const p = people.find((x) => x.id === it.personId)
            const who = it.mine ? 'You' : p ? faceName(p.name) : 'Family'
            return (
              <li key={it.id} className="card fp" data-kind={it.kind}>
                <div className="fp-h">
                  <FmAvatar name={p?.name ?? who} photoPath={p?.photoPath} thumb={p?.thumb} size={40} />
                  <div className="fp-who"><b>{who}</b><span className="sub">{when(it.at)}</span></div>
                </div>
                <p className="fp-t">{it.title}</p>
                {it.body && <p className="fp-b">{it.body}{it.chip && <span className="fp-chip" data-tint={it.chip.tint}>{it.chip.word}</span>}</p>}
                {it.url && <img className="fp-img" src={it.url} alt={it.title} loading="lazy" />}
              </li>
            )
          })}
        </ul>
      )}
      <p className="sub pc-foot">Posting comes next.</p>
    </>
  )
}
