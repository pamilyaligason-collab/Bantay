import { useCallback, useEffect, useRef, useState } from 'react'
import { JackArt } from '../look'
import { ASK_EVENT } from '../assistant/Assistant'
import { isDiscoverSubRoot } from '../discover'
import { AskSheet } from './AskSheet'
import { hasOwnHeader, type Tab } from './routes'
import { useKv } from './useKv'
import './shell.css'

const HOLD_MS = 500

/** Floating Jack button (round 2, replaces the centre Ask tab). Tap opens Jack; press and hold (or right click) opens the Ask choice sheet; the coach mark says so (UI-19)
 *  (Talk, Scan & Capture, Upload a photo). Hidden in Simple mode, on every route that draws its own header, and off the five tabs.
 *  While shown it marks `.bt[data-jack]` so the page content keeps clear of it (shell.css). */
export function JackFab({ tab, hash }: { tab: Tab | null; hash: string }) {
  const [sheet, setSheet] = useState(false)
  const [seen, setSeen, loaded] = useKv('askHintSeen', false)
  const [simple, , simpleLoaded] = useKv('mode.simple', false) // Simple mode has no Jack button, so its hint must not count as seen
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false) // a hold opened the sheet; the click that follows the release must not also open Jack
  const visible = tab !== null && (!hasOwnHeader(hash) || isDiscoverSubRoot(hash)) && simpleLoaded && !simple
  const hint = visible && loaded && !seen && !sheet && tab === 'today'

  useEffect(() => {
    if (!visible) return
    const bt = document.querySelector('.bt')
    bt?.setAttribute('data-jack', '')
    return () => bt?.removeAttribute('data-jack')
  }, [visible])
  useEffect(() => { // the coach mark shows once: it counts as seen after 8 seconds, so it never sits on the page again
    if (!hint) return
    const t = setTimeout(() => setSeen(true), 8000)
    return () => clearTimeout(t)
  }, [hint, setSeen])
  useEffect(() => () => clearTimeout(timer.current), [])

  const openSheet = () => { setSheet(true); if (!seen) setSeen(true) }
  const onClose = useCallback(() => { if (history.state?.bantayAsk) history.back(); else setSheet(false) }, [])
  const onDone = useCallback(() => setSheet(false), [])
  const stop = () => clearTimeout(timer.current)
  const down = () => { held.current = false; stop(); timer.current = setTimeout(() => { held.current = true; openSheet() }, HOLD_MS) }
  const click = () => {
    if (held.current) { held.current = false; return }
    if (!seen) setSeen(true)
    window.dispatchEvent(new Event(ASK_EVENT))
  }

  if (!visible) return null
  return (
    <>
      <button
        type="button" className="sh-jackfab" aria-label="Ask Bantay" aria-haspopup="dialog"
        onPointerDown={down} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onContextMenu={(e) => { e.preventDefault(); stop(); held.current = false; openSheet() }}
        onClick={click}
      >
        <JackArt name="head" size={48} decorative />
      </button>
      {hint && <p className="sh-hint" role="status">Ask me anything. Hold for the camera.</p>}
      {sheet && <AskSheet onClose={onClose} onDone={onDone} />}
    </>
  )
}
