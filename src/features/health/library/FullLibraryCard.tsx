import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { SubHeader } from '../../shell/SubHeader'
import { db } from '../../../db'
import {
  autoOk, autoRetryOk, cancelDownload, currentRun, getStatus, onNetwork, onRun, startDownload, readArticle, remove, searchFullLibrary, FullLibraryError, FULL_LIBRARY_MB, MDWIKI_CREDIT, MDWIKI_LICENCE_URL,
  type FullArticleData, type FullLibraryStatus,
} from './fullLibrary'
import './fullLibrary.css'

export { searchFullLibrary, readArticle }

const mb = (n: number) => Math.max(1, Math.round(n / 1048576))

const CONSENT = 'medlib.auto' // kv: 'yes' | 'no'; absent = never asked (D-167)

/** The card on the library home. Asks once about automatic Wi-Fi download; Get, progress, then one small Ready row with Delete. */
export function FullLibraryCard({ onChange }: { onChange?: () => void } = {}) {
  const [st, setSt] = useState<FullLibraryStatus>({ state: 'none', bytes: 0, total: 0 })
  const [prog, setProg] = useState<{ bytes: number; total: number } | null>(null)
  const [ask, setAsk] = useState<'wifi' | 'delete' | null>(null)
  const [note, setNote] = useState('')
  const [consent, setConsent] = useState<'yes' | 'no' | null | undefined>(undefined) // undefined = still loading
  const alive = useRef(true)
  const live = useRef({ st, consent })
  live.current = { st, consent }

  const refresh = useCallback(async () => { const s = await getStatus(); if (alive.current) setSt(s); return s }, [])
  const saveConsent = (v: 'yes' | 'no') => { setConsent(v); live.current = { ...live.current, consent: v }; void db.kv.put({ key: CONSENT, value: v }).catch(() => undefined) }

  const start = async (confirmed: boolean, byConsent = false) => {
    setAsk(null); setNote('')
    setSt((s) => ({ ...s, state: 'downloading' }))
    setProg({ bytes: live.current.st.bytes, total: live.current.st.total })
    try {
      await startDownload({ confirmed, auto: byConsent })
      setNote('The full medical library is ready.')
    } catch (e) {
      const code = e instanceof FullLibraryError ? e.code : ''
      if (code === 'needs-confirm') { if (!byConsent) setAsk('wifi') }
      else if (code === 'paused') setNote('Paused. It carries on when Bantay is open on Wi-Fi.')
      else if (code === 'busy') { /* another start is already running */ }
      else if (code === 'aborted') setNote('Download cancelled.')
      else setNote(e instanceof Error ? e.message : 'Download failed.')
    } finally {
      if (alive.current) setProg(null)
      await refresh()
    }
  }

  // Start or resume by consent, only on a confirmed unmetered link; never on mobile data.
  const startRef = useRef(start)
  startRef.current = start
  const tryAuto = useCallback(() => {
    const { st: s, consent: c } = live.current
    if (c === 'yes' && (s.state === 'none' || s.state === 'error') && !currentRun() && autoOk() && autoRetryOk()) void startRef.current(false, true)
  }, [])

  useEffect(() => {
    alive.current = true
    void (async () => {
      const row = await db.kv.get(CONSENT).catch(() => undefined)
      const s = await refresh()
      if (!alive.current) return
      const c = row?.value === 'yes' || row?.value === 'no' ? row.value : null
      live.current = { st: s, consent: c }
      const r = currentRun() // a download started before this card mounted: attach to it
      if (r) setProg(r.prog ?? { bytes: s.bytes, total: s.total })
      setConsent(c)
      tryAuto()
    })()
    const offRun = onRun((p) => {
      if (!alive.current) return
      if (p) { setProg(p); return }
      setProg(null)
      void refresh().then((r) => { if (r.state === 'ready') onChange?.() })
    })
    // fullLibrary.ts pauses a consent download on mobile data; the card only carries on when Wi-Fi is back
    const offNet = onNetwork(() => { if (autoOk()) tryAuto() })
    return () => { alive.current = false; offRun(); offNet() }
  }, [refresh, tryAuto, onChange])

  const answer = (yes: boolean) => {
    saveConsent(yes ? 'yes' : 'no')
    if (!yes) return
    if (autoOk()) void start(false, true)
    else setNote('It will download while Bantay is open on Wi-Fi.')
  }
  const del = async () => { setAsk(null); await remove(); saveConsent('no'); setNote('Deleted.'); await refresh(); onChange?.() }
  const size = mb(st.total || FULL_LIBRARY_MB * 1048576)
  const pct = prog && prog.total ? Math.min(100, Math.floor((prog.bytes / prog.total) * 100)) : 0

  if (st.state === 'ready') {
    return (
      <section className="card fl-card fl-mini" aria-label="Full medical library" data-testid="full-library">
        {ask === 'delete' ? (
          <div className="fl-row">
            <span>Delete {mb(st.bytes)} MB? It will not download again by itself.</span>
            <button type="button" className="btn fl-del" onClick={() => void del()}>Yes, delete</button>
            <button type="button" className="btn2" onClick={() => setAsk(null)}>Keep</button>
          </div>
        ) : (
          <div className="fl-row fl-line">
            <span className="fl-ok">Full medical library · Ready · {mb(st.bytes)} MB</span>
            <button type="button" className="btn2 fl-del" onClick={() => setAsk('delete')}>Delete</button>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="card fl-card" aria-label="Full medical library" data-testid="full-library">
      <h3>Full medical library</h3>
      <p className="sub">mdwiki, thousands of articles in plain text. Download once on Wi-Fi, then it works offline. About {size} MB.</p>
      {consent === null && st.state !== 'downloading' && (
        <div className="fl-row" role="group" aria-label="Automatic download">
          <span>Download the full medical library ({size} MB) on Wi-Fi automatically?</span>
          <button type="button" className="btn" onClick={() => answer(true)}>Yes</button>
          <button type="button" className="btn2" onClick={() => answer(false)}>Not now</button>
        </div>
      )}
      {st.state === 'downloading' && (
        <>
          <div className="fl-bar" role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
          <div className="fl-row">
            <span className="fl-pct">{pct}%</span>
            <button type="button" className="btn2" onClick={cancelDownload}>Cancel</button>
          </div>
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
      {(consent === 'yes' || consent === 'no') && st.state !== 'downloading' && (
        <div className="fl-row">
          <span>{consent === 'yes' ? 'Automatic Wi-Fi download is on.' : 'Automatic Wi-Fi download is off.'}</span>
          <button type="button" className="btn2" onClick={() => (consent === 'yes' ? saveConsent('no') : answer(true))}>{consent === 'yes' ? 'Turn off' : 'Turn on'}</button>
        </div>
      )}
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
