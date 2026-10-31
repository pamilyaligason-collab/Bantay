import { useEffect, useState } from 'react'
import { SubHeader } from '../../shell/SubHeader'
import { loadTopic, parseKey, SOURCE_LINE, type Topic } from './medline'
import '../health.css'
import '../m7a.css'

type View = { s: 'loading' } | { s: 'ok'; topic: Topic; old: boolean } | { s: 'none' } | { s: 'offline' }

/** #discover/learn/library/<key> (was #health/library/<key>): one summary from MedlinePlus Connect (one request when it is not cached), its source line, and a link to the full page. */
export default function Article({ rawKey }: { rawKey: string }) {
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
      <SubHeader title="Health library" backHref="#discover/learn/library" backLabel="Back to the library" />
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
