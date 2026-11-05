import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { JackArt } from '../look'
import SosScreen from '../sos/SosScreen'
import { OPEN_SOS_EVENT } from '../sos/openSos'
import { loadFamily } from '../auth/family'
import { getMember } from '../auth/session'
import { isDiscoverSubRoot } from '../discover'
import { JackSheet } from './JackSheet'
import { firstName as firstOf } from './names'
import { hasOwnHeader, type Tab } from './routes'
import { useKv } from './useKv'
import { useActing } from '../viewas/viewAs'
import './shell.css'

type Box = { left: number; right: number; top: number; bottom: number }
const hits = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/** Only keyboard focus brings him back: a press focuses the button too, and moving him then would take him from under the finger. */
const keyboardFocus = (el: HTMLElement) => { try { return el.matches(':focus-visible') } catch { return true } } // no :focus-visible support: treat as keyboard

/** True when the coach mark would sit on any line of page text (UI-1): it is then not shown, never drawn over safety text. */
function coversText(hint: Box): boolean {
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

/** Floating Jack button (replaces the centre Ask tab). One tap opens the Jack sheet (Help hold, Scan, Chat, Upload); the coach mark says so (UI-19). Hidden in Simple mode, on every route that draws its own header, and off the five tabs.
 *  While shown it marks `.bt[data-jack]` so the page content keeps clear of it (shell.css). */
export function JackFab({ tab, hash }: { tab: Tab | null; hash: string }) {
  const [sheet, setSheet] = useState(false)
  const { acting } = useActing()
  const [seen, setSeen, loaded] = useKv('askHintSeen', false)
  const [simple, , simpleLoaded] = useKv('mode.simple', false) // Simple mode has no Jack button, so its hint must not count as seen
  const [sos, setSos] = useState(false) // the full SOS screen, opened by a 3 s hold in the sheet
  const [name, setName] = useState('')
  useEffect(() => { // the warning card's hold opens the SOS screen here, the one owner
    const on = () => { setSheet(false); setSos(true) }
    window.addEventListener(OPEN_SOS_EVENT, on)
    return () => window.removeEventListener(OPEN_SOS_EVENT, on)
  }, [])
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
  const [peek, setPeek] = useState(false) // scrolled down: Jack slides mostly off the right edge so he stops covering rows; back at the top, on focus or on tap he returns
  useEffect(() => {
    if (!visible) return
    const el = document.querySelector('.bt .scroll')
    if (!el) return
    const on = () => setPeek((was) => el.scrollTop > (was ? 8 : 48)) // two thresholds so he does not flutter near the line
    on()
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [visible, hash])
  const hint = visible && loaded && !seen && !sheet && tab === 'today' && !acting // viewing as someone: the hint would sit on the locked Log (D-128)
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
  useEffect(() => {
    let live = true
    void getMember().then((m) => {
      const n = m?.personId ? loadFamily().find((f) => f.personId === m.personId)?.displayName : ''
      if (live && n) setName(n)
    })
    return () => { live = false }
  }, [])

  const onClose = useCallback(() => setSheet(false), [])
  const onSos = useCallback(() => { setSheet(false); setSos(true) }, [])

  const sosScreen = sos && createPortal(<div className="sh-sosfull" data-testid="sos-full"><SosScreen onClose={() => setSos(false)} /></div>, document.querySelector('.bt') ?? document.body, 'sos') // outlives the button: a warning or Simple mode hiding Jack must not end a running SOS. The key keeps it one instance across the two returns below; a remount would start a new SOS
  if (!visible) return sosScreen || null
  return (
    <>
      <button
        type="button" className="sh-jackfab" data-testid="jack" aria-label="Jack: help, scan, chat" aria-haspopup="dialog" data-peek={peek || undefined}
        onFocus={(e) => { if (keyboardFocus(e.currentTarget)) setPeek(false) }} onClick={() => { setPeek(false); setSheet(true); if (!seen) setSeen(true) }}
      >
        <JackArt name="head" size={56} decorative />
      </button>
      {hint && <p ref={hintRef} className="sh-hint" role="status" style={fits ? undefined : { visibility: 'hidden' }}>Help, scan or chat</p>}
      {sheet && <JackSheet onClose={onClose} onSos={onSos} firstName={firstOf(name)} />}
      {sosScreen}
    </>
  )
}
