import { announceMedia, onOtherMedia } from '../../media/mediaStart'
import { SOS_STARTED_EVENT } from '../../sos/active'
import { STATIONS, type Station } from './stations'

const TOKEN = 'radio' // this player's token for mediaStart

export type RadioState = { id: string | null; status: 'idle' | 'connecting' | 'playing' | 'error' }

// One HTMLAudioElement for the whole app, so only one station can play at a time.
let audio: HTMLAudioElement | null = null
let state: RadioState = { id: null, status: 'idle' }
let last: string | null = null
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
  a.addEventListener('playing', () => { if (state.id) set({ id: state.id, status: 'playing' }) })
  a.addEventListener('error', () => { if (state.id) set({ id: state.id, status: 'error' }) })
  audio = a
  return a
}

export async function playStation(s: Station): Promise<void> {
  const a = el()
  last = s.id
  announceMedia(TOKEN) // a playing video stops; this player ignores its own start
  set({ id: s.id, status: 'connecting' })
  a.src = s.url
  const ms = media()
  if (ms && typeof MediaMetadata !== 'undefined') ms.metadata = new MediaMetadata({ title: s.name, artist: s.freq, album: 'Live radio' })
  handlers()
  try { await a.play() } catch { if (state.id === s.id) set({ id: s.id, status: 'error' }) }
}

export function stopRadio(): void {
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
export function resetRadioForTests(): void { audio = null; state = { id: null, status: 'idle' }; last = null }
