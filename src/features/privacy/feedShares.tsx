import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { getMember } from '../auth/session'
import { loadPeople, type DeskPerson } from '../admin/desk/people'
import { feedShareSet, shareCopy, type FeedCategory } from '../sharing/api'
import { familyFeedOn, familyPlacesOn } from '../family/flags'
import { setPlaceSharing } from '../family/placeApi'
import FeedShareSheet, { FEED_LABEL } from './FeedShareSheet'

const FEED_CATS: FeedCategory[] = ['bp', 'lab', 'photo', 'status']
/** The switches this phone shows: the four feed ones with the feed flag, and the place one (D-138) with the places flag. */
const shownCats = (): FeedCategory[] => [...(familyFeedOn() ? FEED_CATS : []), ...(familyPlacesOn() ? (['place'] as FeedCategory[]) : [])]
export const OFFLINE_NOTE = 'Needs internet to change'
export const CHECKING = 'Checking what you share...'
export const NOT_CHECKED = 'Could not check what you share.'
const READ_MS = 10_000 // a read with no answer by then counts as failed: switches stay locked, never shown off

type Ask = { personId: string; category: FeedCategory; name?: string }

/** Privacy > "Share with the family" (D-127, D-134). A switch shows what the server holds: it flips only after feed_share_set returns ok. The owner also sees switches for people with no login; for a person with a login only the off direction (only the person agrees to share). */
export function FeedSharesCard({ selfId }: { selfId: string | null | undefined }) {
  const [on, setOn] = useState<Set<string>>(new Set()) // 'personId|category' that are ON on the server; unknown = off
  const [placeOff, setPlaceOff] = useState<Set<string>>(new Set()) // place is ON unless the server holds an explicit off row (D-138), so it is tracked the other way round
  const [others, setOthers] = useState<DeskPerson[]>([])
  const [ask, setAsk] = useState<Ask | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [read, setRead] = useState<'loading' | 'ok' | 'failed'>('loading') // a switch means something only after the server answered: unknown is never off
  const [again, setAgain] = useState(0)

  useEffect(() => {
    if (!(familyFeedOn() || familyPlacesOn()) || !selfId) return
    let live = true
    setRead('loading')
    void (async () => {
      let got = false
      if (supabase) {
        try {
          const r = await Promise.race([supabase.from('feed_shares').select('person_id, category, enabled'), new Promise<null>((res) => setTimeout(() => res(null), READ_MS))])
          if (live && r && !r.error && Array.isArray(r.data)) {
            got = true
            const rows = r.data as { person_id: string; category: string; enabled: boolean }[]
            setOn(new Set(rows.filter((x) => x.enabled).map((x) => `${x.person_id}|${x.category}`)))
            setPlaceOff(new Set(rows.filter((x) => x.category === 'place' && !x.enabled).map((x) => x.person_id)))
            void setPlaceSharing(selfId, !rows.some((x) => x.category === 'place' && !x.enabled && x.person_id === selfId)) // keep the phone's cached copy of its own switch in step
          }
        } catch { /* stays unknown */ }
      }
      if (live) setRead(got ? 'ok' : 'failed')
      try {
        const m = await getMember()
        if (!m?.isOwner) return
        const people = await loadPeople()
        if (live && familyFeedOn()) setOthers(people.filter((p) => p.id !== selfId && !p.archived_at && !p.kind))
      } catch { /* not the owner, or offline: own switches only */ }
    })()
    return () => { live = false }
  }, [selfId, again])

  if (!(familyFeedOn() || familyPlacesOn()) || !selfId) return null
  const CATS = shownCats()

  const has = (p: string, c: FeedCategory) => (c === 'place' ? !placeOff.has(p) : on.has(`${p}|${c}`))
  const flip = (p: string, c: FeedCategory, v: boolean) => {
    if (c === 'place') { setPlaceOff((s) => { const n = new Set(s); if (v) n.delete(p); else n.add(p); return n }); if (p === selfId) void setPlaceSharing(selfId, v); return }
    setOn((s) => { const n = new Set(s); if (v) n.add(`${p}|${c}`); else n.delete(`${p}|${c}`); return n })
  }
  const offline = () => !supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)
  const run = async (p: string, c: FeedCategory, v: boolean) => {
    setBusy(true); setNote('')
    const r = await feedShareSet(p, c, v)
    setBusy(false); setAsk(null)
    if (r === 'ok') flip(p, c, v)
    else setNote(r === 'offline' ? OFFLINE_NOTE : shareCopy(r))
  }
  const tap = (p: string, c: FeedCategory, name?: string) => {
    if (read !== 'ok') return // not read yet: a tap changes nothing
    if (offline()) return setNote(OFFLINE_NOTE)
    if (has(p, c)) void run(p, c, false) // turning off needs no sheet
    else setNote(''), setAsk({ personId: p, category: c, name })
  }

  const rows = (p: string, cats: FeedCategory[], name?: string) => cats.map((c) => (
    <div key={c}>
      <div className="sh-grow"><b>{FEED_LABEL[c]}</b></div>
      <button type="button" className="sh-switch" role="switch" data-testid={`feed-share-${p}-${c}`} aria-checked={read === 'ok' ? has(p, c) : 'mixed'} aria-label={`${name ? `${name}: ` : ''}Share ${FEED_LABEL[c].toLowerCase()} with the family`} disabled={busy || read !== 'ok'} onClick={() => tap(p, c, name)} />
    </div>
  ))
  const mine = read === 'ok' ? `Share with the family: ${CATS.map((c) => `${FEED_LABEL[c]} ${has(selfId, c) ? 'on' : 'off'}`).join(', ')}.` : read === 'loading' ? CHECKING : NOT_CHECKED
  const noLogin = others.filter((p) => !p.auth_user_id) // place is never listed for them: no phone, nothing to share (D-138)
  const withLogin = others.filter((p) => p.auth_user_id && FEED_CATS.some((c) => has(p.id, c))) // off direction only

  return (
    <section className="pv-feed" data-testid="feed-shares" aria-label="Share with the family">
      <div className="sh-card pv-feed-h">
        <b>Share with the family</b>
        <div className="sh-sub" aria-busy={read === 'loading'}>{mine}</div>
        {read === 'failed' && <button type="button" className="sh-pill sh-ghost" onClick={() => setAgain((n) => n + 1)}>Try again</button>}
      </div>
      <div className="sh-card sh-list">{rows(selfId, CATS)}</div>
      {noLogin.map((p) => (
        <div key={p.id} className="pv-feed-person">
          <p className="sh-sub pv-feed-name">{`${p.display_name} (no login)`}</p>
          <div className="sh-card sh-list">{rows(p.id, FEED_CATS, p.display_name)}</div>
        </div>
      ))}
      {withLogin.map((p) => (
        <div key={p.id} className="pv-feed-person">
          <p className="sh-sub pv-feed-name">{`${p.display_name} shares. You can turn these off; only ${p.display_name} turns one on.`}</p>
          <div className="sh-card sh-list">{rows(p.id, FEED_CATS.filter((c) => has(p.id, c)), p.display_name)}</div>
        </div>
      ))}
      {note && <p className="sh-sub sh-note" role="status">{note}</p>}
      {ask && <FeedShareSheet category={ask.category} name={ask.name} busy={busy} onShare={() => void run(ask.personId, ask.category, true)} onClose={() => setAsk(null)} /> /* Close while the call runs: the call finishes, then the switch and note update */}
    </section>
  )
}
