import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { JackArt } from '../look'
import SosFamilySheet from '../sos/SosFamilySheet'
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

/** Only keyboard focus brings him back: a press focuses the button too. */
const keyboardFocus = (el: HTMLElement) => { try { return el.matches(':focus-visible') } catch { return true } } // no :focus-visible support: treat as keyboard

/** True when the coach mark would sit on any line of page text (UI-1) or on the Today Full forecast link: it is then not shown, never drawn over safety text or that tap target. */
function coversText(hint: Box): boolean {
  const root = document.querySelector('.bt .scroll')
  if (!root) return false
  const full = root.querySelector('.td-wxh-full') // shortcut: only this one control is guarded; whole-card links would hide the hint on every Today
  if (full) { const r = full.getBoundingClientRect(); if (r.width > 0 && hits(hint, r)) return true }
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
  const [away, setAway] = useState(false) // S29 (D-184): scrolling down slides Jack out; scrolling up, 600 ms without scrolling, or the page top brings him back, so he never needs a gutter on the cards
  useEffect(() => {
    setAway(false) // this effect re-runs on a new route or when Jack shows again, and its cleanup drops the 600 ms return timer: without this he could stay slid away until the next scroll
    if (!visible) return
    const el = document.querySelector('.bt .scroll')
    if (!el) return
    let last = el.scrollTop
    let t: ReturnType<typeof setTimeout> | undefined
    const on = () => {
      const top = el.scrollTop, d = top - last
      last = top
      if (top <= 8 || d < -4) { clearTimeout(t); setAway(false); return }
      if (d > 4) { setAway(true); clearTimeout(t); t = setTimeout(() => setAway(false), 600) }
    }
    el.addEventListener('scroll', on, { passive: true })
    return () => { clearTimeout(t); el.removeEventListener('scroll', on) }
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
    if (!hint || !fits || away) return // S29: Jack slid away = bubble hidden, so the 8 s start again when he is back (shortcut: continuous 8 s, not a running total)
    const t = setTimeout(() => setSeen(true), 8000)
    return () => clearTimeout(t)
  }, [hint, fits, away, setSeen])
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
  const [reach, setReach] = useState(false) // SOS short tap (D-137): the family sheet, opened from the Jack sheet
  const onReach = useCallback(() => { setSheet(false); setReach(true) }, [])

  const sosScreen = sos && createPortal(<div className="sh-sosfull" data-testid="sos-full"><SosScreen onClose={() => setSos(false)} /></div>, document.querySelector('.bt') ?? document.body, 'sos') // outlives the button: a warning or Simple mode hiding Jack must not end a running SOS. The key keeps it one instance across the two returns below; a remount would start a new SOS
  if (!visible) return sosScreen || null
  return (
    <>
      <button
        type="button" className="sh-jackfab" data-testid="jack" aria-label="Jack: help, scan, chat" aria-haspopup="dialog" data-away={away || undefined}
        onFocus={(e) => { if (keyboardFocus(e.currentTarget)) setAway(false) }} onClick={() => { setAway(false); setSheet(true); if (!seen) setSeen(true) }}
      >
        <JackArt name="head" size={56} decorative />
      </button>
      {hint && <p ref={hintRef} className="sh-hint" role="status" style={fits && !away ? undefined : { visibility: 'hidden' }}>Help, scan or chat</p>}
      {sheet && <JackSheet onClose={onClose} onSos={onSos} onReach={onReach} firstName={firstOf(name)} />}
      {reach && <SosFamilySheet onClose={() => setReach(false)} />}
      {sosScreen}
    </>
  )
}
