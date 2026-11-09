import { announceMedia, onOtherMedia } from '../../media/mediaStart'
import { SOS_STARTED_EVENT } from '../../sos/active'
import { STATIONS, type Station } from './stations'

const TOKEN = 'radio' // this player's token for mediaStart

export type RadioState = { id: string | null; status: 'idle' | 'connecting' | 'playing' | 'error' }

// One HTMLAudioElement for the whole app, so only one station can play at a time.
let audio: HTMLAudioElement | null = null
let state: RadioState = { id: null, status: 'idle' }
let last: string | null = null
let tries = 0 // 0 = first address, 1 = the station's second address
let timer: ReturnType<typeof setTimeout> | undefined

/** A stream that stays silent this long counts as failed, so a stuck connection cannot say Connecting for ever. */
export const RADIO_STALL_MS = 15000
const subs = new Set<() => void>()
const set = (s: RadioState) => { state = s; subs.forEach((f) => f()) }

export const getRadioState = (): RadioState => state
export function subscribeRadio(f: () => void): () => void { subs.add(f); return () => { subs.delete(f) } }

const media = (): MediaSession | null => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null)

function handlers(): void {
  const ms = media()
  if (!ms) return
  // A live stream has no pause: pause and stop both drop the connection; play restarts the last station.
  ms.setActionHandler('play', () => { const s = STATIONS.find((x) => x.id === last); if (s) void playStation(s) })
  ms.setActionHandler('pause', stopRadio)
  ms.setActionHandler('stop', stopRadio)
}

function el(): HTMLAudioElement {
  if (audio) return audio
  const a = new Audio()
  a.preload = 'none'
  a.addEventListener('playing', () => { clearTimeout(timer); if (state.id) set({ id: state.id, status: 'playing' }) })
  a.addEventListener('error', failed)
  audio = a
  return a
}

/** A bad or silent address moves to the station's second address if it has one, else the error state. */
function failed(): void {
  clearTimeout(timer)
  const s = STATIONS.find((x) => x.id === state.id)
  if (!s || state.status === 'error') return
  if (tries === 0 && s.alt) { void start(s, 1); return }
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load() }
  set({ id: s.id, status: 'error' })
}

export function playStation(s: Station): Promise<void> {
  announceMedia(TOKEN) // a playing video stops; this player ignores its own start
  return start(s, 0)
}

async function start(s: Station, n: number): Promise<void> {
  const a = el()
  last = s.id
  tries = n
  clearTimeout(timer)
  timer = setTimeout(failed, RADIO_STALL_MS)
  set({ id: s.id, status: 'connecting' })
  a.src = n === 1 && s.alt ? s.alt : s.url
  const ms = media()
  if (ms && typeof MediaMetadata !== 'undefined') ms.metadata = new MediaMetadata({ title: s.name, artist: s.freq, album: 'Live radio' })
  handlers()
  try { await a.play() } catch (e) { if (state.id === s.id && (e as Error)?.name !== 'AbortError') failed() } // AbortError = a newer src replaced this attempt
}

export function stopRadio(): void {
  clearTimeout(timer)
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load() } // load() drops the open stream so no data keeps flowing
  set({ id: null, status: 'idle' })
  const ms = media()
  if (ms) ms.playbackState = 'none'
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopRadio)
  window.addEventListener(SOS_STARTED_EVENT, stopRadio)
  onOtherMedia(TOKEN, stopRadio) // a video started
}

/** Test hook: forget the element and state. */
export function resetRadioForTests(): void { clearTimeout(timer); audio = null; state = { id: null, status: 'idle' }; last = null; tries = 0 }
