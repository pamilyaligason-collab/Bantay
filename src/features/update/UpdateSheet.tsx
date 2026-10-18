import { App } from '@capacitor/app'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MASCOT_SRC } from '../../assets/mascot'
import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import '../shell/shell.css'
import './update.css'
import type { Latest } from './check'
import { resetJob, retryInstall, runJob, startJob, useJob, type JobApi } from './job'
import { AppUpdater, type AppUpdaterPlugin } from './plugin'

const MB = 1048576
export const fmtMB = (n: number) => String(Math.round((n / MB) * 10) / 10)

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

type Api = Pick<AppUpdaterPlugin, 'info' | 'openInstallPermission'> & JobApi

export function UpdateSheet({ latest, api = AppUpdater, onClose }: { latest: Latest; api?: Api; onClose?: () => void }) {
  const [canInstall, setCanInstall] = useState<boolean | null>(null)
  const [wifiOnly, setWifiOnly] = useKv<boolean>('update.wifiOnly', true)
  const job = useJob()
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
    const resume = App.addListener('resume', recheck)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', recheck)
      void Promise.resolve(resume).then((h) => h.remove(), () => undefined)
    }
  }, [recheck])

  useEffect(() => { if (job.phase === 'success') { resetJob(); close.current?.() } }, [job.phase])

  const start = () => startJob(latest, api, wifiOnly)
  const toggleWifi = () => { setWifiOnly(!wifiOnly); if (wifiOnly && job.phase === 'waiting_wifi') void runJob(latest, api) }

  const phase = job.phase
  const err = typeof phase === 'object' ? phase.error : null
  const total = job.total || latest.size
  const pct = total ? Math.min(100, Math.round((job.done / total) * 100)) : 0
  const waiting = phase === 'waiting_wifi'
  const idle = phase === 'idle' || waiting
  const body = (
    <div className="sh sh-sheet-wrap up-wrap" onClick={() => onClose?.()}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label={`Update Bantay to ${latest.versionName}`} onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        {idle && (
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
            {waiting && <p className="sh-sub up-c up-m0" role="status">Waiting for Wi-Fi. The update starts when you connect, or turn off Wi-Fi only below.</p>}
            <button type="button" className="sh-pill sh-primary sh-block" disabled={canInstall !== true} onClick={start}>Update now</button>
            <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => onClose?.()}>Later</button>
          </>
        )}
        {phase === 'downloading' && (
          <>
            <h2 className="sh-h2">Downloading the update</h2>
            <div className="up-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Download progress"><i style={{ width: `${pct}%` }} /></div>
            <div className="sh-sub up-num" role="status">Downloading {fmtMB(job.done)} of {fmtMB(total)} MB</div>
            <p className="sh-sub up-m0">You can hide this. The download keeps going.</p>
            <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => onClose?.()}>Hide</button>
          </>
        )}
        {phase === 'pending' && (
          <>
            <span className="up-tile"><Icon name="check" /></span>
            <h2 className="sh-h2 up-c" role="status">Checked. Tap Update in Android&apos;s box.</h2>
            <p className="sh-sub up-c up-m0">Android shows its own box next. Tap Update there. Bantay restarts when it is done.</p>
            <button type="button" className="sh-pill sh-primary sh-block" onClick={() => onClose?.()}>Done</button>
            <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => void retryInstall(api)}>Try again</button>
          </>
        )}
        {err !== null && (
          <>
            <h2 className="sh-h2 up-c up-err">Update did not finish</h2>
            <p className="sh-sub up-c up-m0" role="alert">{errorCopy(err, latest.size)}</p>
            <p className="sh-sub up-c up-m0">Nothing was lost. Your data and reminders are untouched.</p>
            <button type="button" className="sh-pill sh-primary sh-block" onClick={start}>Try again</button>
            <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => onClose?.()}>Close</button>
          </>
        )}
        <div className="sh-row up-between">
          <span><b>Download on Wi-Fi only</b><span className="sh-sub sh-blk">Saves your mobile data</span></span>
          <button type="button" className="sh-switch" role="switch" aria-checked={wifiOnly} aria-label="Download on Wi-Fi only" onClick={toggleWifi} />
        </div>
      </div>
    </div>
  )
  return createPortal(body, document.querySelector('.bt') ?? document.body)
}
