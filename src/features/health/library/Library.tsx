import { useEffect, useMemo, useState } from 'react'
import { WhoLine } from '../WhoLine'
import { SubHeader } from '../../shell/SubHeader'
import { MoreGrid } from '../../look'
import { useProfile } from '../../setup/useProfile'
import { isLive, normaliseDrug } from '../meds'
import { properName } from '../medName'
import { useHealthPerson } from '../useHealthPerson'
import { useMedications } from '../useMedications'
import { articleHref, SOURCE_LINE } from './medline'
import { loadLabGlossary, useLabGlossary } from '../labsLogic'
import Article from './Article'
import { BodyList, Row, useMedlib } from './encyclopediaList'
import { BODIES, bodyHref, commonInPh, inSeason, searchTopics, topicHref, type Body } from './encyclopedia'
import { FullLibraryCard, searchFullLibrary } from './FullLibraryCard'
import '../health.css'
import '../m7a.css'
import './encyclopedia.css'

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const HASH = /^#(?:health|discover\/learn)\/library(?:\/(.+))?$/
const safeDecode = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => { const on = () => setH(location.hash); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on) }, [])
  return h
}

/** #health/library, #health/library/b:<body> (a body filter) and #health/library/<key> (an article). Also answers the old #discover/learn/library addresses. */
export default function Library() {
  const m = HASH.exec(useHash())
  const key = m?.[1] === undefined ? null : safeDecode(m[1])
  if (key === null) return <LibraryHome />
  if (key.startsWith('b:')) return <BodyList body={key.slice(2)} />
  return <Article rawKey={key} />
}

function LibraryHome() {
  const { personId, people, ownId } = useHealthPerson()
  const profile = useProfile(personId)
  const meds = useMedications(personId)
  const [q, setQ] = useState('')
  const [more, setMore] = useState<{ title: string; snippet: string; key: string }[]>([])
  const g = useLabGlossary()
  const { lib, error } = useMedlib()
  const topics = lib?.topics ?? []
  const forName = personId === ownId ? 'you' : properName(people?.find((p) => p.id === personId)?.name ?? '')

  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: { kind: 'c' | 'm'; text: string; label: string; href: string }[] = []
    const add = (kind: 'c' | 'm', text: string) => {
      const k = `${kind}:${text.toLowerCase()}`
      if (!text || seen.has(k)) return
      seen.add(k)
      const hit = kind === 'c' ? searchTopics(topics, text).find((t) => [t.title, ...t.aka].some((x) => x.toLowerCase() === text.toLowerCase())) : undefined // an exact local topic opens offline
      out.push({ kind, text, label: title(text), href: hit ? topicHref(hit.id) : articleHref(kind, text) })
    }
    for (const c of profile?.conditions ?? []) add('c', c.trim())
    for (const m of meds.filter(isLive)) add('m', normaliseDrug(m.genericName) ?? normaliseDrug(m.name) ?? '')
    return out
  }, [profile, meds, topics])

  const found = useMemo(() => searchTopics(topics, q), [topics, q])
  useEffect(() => { // the downloaded full library, after our own results; empty until it is downloaded
    const t = q.trim()
    if (t.length < 3) { setMore([]); return }
    let live = true
    searchFullLibrary(t).then((r) => live && setMore(r.slice(0, 8))).catch(() => live && setMore([]))
    return () => { live = false }
  }, [q])
  const online = async () => { const t = q.trim(); const lab = t ? (await loadLabGlossary().catch(() => null))?.labEntry(t) : null; if (lab) location.hash = articleHref('t', lab.code); else if (t) location.hash = articleHref('s', t) } // MedlinePlus: needs internet
  const go = () => { if (found[0]) location.hash = topicHref(found[0].id); else void online() } // Enter opens the best offline hit; the online look-up is only for a word we do not have
  const ph = useMemo(() => commonInPh(topics), [topics])
  const searching = q.trim().length > 0

  return (
    <>
      <SubHeader title="Health library" backHref="#health" backLabel="Back to Health" />
      <WhoLine />
      <p className="sub lx-intro" data-testid="lib-intro">{lib ? `${lib.topics.length} topics in plain words. Works without internet.` : 'Plain words. Works without internet.'}</p>
      <form className="lb-search" role="search" onSubmit={(e) => { e.preventDefault(); go() }}>
        <label htmlFor="lb-q" className="hv-sr">Search topics, in English or Tagalog</label>
        <input id="lb-q" type="search" placeholder="Search: ubo, sipon, altapresyon" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      {searching ? (
        <section aria-label="Search results" data-testid="lib-results">
          {error && <p className="sub" role="status">The library could not load. Try again when you are online.</p>}
          {lib && found.length === 0 && more.length === 0 && <p className="sub" data-testid="lib-none">Nothing found for "{q.trim()}". Try another word.</p>}
          <ul className="grp lb-list">
            {found.map((t) => <Row key={t.id} href={topicHref(t.id)} name={t.title} sub={t.short[0]} />)}
            {more.map((r) => <Row key={r.key} href={`#health/library/${encodeURIComponent(`f:${r.key}`)}`} name={r.title} sub={r.snippet} tag="Full library" />)}
          </ul>
          <button type="button" className="btn2 lx-ask" onClick={() => void online()}>Not here? Search MedlinePlus online (needs internet)</button>
        </section>
      ) : (
        <>
          {items.length > 0 && (
            <section aria-labelledby="lx-for">
              <h2 className="hd" id="lx-for">For {forName || 'this person'}</h2>
              <ul className="lx-chips" data-testid="lib-for">
                {items.map((i) => <li key={`${i.kind}:${i.text}`}><a className="lx-chip" href={i.href}>{i.label}<span className="lx-chip-sub">{i.kind === 'c' ? 'Condition' : 'Medicine'}</span></a></li>)}
              </ul>
            </section>
          )}
          <h2 className="hd" id="lx-body">Browse by body</h2>
          <ul className="lx-body" aria-labelledby="lx-body" data-testid="lib-body">
            {BODIES.map((b) => (
              <li key={b.id}>
                <a className="lx-tile" data-body={b.id} href={bodyHref(b.id as Body)}>
                  <b>{b.label}</b><span>{b.hint}</span>
                </a>
              </li>
            ))}
          </ul>
          <h2 className="hd" id="lx-ph">Common in the Philippines</h2>
          {error && <p className="sub" role="status">The library could not load. Try again when you are online.</p>}
          {!lib && !error && <p className="sub">Loading topics...</p>}
          {ph.length > 0 && (
            <MoreGrid label="Common in the Philippines" testId="lib-ph" step={6}>
              {ph.map((t) => (
                <a key={t.id} className="lx-card" href={topicHref(t.id)}>
                  <b>{t.title}</b>
                  {inSeason(t) && <span className="lx-tag" data-testid="season-tag">Season now</span>}
                </a>
              ))}
            </MoreGrid>
          )}
          <FullLibraryCard />
          <h2 className="hd" id="lib-labs">Lab tests</h2>
          {!g && <p className="sub" role="status">Loading...</p>}
          <ul className="grp lb-list" aria-labelledby="lib-labs" data-testid="library-labs">
            {(g?.LAB_GLOSSARY ?? []).map((e) => <Row key={e.code} href={articleHref('t', e.code)} name={e.name} sub={`${e.organ} · MedlinePlus`} />)}
          </ul>
        </>
      )}
      <p className="sub lb-src lx-src">{SOURCE_LINE}. Plain words in English; the search knows many Tagalog words.</p>
    </>
  )
}
