import { useEffect, useState } from 'react'
import { SubHeader } from '../../shell/SubHeader'
import { bodyLabel, inSeason, loadMedlib, topicHref, type MedLib } from './encyclopedia'
import '../health.css'
import '../m7a.css'
import './encyclopedia.css'

/** The encyclopedia once it has loaded (own chunk). `error` is set when the chunk cannot load (a first visit with no internet and no cache). */
export function useMedlib(): { lib: MedLib | null; error: boolean } {
  const [s, setS] = useState<{ lib: MedLib | null; error: boolean }>({ lib: null, error: false })
  useEffect(() => { let live = true; loadMedlib().then((lib) => live && setS({ lib, error: false })).catch(() => live && setS({ lib: null, error: true })); return () => { live = false } }, [])
  return s
}

export function Row({ href, name, sub, tag }: { href: string; name: string; sub?: string; tag?: string }) {
  return (
    <li>
      <a className="row hl-row" href={href}>
        <span className="grow"><b>{name}</b>{sub && <span className="sub">{sub}</span>}</span>
        {tag && <span className="lx-tag">{tag}</span>}
        <span className="hl-go" aria-hidden="true">&rsaquo;</span>
      </a>
    </li>
  )
}

/** #health/library/b:<body>: the topics of one body part. Shared by Library and Article, so a b: key works wherever either one is routed. */
export function BodyList({ body }: { body: string }) {
  const { lib, error } = useMedlib()
  const list = lib?.topics.filter((t) => t.body === body) ?? []
  return (
    <>
      <SubHeader title={bodyLabel(body)} backHref="#health/library" backLabel="Back to Library" />
      {!lib && !error && <p className="sub" role="status">Loading...</p>}
      {error && <p className="sub" role="status">The library could not load. Try again when you are online.</p>}
      {lib && list.length === 0 && <p className="sub" data-testid="body-empty">No topics here.</p>}
      <ul className="grp lb-list" aria-label={`${bodyLabel(body)} topics`} data-testid="body-list">
        {list.map((t) => <Row key={t.id} href={topicHref(t.id)} name={t.title} sub={t.short[0]} tag={inSeason(t) ? 'Season now' : undefined} />)}
      </ul>
    </>
  )
}
