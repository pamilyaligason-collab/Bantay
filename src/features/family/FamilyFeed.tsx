import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import type { Reading } from '../health/ranges'
import { ldb } from '../log/store'
import { EmptyState, LargeTitle, Segmented } from '../look'
import { hdb } from '../records/store'
import { useActing } from '../viewas/viewAs'
import { buildFeed, feedFilter, feedFromRows, mergeFeed, type FeedFilter } from './feedLogic'
import { signFeedPhotos, useFeed, useFeedShares } from './feedApi'
import FmAvatar from './FmAvatar'
import { faceName } from './FacesRow'
import { useFamilyPeople } from './roster'
import './v13-family.css'

const EMPTY: Record<FeedFilter, { t: string; b: string }> = {
  all: { t: 'Nothing shared yet', b: 'Blood pressure, lab results, photos and check-ins that people choose to share show here.' },
  health: { t: 'No health updates yet', b: 'A shared blood pressure reading or lab result shows here.' },
  photos: { t: 'No photos yet', b: 'Family photos show here.' },
  checkins: { t: 'No check-ins yet', b: 'An I\'m OK from anyone shows here.' }
}
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) }

/** Family feed (board FamilyFeed), behind the `bantay.flag.feed` flag. Reads only the `feed` table (what each person switched on, D-134); your own check-ins and BP pairs also show at once from this phone when your switch is on. Replies, hearts, voice and free text come later. */
export default function FamilyFeed() {
  const { people, selfId } = useFamilyPeople()
  const { acting } = useActing()
  const rows = useFeed()
  const mine = useFeedShares(acting ? null : selfId).on
  const [f, setF] = useState<FeedFilter>('all')
  const [d, setD] = useState<{ checkins: { personId: string; kind: string; startedAt: string }[]; readings: Reading[]; thresholds: { key: string; high?: number | null }[] } | null>(null)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const own = acting ? null : selfId
    const sub = liveQuery(async () => ({
      checkins: own ? (await ldb.activity.where('personId').equals(own).toArray()).filter((a) => a.kind === 'check-in') : [],
      readings: own ? (await hdb.readings.where('personId').equals(own).toArray()).filter((r) => r.test === 'bp_systolic' || r.test === 'bp_diastolic') : [],
      thresholds: await hdb.thresholds.toArray()
    })).subscribe({ next: setD, error: () => setD({ checkins: [], readings: [], thresholds: [] }) })
    return () => sub.unsubscribe()
  }, [selfId, acting])
  const paths = (rows ?? []).filter((r) => r.kind === 'photo' && r.photoPath).slice(0, 12).map((r) => r.photoPath!).join('|')
  useEffect(() => {
    let live = true
    if (paths) void signFeedPhotos(paths.split('|')).then((m) => { if (live) setUrls(m) })
    return () => { live = false }
  }, [paths])
  const items = useMemo(() => {
    const now = new Date()
    const th = d?.thresholds ?? []
    const server = feedFromRows(rows ?? [], { selfId, now, thresholds: th, urls })
    // unknown switches (offline, 0050 not applied) add nothing: an own post shows only when the server said the switch is on
    const local = mine ? buildFeed({ checkins: mine.status ? d?.checkins ?? [] : [], readings: mine.bp ? d?.readings ?? [] : [], photos: [], msgs: [], selfId, now, thresholds: th }) : []
    return feedFilter(mergeFeed(server, local, now), f)
  }, [rows, d, urls, mine, selfId, f])
  return (
    <>
      <LargeTitle back={{ href: '#family', label: 'Family' }} title="Family feed" />
      <Segmented label="Show" value={f} onChange={setF} options={[{ id: 'all', label: 'All' }, { id: 'health', label: 'Health' }, { id: 'photos', label: 'Photos' }, { id: 'checkins', label: 'Check-ins' }]} />
      {!d || !rows ? <p className="sub" aria-busy="true">Loading…</p> : items.length === 0 ? <EmptyState icon="msg" title={EMPTY[f].t} body={EMPTY[f].b} /> : (
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
      <p className="sub pc-foot">Only the person can turn on what they share, in Privacy. The owner does it for people with no login.</p>
    </>
  )
}
