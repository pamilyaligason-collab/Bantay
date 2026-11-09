import { db } from '../../../db'
import { FULL_LIBRARY_HOSTED, autoOk, autoRetryOk, currentRun, getStatus, onNetwork, startDownload } from './fullLibrary'

/** kv key written by FullLibraryCard once the person answered the Wi-Fi question (D-167). */
export const CONSENT_KEY = 'medlib.auto'

/** One guarded try: only with a saved 'yes', a confirmed unmetered link, no data saver, no earlier failure cooling down, nothing already running, and a hosted pack. */
export async function tryAutoLibrary(): Promise<boolean> {
  try {
    if (!FULL_LIBRARY_HOSTED || currentRun() || !autoOk() || !autoRetryOk()) return false
    if ((await db.kv.get(CONSENT_KEY))?.value !== 'yes') return false
    const s = await getStatus()
    if (s.state !== 'none' && s.state !== 'error') return false
    if (currentRun()) return false
    await startDownload({ auto: true })
    return true
  } catch { return false } // busy, paused, offline: the next open or the next Wi-Fi change tries again
}

/** App start: begin the saved-consent download without opening the Library page, then again when the link turns to Wi-Fi. */
export function startLibraryAuto(): () => void {
  const run = () => void tryAutoLibrary()
  const idle = 'requestIdleCallback' in window // older WebViews lack it: a plain timer then
  const h = idle ? window.requestIdleCallback(run, { timeout: 8000 }) : window.setTimeout(run, 4000)
  const off = onNetwork(() => { if (autoOk()) run() })
  return () => { off(); if (idle) window.cancelIdleCallback(h); else clearTimeout(h) }
}
