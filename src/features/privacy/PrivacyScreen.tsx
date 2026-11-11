import { useEffect, useState } from 'react'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { useKv } from '../shell/useKv'
import { useSelfPersonId } from '../setup/useProfile'
import { isNativeAndroid } from '../safety/settingsOpener'
import { initShell, shellAtLeast } from '../../native/shell'
import { consentDate, ensureConsent } from './consent'
import { ConsentNotice } from './ConsentNotice'
import { familyFeedOn, familyPlacesOn } from '../family/flags'
import { FeedSharesCard } from './feedShares'
import { AI_KEY } from './ai'
import { ERASURE_KEY, cancelErasure, exportMyData, requestErasure, saveJson } from './data'
import '../shell/shell.css'
import './privacy.css'

// Where the data goes (contract D-78 copy rule): exactly what this build uses. No Sentry or SMS gateway. Firebase Cloud Messaging is used in the Android app only: the release build adds the owner's git-ignored google-services.json (APK 2.7.0 was built with it), so push registers once notifications are allowed (notify/fcm.ts). Web and a build without that file send none.
/** D-138 / ML-45: what the live system does with the family place. Shown only while the places flag is on, so the screen never promises more than the build does. */
export const PLACE_PRIVACY = 'When the Family map is on in the app, the exact latest place and battery level of people who sign in is shared with their family by default, updated when Bantay opens, and off any time in Me, Privacy. Only the latest point is kept, deleted when turned off or after 7 days without an update. The time zone of your phone is also shared while place sharing is on, so reminders follow your local time; turn place sharing off and it is no longer sent.'
/** The same line for the Android app from 2.8.0 (D-149, D-150), the only build with the daily background update. Web and 2.7.0 show PLACE_PRIVACY: a line must be true for the build that shows it (ML-45). Mirrored in public/privacypolicy.html. */
export const PLACE_PRIVACY_BG = 'When the Family map is on in the app, the exact latest place and battery level of people who sign in is shared with their family by default, updated when Bantay opens and, in the Android app from version 2.8.0, once a day in the background (that daily run shares only the battery level and that the phone checked in, never a new place), and off any time in Me, Privacy. Turning sharing off, or signing out, stops the background update and ends its key. Only the latest point is kept, deleted when turned off or after 7 days without a new place. The time zone of your phone is also shared while place sharing is on, so reminders follow your local time; turn place sharing off and it is no longer sent.'
/** Does this build run the daily background update? Only the Android shell 2.8.0 or later has the plugin. */
export const hasBgPlace = (): boolean => isNativeAndroid() && shellAtLeast('2.8.0')
export const placePrivacy = (): string => (hasBgPlace() ? PLACE_PRIVACY_BG : PLACE_PRIVACY)

/** The Family feed (D-127, D-134): shown only while the feed flag is on. Mirrored in public/privacypolicy.html. */
export const FEED_PRIVACY = 'The Family feed is off by default. For each person, and each kind (blood pressure, lab results, photos, check-ins), the person switches that kind on for themself, and for a family member without a login the family owner may switch it on. Only the kinds switched on are shown to the family in the feed, and each can be switched off any time in Me, Privacy. The family place is separate and is not part of the feed.'

export const PROCESSORS: { name: string; what: string }[] = [
  { name: 'Supabase', what: 'your records and family messages, and the map files the Safety maps and the Rescue map read from the family\'s own project (it sees your internet address and which map file; when a hazard level is read online, also which part of the file, which shows your area to within about 10 km)' },
  { name: 'Open-Meteo and Windy', what: 'weather forecast, air quality (air-quality-api.open-meteo.com) and live map; your place rounded to about 1 km. With Weather blend (on by default; Labs turns it off), Bantay\'s own server also asks MET Norway and, when the family has set up a key, OpenWeather for the same rounded place (never your name); they see the server\'s internet address, not yours' },
  { name: 'ExchangeRate-API (open.er-api.com)', what: 'the US dollar rate on Today, once a day; it receives no name, place or health data and sees your internet address' },
  { name: 'Wikipedia', what: 'the "On this day" facts in Discover; it receives today\'s date only, never your name or place' },
  { name: 'Wikimedia Commons and news sites', what: 'recipe photos load from Wikimedia Commons, and a news story\'s picture loads from the site that published it, when its card shows; each sees your internet address, never your name' },
  { name: 'YouTube', what: 'picture previews load when a video card shows, so YouTube sees your internet address; the video loads only when you tap' },
  { name: 'Love Radio, Easy Rock, DZRH, Home Radio and Magic 89.9', what: 'only when you tap Play on a radio card; the station sees your internet address. Love Radio, Easy Rock and DZRH stream from their own servers, Home Radio from radioca.st and Magic 89.9 from Triton (streamtheworld.com)' },
  { name: 'OpenStreetMap', what: 'street map pictures on the Safety maps, the Rescue map and the Family map. Offline maps are on by default: the Safety maps use the area map for Bohol and South Cotabato once it is on the phone, and these pictures are used when a Safety map opens outside Bohol and South Cotabato, opens zoomed out, or before the area map is on the phone; the choice is made when the map opens, so after panning away they stay as they started. With Labs, Offline maps off, every map uses them. It sees your internet address and the area shown. Barangay names on Today, Safety and Weather come from OpenStreetMap place names (© OpenStreetMap contributors) kept in small files on the phone: the app downloads the file for your one-degree square (about 110 km wide) from its own host, Cloudflare Pages, which sees your internet address and that square (near its edge, also the square next to it), then reads it offline.' },
  { name: 'Ventusky, HazardHunterPH and PAGASA PANaHON', what: 'the map panels in Safety, only after you open a panel; Ventusky gets the map centre rounded to about 1 km, the other two get no place from the app; each sees your internet address and anything you type in its panel' },
  { name: 'MedlinePlus', what: 'plain health reads; it receives the condition, medicine or search words you open, never your name' },
  { name: 'OpenRouter', what: 'the AI models behind Jack and photo reading, only when you use them (zero data retention); what you ask Jack goes through a relay on the family owner\'s own server first; a photo you scan goes from a function on the family\'s own Supabase project straight to OpenRouter, with no relay' },
  { name: 'Google Drive', what: 'copies of papers, in the folder the family owns' },
  { name: 'Firebase Cloud Messaging (Google)', what: 'only in the Android app, when you allow notifications; it carries a short alert in set words, no names or readings, and Google sees your phone\'s push address' },
  { name: 'Cloudflare Pages', what: 'hosting for the app' }
]

const dayLabel = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) }

/** Mockup start-privacy. Reached from Me > Privacy (#privacy). */
export default function PrivacyScreen({ acting = false }: { acting?: boolean }) { // acting comes from App: privacy paths never import viewas (C-6)
  const personId = useSelfPersonId()
  const [agreed, setAgreed] = useState<string | null | undefined>(undefined) // undefined = still reading
  const [ai, setAi] = useKv<boolean>(AI_KEY, true)
  const [until, setUntil] = useKv<string | null>(ERASURE_KEY, null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [, shellKnown] = useState(false) // the shell version is read once at start; re-render when it arrives so the place line matches this build
  useEffect(() => { void initShell().then(() => shellKnown(true)) }, [])

  useEffect(() => {
    if (!personId || acting) { setAgreed(null); return } // no consent write while acting (C-9)
    let live = true
    void ensureConsent(personId).then((c) => { if (live) setAgreed(c.at) })
    return () => { live = false }
  }, [personId, acting])

  const download = async () => {
    setBusy(true); setNote('')
    const r = await exportMyData()
    setBusy(false)
    if (!r.ok) return setNote(r.error)
    setNote(saveJson(`bantay-my-data-${new Date().toISOString().slice(0, 10)}.json`, r.value) ? 'Your file is downloading.' : 'This phone could not save the file.')
  }
  const del = async () => {
    setBusy(true); setNote('')
    const r = await requestErasure()
    setBusy(false); setConfirm(false)
    if (!r.ok) return setNote(r.error)
    setUntil(r.value)
  }
  const undo = async () => {
    setBusy(true); setNote('')
    const r = await cancelErasure()
    setBusy(false)
    if (!r.ok) return setNote(r.error)
    setUntil(null); setNote('Deletion cancelled. Your data stays.')
  }
  const pending = until && !Number.isNaN(Date.parse(until)) ? until : null
  const canUndo = pending !== null && Date.parse(pending) > Date.now()
  const when = consentDate(agreed)

  return (
    <div className="sh sh-me pv">
      <SubHeader title="Privacy" backHref="#me" backLabel="Back to Settings" />
      {!acting && <ConsentNotice />} {/* S16-L5: ensureConsent writes people.consent_at, so never while acting */}

      <div className="sh-card sh-row pv-quiet">
        <span className="pv-tick"><Icon name="check" size={18} /></span>
        <div className="sh-grow">
          <b>{agreed === undefined ? 'Agreement' : when ? `Agreed when you joined, ${when}` : 'Agreement not recorded yet'}</b>
          <div className="sh-sub">{when ? 'You agreed to the Bantay privacy notice.' : 'It is recorded the next time Bantay can reach the server.'}</div>
        </div>
      </div>

      <div className="sh-card sh-list">
        <a className="sh-navrow" href="#sharing">
          <Icon name="users" boxed size={20} />
          <span className="sh-grow"><b>Who can see my records</b><span className="sh-sub sh-blk">Only you, the family owner, and the people you or the family owner share with.</span></span>
          <Icon name="chev" />
        </a>
        <div>
          <Icon name="chat" boxed size={20} />
          <div className="sh-grow">
            <b>Use AI for Jack and photos</b>
            <div className="sh-sub">{ai ? 'On. Sends only the text or photo you share, outside the Philippines. Turn off any time.' : 'Off. Jack and photo reading are paused. Papers you scan from now on are kept, not read by the AI.'}</div>
          </div>
          <button type="button" className="sh-switch" role="switch" aria-checked={ai} aria-label="Use AI for Jack and photos" onClick={() => setAi(!ai)} />
        </div>
        <button type="button" className="sh-navrow" disabled={busy} onClick={() => void download()}>
          <Icon name="dl" boxed size={20} />
          <span className="sh-grow"><b>Download my data</b><span className="sh-sub sh-blk">One file with all records and readings</span></span>
          <Icon name="chev" />
        </button>
        {pending ? (
          <div>
            <Icon name="trash" boxed size={20} />
            <div className="sh-grow">
              <b className="pv-bad">{canUndo ? `Your data will be deleted on ${dayLabel(pending)}` : 'Your data is being deleted'}</b>
              <div className="sh-sub">{canUndo ? 'You can undo until then.' : 'It can no longer be undone.'}</div>
            </div>
            {canUndo && <button type="button" className="sh-pill sh-ghost sh-small" disabled={busy} onClick={() => void undo()}>Undo</button>}
          </div>
        ) : (
          <button type="button" className="sh-navrow" disabled={busy} onClick={() => setConfirm(true)} aria-expanded={confirm}>
            <Icon name="trash" boxed size={20} />
            <span className="sh-grow"><b className="pv-bad">Delete my data</b><span className="sh-sub sh-blk">Deleted after 7 days. You can undo until then.</span></span>
            <Icon name="chev" />
          </button>
        )}
      </div>

      {!acting && <FeedSharesCard selfId={personId} />} {/* shows only with the feed or places flag on; no writes while acting */}
      {familyFeedOn() && <p className="sh-sub pv-place" data-testid="feed-privacy">{FEED_PRIVACY}</p>}
      {familyPlacesOn() && <p className="sh-sub pv-place" data-testid="place-privacy">{placePrivacy()}</p>}

      {confirm && !pending && (
        <div className="sh-card pv-confirm" role="alertdialog" aria-label="Delete my data">
          <b>Delete all your data?</b>
          <div className="sh-sub">Deleted in 7 days. You can undo until then. A log of changes is kept. Drive copies: the folder owner deletes them.</div>
          <button type="button" className="sh-pill pv-danger sh-block" disabled={busy} onClick={() => void del()}>Delete my data in 7 days</button>
          <button type="button" className="sh-pill sh-ghost sh-block" onClick={() => setConfirm(false)}>Keep my data</button>
        </div>
      )}
      {note && <p className="sh-sub sh-note" role="status">{note}</p>}

      <div className="sh-card pv-where">
        <b>Where your data goes</b>
        <ul>{PROCESSORS.map((p) => <li key={p.name}><b>{p.name}</b>: {p.what}</li>)}</ul>
        <p className="sh-sub">Other official sites open in your browser only when you tap their link.</p>
        <a className="pv-link" href="/privacypolicy.html" target="_blank" rel="noopener">Full privacy notice</a>
      </div>
    </div>
  )
}
