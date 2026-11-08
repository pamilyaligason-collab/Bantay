import { useEffect, useState } from 'react'
import { SubHeader } from '../../shell/SubHeader'
import { loadTopic, parseKey, SOURCE_LINE, type Topic } from './medline'
import type { LabEntry } from '../labGlossary'
import { useLabGlossary } from '../labsLogic'
import { LabExplain } from './LabExplain'
import { LocalArticle } from './encyclopediaArticle'
import { BodyList } from './encyclopediaList'
import { readArticle, type FullArticleData } from './fullLibrary'
import { FullArticle } from './FullLibraryCard'
import '../health.css'
import '../m7a.css'

type View = { s: 'loading' } | { s: 'ok'; topic: Topic; old: boolean } | { s: 'none' } | { s: 'offline' }

/** #health/library/<key>: e:<id> a topic of the offline encyclopedia; t:<code> a lab test; otherwise one summary from MedlinePlus Connect (one request when it is not cached), its source line, and a link to the full page. */
export default function Article({ rawKey }: { rawKey: string }) {
  const g = useLabGlossary()
  if (rawKey.startsWith('e:')) return <LocalArticle id={rawKey.slice(2)} />
  if (rawKey.startsWith('b:')) return <BodyList body={rawKey.slice(2)} /> // the Discover route draws Article for every deeper library address
  if (rawKey.startsWith('f:')) return <FullArticleView k={rawKey.slice(2)} />
  if (rawKey.startsWith('t:')) {
    if (!g) return <ArticleLoading />
    const lab = g.labEntry(rawKey.slice(2))
    if (lab) return <LabArticle e={lab} />
  }
  return <TopicArticle rawKey={rawKey} />
}

/** f:<key>: an article of the downloaded full library (works offline). When the library is not on this phone (or the key is not in it) it says so. */
function FullArticleView({ k }: { k: string }) {
  const [a, setA] = useState<FullArticleData | null | undefined>(undefined)
  useEffect(() => { let live = true; setA(undefined); readArticle(k).then((r) => live && setA(r)).catch(() => live && setA(null)); return () => { live = false } }, [k])
  if (a) return <FullArticle articleKey={k} /> // lane A2's view: title, text, mdwiki credit
  return (
    <>
      <SubHeader title="Health library" backHref="#health/library" backLabel="Back to Library" />
      {a === undefined && <article className="card ar-art" data-testid="article"><p className="sub" role="status">Loading...</p></article>}
      {a === null && (
        <article className="card ar-art" data-testid="article-nofull">
          <h2 className="ar-h">Full library not downloaded</h2>
          <p className="ar-body">This article is in the full library, which is not on this phone yet. Download it from the Health library page when you are on Wi-Fi.</p>
        </article>
      )}
    </>
  )
}

/** t:<code>: a lab test from the glossary, shown without a network request. Same text as the lab detail page. */
function LabArticle({ e }: { e: LabEntry }) {
  return (
    <>
      <SubHeader title="Health library" backHref="#health/library" backLabel="Back to Library" />
      <article className="card ar-art" data-testid="article">
        <h2 className="ar-h">{e.name}</h2>
        <p className="sub">{e.short}</p>
      </article>
      <LabExplain entry={e} />
      <p className="sub ar-src" style={{ margin: '8px 4px 0' }}>{SOURCE_LINE}</p>
    </>
  )
}

function ArticleLoading() {
  return (
    <>
      <SubHeader title="Health library" backHref="#health/library" backLabel="Back to Library" />
      <article className="card ar-art" data-testid="article">
        <h2 className="ar-h">Article</h2>
        <p className="sub" role="status">Loading...</p>
      </article>
    </>
  )
}

function TopicArticle({ rawKey }: { rawKey: string }) {
  const key = parseKey(rawKey)
  const [view, setView] = useState<View>({ s: 'loading' })
  useEffect(() => {
    const k = parseKey(rawKey)
    if (!k) return setView({ s: 'none' })
    let live = true
    setView({ s: 'loading' })
    void (async () => {
      let offline = false
      for (const kind of k.kinds) {
        const r = await loadTopic(kind, k.text)
        if (!live) return
        if (r.state === 'ok') return setView({ s: 'ok', topic: r.topic, old: r.from === 'old-cache' })
        if (r.state === 'offline') offline = true
      }
      if (live) setView(offline ? { s: 'offline' } : { s: 'none' })
    })()
    return () => { live = false }
  }, [rawKey])
  const heading = view.s === 'ok' ? view.topic.title : key ? key.text.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Article'
  return (
    <>
      <SubHeader title="Health library" backHref="#health/library" backLabel="Back to Library" />
      <article className="card ar-art" data-testid="article">
        <h2 className="ar-h">{heading}</h2>
        {view.s === 'loading' && <p className="sub" role="status">Loading...</p>}
        {view.s === 'ok' && (
          <>
            <p className="ar-body">{view.topic.summary}</p>
            {view.old && <p className="sub">Saved earlier; could not check for a newer one.</p>}
            <a className="hv-open ar-more" href={view.topic.url} target="_blank" rel="noopener noreferrer">Read the full page on MedlinePlus<span className="hv-sr"> (opens in new tab)</span></a>
          </>
        )}
        {view.s === 'none' && <p className="ar-body" data-testid="article-none">MedlinePlus has nothing on this. Try another word, or ask your doctor.</p>}
        {view.s === 'offline' && (
          <div data-testid="article-offline">
            <p className="ar-body">This article needs the internet and nothing is saved on this phone yet. Try again when you are online.</p>
            <a className="hv-open ar-more" href="https://medlineplus.gov/" target="_blank" rel="noopener noreferrer">Open MedlinePlus<span className="hv-sr"> (opens in new tab)</span></a>
          </div>
        )}
        <p className="sub ar-src">{SOURCE_LINE}</p>
      </article>
    </>
  )
}
