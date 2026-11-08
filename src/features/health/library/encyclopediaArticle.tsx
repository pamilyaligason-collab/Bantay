import { useEffect, useState } from 'react'
import { SubHeader } from '../../shell/SubHeader'
import { LiteVideo } from '../../media/LiteVideo'
import { loadMedlib, type MedTopic } from './encyclopedia'
import '../health.css'
import '../m7a.css'
import './encyclopedia.css'

export const ARTICLE_FOOT = 'Written in plain words for Bantay, based on MedlinePlus.gov. Not medical advice. In an emergency call 911.'

/** One section text: lines split by a new line become a bullet list, one line stays a paragraph. */
function Lines({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean)
  return lines.length > 1 ? <ul className="ax-list">{lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="ar-body">{text}</p>
}

/** The article of one encyclopedia topic. Order: title, also-called line, picture, In short, the red hospital box, folded sections, videos, links, credits, footer. */
export function TopicView({ t }: { t: MedTopic }) {
  const aka = t.aka.filter((a) => a.toLowerCase() !== t.title.toLowerCase()).slice(0, 5)
  return (
    <article className="card ar-art ax-art" data-testid="article" data-topic={t.id}>
      <h2 className="ar-h">{t.title}</h2>
      {aka.length > 0 && <p className="sub ax-aka" data-testid="article-aka">Also called: {aka.join(', ')}</p>}
      {t.picture && <img className="ax-pic" src={`/img/medlib/${t.picture.file}`} alt="" loading="lazy" decoding="async" width={640} height={360} />}
      <section aria-labelledby="ax-short">
        <h3 className="ax-h" id="ax-short">In short</h3>
        <ul className="ax-list" data-testid="article-short">{t.short.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>
      <section className="ax-go" aria-labelledby="ax-go" data-testid="article-gonow">
        <h3 className="ax-h" id="ax-go">Call 911 or go to the hospital now if</h3>
        <ul className="ax-list">{t.goNow.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>
      {t.sections.map((s, i) => (
        <details key={s.heading} className="ax-sec" open={i === 0}>
          <summary>{s.heading}</summary>
          <Lines text={s.text} />
        </details>
      ))}
      {t.videos.length > 0 && (
        <section aria-labelledby="ax-watch" data-testid="article-watch">
          <h3 className="ax-h" id="ax-watch">Watch</h3>
          {t.videos.slice(0, 2).map((v) => (
            <div key={v.id} className="ax-vid"><LiteVideo id={v.id} title={v.title} /><span className="sub">{v.source}</span></div>
          ))}
        </section>
      )}
      <ul className="ax-links" aria-label="More reading">
        {t.links.medlineplus && <li><a className="hv-open ar-more" href={t.links.medlineplus} target="_blank" rel="noopener noreferrer">Read more on MedlinePlus<span className="hv-sr"> (opens in new tab)</span></a></li>}
        {t.links.tagalog && <li><a className="hv-open ar-more" href={t.links.tagalog} target="_blank" rel="noopener noreferrer">Tagalog handout<span className="hv-sr"> (opens in new tab)</span></a></li>}
        {t.links.wikipedia && <li><a className="hv-open ar-more" href={t.links.wikipedia} target="_blank" rel="noopener noreferrer">Wikipedia<span className="hv-sr"> (opens in new tab)</span></a></li>}
      </ul>
      <details className="ax-credits">
        <summary>Sources and picture credits</summary>
        <p className="sub">Text: MedlinePlus.gov, U.S. National Library of Medicine, rewritten in plain words.</p>
        {t.picture && <p className="sub" data-testid="picture-credit">Picture: <a href={t.picture.href} target="_blank" rel="noopener noreferrer">{t.picture.credit}</a>, {t.picture.licence}, Wikimedia Commons.</p>}
      </details>
      <p className="sub ar-src">{ARTICLE_FOOT}</p>
    </article>
  )
}

/** e:<id>: loads the encyclopedia (own chunk) and shows the topic. */
export function LocalArticle({ id }: { id: string }) {
  const [t, setT] = useState<MedTopic | null | 'error'>(null)
  useEffect(() => { let live = true; loadMedlib().then((l) => live && setT(l.topics.find((x) => x.id === id) ?? 'error')).catch(() => live && setT('error')); return () => { live = false } }, [id])
  const back = <SubHeader title="Health library" backHref="#health/library" backLabel="Back to Library" />
  if (t === null) return <>{back}<article className="card ar-art" data-testid="article"><p className="sub" role="status">Loading...</p></article></>
  if (t === 'error') return <>{back}<article className="card ar-art" data-testid="article-none"><p className="ar-body">This topic is not in the library. Go back and try another word.</p></article></>
  return <>{back}<TopicView t={t} /></>
}
