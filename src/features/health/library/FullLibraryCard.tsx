import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { SubHeader } from '../../shell/SubHeader'
import {
  download, getStatus, readArticle, remove, searchFullLibrary, FullLibraryError, FULL_LIBRARY_MB, MDWIKI_CREDIT, MDWIKI_LICENCE_URL,
  type FullArticleData, type FullLibraryStatus,
} from './fullLibrary'
import './fullLibrary.css'

export { searchFullLibrary, readArticle }

const mb = (n: number) => Math.max(1, Math.round(n / 1048576))

/** The card on the library home: Get (Wi-Fi or after a confirm), progress with Cancel, then Ready with Delete. */
export function FullLibraryCard({ onChange }: { onChange?: () => void } = {}) {
  const [st, setSt] = useState<FullLibraryStatus>({ state: 'none', bytes: 0, total: 0 })
  const [prog, setProg] = useState<{ bytes: number; total: number } | null>(null)
  const [ask, setAsk] = useState<'wifi' | 'delete' | null>(null)
  const [note, setNote] = useState('')
  const ctl = useRef<AbortController | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => { const s = await getStatus(); if (alive.current) setSt(s) }, [])
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false } }, [refresh])

  const start = async (confirmed: boolean) => {
    setAsk(null); setNote('')
    const c = new AbortController()
    ctl.current = c
    setSt((s) => ({ ...s, state: 'downloading' }))
    setProg({ bytes: st.bytes, total: st.total })
    try {
      await download({ confirmed, signal: c.signal, onProgress: (p) => { if (alive.current) setProg(p) } })
      setNote('The full medical library is ready.')
      onChange?.()
    } catch (e) {
      if (e instanceof FullLibraryError && e.code === 'needs-confirm') setAsk('wifi')
      else if (!(e instanceof FullLibraryError && e.code === 'aborted')) setNote(e instanceof Error ? e.message : 'Download failed.')
      else setNote('Download cancelled.')
    } finally {
      ctl.current = null
      if (alive.current) setProg(null)
      await refresh()
    }
  }

  const del = async () => { setAsk(null); await remove(); setNote('Deleted.'); await refresh(); onChange?.() }
  const size = mb(st.total || FULL_LIBRARY_MB * 1048576)
  const pct = prog && prog.total ? Math.min(100, Math.floor((prog.bytes / prog.total) * 100)) : 0

  return (
    <section className="card fl-card" aria-label="Full medical library" data-testid="full-library">
      <h3>Full medical library</h3>
      {st.state !== 'ready' && (
        <p className="sub">mdwiki, thousands of articles in plain text. Download once on Wi-Fi, then it works offline. About {size} MB.</p>
      )}
      {st.state === 'downloading' && (
        <>
          <div className="fl-bar" role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
          <div className="fl-row">
            <span className="fl-pct">{pct}%</span>
            <button type="button" className="btn2" onClick={() => ctl.current?.abort()}>Cancel</button>
          </div>
        </>
      )}
      {st.state === 'ready' && (
        <>
          <p className="fl-ok">Ready. Works offline.</p>
          {ask === 'delete' ? (
            <div className="fl-row">
              <span>Delete {mb(st.bytes)} MB?</span>
              <button type="button" className="btn fl-del" onClick={() => void del()}>Yes, delete</button>
              <button type="button" className="btn2" onClick={() => setAsk(null)}>Keep</button>
            </div>
          ) : (
            <div className="fl-row"><button type="button" className="btn2 fl-del" onClick={() => setAsk('delete')}>Delete ({mb(st.bytes)} MB)</button></div>
          )}
        </>
      )}
      {(st.state === 'none' || st.state === 'error') && (ask === 'wifi' ? (
        <div className="fl-row">
          <span>Wi-Fi is not confirmed. Download {size} MB anyway?</span>
          <button type="button" className="btn" onClick={() => void start(true)}>Download</button>
          <button type="button" className="btn2" onClick={() => setAsk(null)}>Not now</button>
        </div>
      ) : (
        <div className="fl-row"><button type="button" className="btn" onClick={() => void start(false)}>{st.bytes > 0 ? 'Resume' : 'Get'}</button></div>
      ))}
      <div role="status" aria-live="polite">{note && <p className={st.state === 'error' ? 'fl-err' : 'sub'}>{note}</p>}</div>
      {st.state === 'error' && !note && st.message && <p className="fl-err" role="alert">{st.message}</p>}
    </section>
  )
}

function Body({ text }: { text: string }) {
  const out: ReactNode[] = []
  let items: string[] = []
  const endList = () => { if (items.length) { out.push(<ul key={`u${out.length}`}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>); items = [] } }
  for (const ln of text.split('\n')) {
    if (ln.startsWith('- ')) { items.push(ln.slice(2)); continue }
    endList()
    if (ln.startsWith('## ')) out.push(<h3 key={`h${out.length}`}>{ln.slice(3)}</h3>)
    else if (ln.trim()) out.push(<p key={`p${out.length}`}>{ln}</p>)
  }
  endList()
  return <Fragment>{out}</Fragment>
}

/** One article from the downloaded pack: title, text, picture if the pack has one (only packs built with --images), and the mdwiki credit. */
export function FullArticle({ articleKey }: { articleKey: string }) {
  const [a, setA] = useState<FullArticleData | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setA(undefined)
    void readArticle(articleKey).then((r) => { if (live) setA(r) })
    return () => { live = false }
  }, [articleKey])
  return (
    <>
      <SubHeader title="Health library" backHref="#health/library" backLabel="Back to the library" />
      <article className="card fl-art" data-testid="full-article">
        {a === undefined && <p className="sub" role="status">Loading...</p>}
        {a === null && <p className="sub">This article is not in the downloaded library. Open the library and check that the full medical library is ready.</p>}
        {a && (
          <>
            <h2 className="ar-h">{a.title}</h2>
            {a.image && <img src={`data:image/webp;base64,${a.image}`} alt="" />}
            <Body text={a.text} />
          </>
        )}
      </article>
      {a && (
        <p className="sub">For learning only. Not medical advice. Ask a doctor before changing any medicine. Emergency: call 911.</p>
      )}
      {a && (
        <p className="fl-credit">
          {MDWIKI_CREDIT}{' '}
          <a href={MDWIKI_LICENCE_URL} target="_blank" rel="noreferrer">CC BY-SA 4.0 licence</a>{' '}
          <a href={a.url} target="_blank" rel="noreferrer">Original article on mdwiki.org</a>
        </p>
      )}
    </>
  )
}
