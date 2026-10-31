import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { JackArt } from '../look'
import { ASK_EVENT } from '../assistant/Assistant'
import { isDiscoverSubRoot } from '../discover'
import { AskSheet } from './AskSheet'
import { hasOwnHeader, type Tab } from './routes'
import { useKv } from './useKv'
import './shell.css'

const HOLD_MS = 500

type Box = { left: number; right: number; top: number; bottom: number }
const hits = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/** True when the coach mark would sit on the SOS section or on any line of page text (UI-1): it is then not shown, never drawn over safety text. */
function coversText(hint: Box): boolean {
  const sos = document.querySelector('.td-sos')?.getBoundingClientRect()
  if (sos && hits(hint, sos)) return true
  const root = document.querySelector('.bt .scroll')
  if (!root) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  if (typeof range.getClientRects !== 'function') return false // jsdom has no layout; real browsers do
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue?.trim()) continue
    range.selectNodeContents(n)
    for (const r of Array.from(range.getClientRects())) if (r.width > 0 && hits(hint, r)) return true
  }
  return false
}

/** Floating Jack button (round 2, replaces the centre Ask tab). Tap opens Jack; press and hold (or right click) opens the Ask choice sheet; the coach mark says so (UI-19)
 *  (Talk, Scan & Capture, Upload a photo). Hidden in Simple mode, on every route that draws its own header, and off the five tabs.
 *  While shown it marks `.bt[data-jack]` so the page content keeps clear of it (shell.css). */
export function JackFab({ tab, hash }: { tab: Tab | null; hash: string }) {
  const [sheet, setSheet] = useState(false)
  const [seen, setSeen, loaded] = useKv('askHintSeen', false)
  const [simple, , simpleLoaded] = useKv('mode.simple', false) // Simple mode has no Jack button, so its hint must not count as seen
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false) // a hold opened the sheet; the click that follows the release must not also open Jack
  const [nofab, setNofab] = useState(false) // a storm or quake warning on screen marks itself data-nofab (D-91): nothing but the warning's own buttons
  useEffect(() => {
    const root = document.querySelector('.bt') ?? document.body
    const check = () => setNofab(!!document.querySelector('[data-nofab]'))
    check()
    const mo = new MutationObserver(check)
    mo.observe(root, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [hash])
  const visible = tab !== null && !nofab && (!hasOwnHeader(hash) || isDiscoverSubRoot(hash)) && simpleLoaded && !simple
  const hint = visible && loaded && !seen && !sheet && tab === 'today'
  const hintRef = useRef<HTMLParagraphElement>(null)
  const [fits, setFits] = useState(false) // the hint is measured before it shows; it stays hidden while it would cover text

  useEffect(() => {
    if (!visible) return
    const bt = document.querySelector('.bt')
    bt?.setAttribute('data-jack', '')
    return () => bt?.removeAttribute('data-jack')
  }, [visible])
  useLayoutEffect(() => {
    if (!hint) { setFits(false); return }
    const check = () => { const r = hintRef.current?.getBoundingClientRect(); if (r) setFits(!coversText(r)) }
    check()
    const scroller = document.querySelector('.bt .scroll')
    const bt = document.querySelector('.bt')
    bt?.setAttribute('data-hint', '') // the page end makes room for the coach mark too, so it has a clear spot at the bottom (shell.css)
    let raf = 0
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(check) } // cards load after first paint, so re-measure when the page changes too
    const mo = new MutationObserver(later)
    if (scroller) mo.observe(scroller, { childList: true, subtree: true, characterData: true })
    scroller?.addEventListener('scroll', later, { passive: true })
    window.addEventListener('resize', later)
    return () => { bt?.removeAttribute('data-hint'); cancelAnimationFrame(raf); mo.disconnect(); scroller?.removeEventListener('scroll', later); window.removeEventListener('resize', later) }
  }, [hint])
  useEffect(() => { // the coach mark shows once: it counts as seen after 8 seconds on screen, so it never sits on the page again
    if (!hint || !fits) return
    const t = setTimeout(() => setSeen(true), 8000)
    return () => clearTimeout(t)
  }, [hint, fits, setSeen])
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
      {hint && <p ref={hintRef} className="sh-hint" role="status" style={fits ? undefined : { visibility: 'hidden' }}>Ask me anything. Hold for more.</p>}
      {sheet && <AskSheet onClose={onClose} onDone={onDone} />}
    </>
  )
}
