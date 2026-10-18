import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MASCOT_SRC } from '../../assets/mascot'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import '../shell/shell.css'
import './update.css'
import type { Latest } from './check'
import { AppUpdater, type AppUpdaterPlugin } from './plugin'

const MB = 1048576
export const fmtMB = (n: number) => String(Math.round((n / MB) * 10) / 10)

type Phase = 'idle' | 'wifi' | 'downloading' | 'pending' | { error: string }
type Conn = { type?: string; addEventListener?: (e: string, f: () => void) => void; removeEventListener?: (e: string, f: () => void) => void }
export const connection = () => (navigator as unknown as { connection?: Conn }).connection
export const onCellular = () => connection()?.type === 'cellular'

/** Copy for each err.code from the native plugin (message == code natively; the web stub also sets code). */
export function errorCopy(code: string, size: number): string {
  switch (code) {
    case 'checksum': return 'The download was damaged. Try again.'
    case 'space': return `Not enough space. Free up ${Math.ceil((size * 2) / MB)} MB and try again.`
    case 'network': return 'Download stopped. Try again when you have signal.'
    case 'busy': return 'An update is already in progress. Wait a moment, then try again.'
    case 'bad_args': return 'This update could not be started. Try again later.'
    case 'install': return 'The update was not installed. Try again.'
    default: return 'The update did not finish. Try again.'
  }
}
const codeOf = (e: unknown) => { const x = e as { code?: unknown; message?: unknown } | null; return String(x?.code ?? x?.message ?? '') }

type Api = Pick<AppUpdaterPlugin, 'info' | 'openInstallPermission' | 'download' | 'install'> & Partial<Pick<AppUpdaterPlugin, 'addListener'>>

export function UpdateSheet({ latest, api = AppUpdater, onClose }: { latest: Latest; api?: Api; onClose?: () => void }) {
  const [canInstall, setCanInstall] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [prog, setProg] = useState({ done: 0, total: latest.size })
  const [wifiOnly, setWifiOnly] = useKv<boolean>('update.wifiOnly', true)
  const path = useRef<string | null>(null)
  const alive = useRef(true)
  const close = useRef(onClose)
  close.current = onClose

  const recheck = useCallback(() => { void api.info().then((i) => alive.current && setCanInstall(i.canInstall), () => undefined) }, [api])
  useEffect(() => {
    alive.current = true
    recheck()
    const onVis = () => { if (document.visibilityState === 'visible') recheck() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', recheck)
    return () => { alive.current = false; document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', recheck) }
  }, [recheck])

  useEffect(() => {
    const subs = [
      api.addListener?.('progress', (p) => { if (alive.current) setProg(p) }),
      api.addListener?.('installResult', (r) => {
        if (!alive.current) return
        if (r.status === 'success') close.current?.()
        else setPhase({ error: 'install' })
      })
    ]
    return () => { subs.forEach((s) => void s?.then((h) => h.remove(), () => undefined)) }
  }, [api])

  const install = useCallback(async (p: string) => {
    try {
      const r = await api.install({ path: p })
      if (!alive.current) return
      if (r.status === 'success') close.current?.()
      else if (r.status === 'pending_user') setPhase('pending')
      else setPhase({ error: 'install' })
    } catch (e) { if (alive.current) setPhase({ error: codeOf(e) || 'install' }) }
  }, [api])

  const start = useCallback(async () => {
    if (wifiOnly && onCellular()) { setPhase('wifi'); return }
    // The file is already downloaded when only the install step failed: retry just that step.
    if (path.current) { setPhase('pending'); void install(path.current); return }
    setProg({ done: 0, total: latest.size })
    setPhase('downloading')
    try {
      const { path: p } = await api.download({ url: latest.url, sha256: latest.sha256, size: latest.size })
      path.current = p
      if (alive.current) await install(p)
    } catch (e) { if (alive.current) setPhase({ error: codeOf(e) }) }
  }, [api, install, latest, wifiOnly])

  // Waiting for Wi-Fi: begin by itself when the phone leaves mobile data.
  useEffect(() => {
    const c = connection()
    if (phase !== 'wifi' || !c?.addEventListener) return
    const f = () => { if (!onCellular()) void start() }
    c.addEventListener('change', f)
    return () => c.removeEventListener?.('change', f)
  }, [phase, start])

  const err = typeof phase === 'object' ? phase.error : null
  const pct = prog.total ? Math.min(100, Math.round((prog.done / prog.total) * 100)) : 0
  const body = (
    <div className="sh sh-sheet-wrap" onClick={() => onClose?.()}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label={`Update Bantay to ${latest.versionName}`} onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        {(phase === 'idle' || phase === 'wifi') && (
          <>
            <img className="up-jj" src={MASCOT_SRC} alt="" width={90} height={90} />
            <h2 className="sh-h2 up-c">Update ready: {latest.versionName}</h2>
            <p className="sh-sub up-c up-m0">{latest.notes} {fmtMB(latest.size)} MB.</p>
            {canInstall === false && (
              <div className="sh-card up-soft">
                <b>First update only</b>
                <div className="sh-sub">Android asks once to let Bantay install updates. Turn it on, go Back, then tap Update now. After that, updates are one tap.</div>
                <div className="sh-row up-between">
                  <span className="sh-grow">Allow Bantay to install updates</span>
                  <button type="button" className="sh-pill sh-ghost sh-small up-card" onClick={() => void api.openInstallPermission()}>Open Settings</button>
                </div>
              </div>
            )}
            {phase === 'wifi' && <p className="sh-sub up-c up-m0" role="status">Waiting for Wi-Fi. The update starts when you connect.</p>}
            <button type="button" className="sh-pill sh-primary sh-block" disabled={canInstall !== true || phase === 'wifi'} onClick={() => void start()}>Update now</button>
            <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => onClose?.()}>Later</button>
          </>
        )}
        {phase === 'downloading' && (
          <>
            <h2 className="sh-h2">Downloading the update</h2>
            <div className="up-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Download progress"><i style={{ width: `${pct}%` }} /></div>
            <div className="sh-sub up-num" role="status">Downloading {fmtMB(prog.done)} of {fmtMB(prog.total)} MB</div>
            <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => onClose?.()}>Hide</button>
          </>
        )}
        {phase === 'pending' && (
          <>
            <span className="up-tile"><Icon name="check" /></span>
            <h2 className="sh-h2 up-c" role="status">Checked. Tap Update in Android&apos;s box.</h2>
            <p className="sh-sub up-c up-m0">Android shows its own box next. Tap Update there. Bantay restarts when it is done.</p>
            <button type="button" className="sh-pill sh-primary sh-block" onClick={() => onClose?.()}>Done</button>
          </>
        )}
        {err !== null && (
          <>
            <h2 className="sh-h2 up-c up-err">Update did not finish</h2>
            <p className="sh-sub up-c up-m0" role="alert">{errorCopy(err, latest.size)}</p>
            <p className="sh-sub up-c up-m0">Nothing was lost. Your data and reminders are untouched.</p>
            <button type="button" className="sh-pill sh-primary sh-block" onClick={() => void start()}>Try again</button>
            <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => onClose?.()}>Close</button>
          </>
        )}
        <div className="sh-row up-between">
          <span><b>Download on Wi-Fi only</b><span className="sh-sub sh-blk">Saves your mobile data</span></span>
          <button type="button" className="sh-switch" role="switch" aria-checked={wifiOnly} aria-label="Download on Wi-Fi only" onClick={() => setWifiOnly(!wifiOnly)} />
        </div>
      </div>
    </div>
  )
  return createPortal(body, document.querySelector('.bt') ?? document.body)
}
