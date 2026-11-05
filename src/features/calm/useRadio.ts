import { useEffect, useRef, useState } from 'react'
import { announceMedia, onOtherMedia } from '../media/mediaStart'
import { SOS_STARTED_EVENT } from '../sos/active'

const RADIO = 'radio' // this player's token for mediaStart

export type RadioStation = { id: string; title: string; sub: string; site: string; streams: readonly string[] }
export type RadioNow = { id: string; state: 'loading' | 'playing' | 'error' } | null

/** A stream that stays silent this long counts as failed, so a stuck connection cannot say Loading for ever. */
export const RADIO_STALL_MS = 15000

function silence(a: HTMLAudioElement | null) {
  if (!a?.hasAttribute('src')) return
  a.pause()
  a.removeAttribute('src')
  a.load() // drops the connection; a paused live stream would keep downloading
}

/** The one audio element behind the radio cards. Nothing is requested before start(); each station's addresses are tried in turn, then the error state. No request headers are set, ever. */
export function useRadio() {
  const audio = useRef<HTMLAudioElement>(null)
  const [now, setNow] = useState<RadioNow>(null)
  const cur = useRef<{ station: RadioStation; at: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const armStall = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(next, RADIO_STALL_MS)
  }
  const stop = () => {
    clearTimeout(timer.current)
    cur.current = null
    silence(audio.current)
    setNow(null)
  }
  const fail = (station: RadioStation) => {
    stop()
    setNow({ id: station.id, state: 'error' })
  }
  const tryAt = (station: RadioStation, at: number) => {
    const a = audio.current
    const src = station.streams[at]
    if (!a) return
    if (src === undefined) { fail(station); return }
    const attempt = { station, at }
    cur.current = attempt
    setNow({ id: station.id, state: 'loading' })
    armStall()
    a.src = src
    // a bad address also fires the element's error event, which moves on; only a refused start has no event of its own
    void a.play().catch((e: unknown) => { if (cur.current === attempt && (e as Error)?.name === 'NotAllowedError') fail(station) })
  }
  function next() {
    if (cur.current) tryAt(cur.current.station, cur.current.at + 1)
  }
  const toggle = (station: RadioStation) => {
    if (now?.id === station.id && now.state !== 'error') { stop(); return }
    stop()
    announceMedia(RADIO)
    tryAt(station, 0)
  }

  useEffect(() => {
    const a = audio.current // the ref is already empty when the cleanup runs
    const hush = () => stop()
    window.addEventListener(SOS_STARTED_EVENT, hush)
    const off = onOtherMedia(RADIO, hush) // a video started
    return () => {
      window.removeEventListener(SOS_STARTED_EVENT, hush)
      off()
      clearTimeout(timer.current)
      cur.current = null
      silence(a) // an element taken out of the page keeps playing unless told to stop
    }
  }, [])

  const events = {
    onPlaying: () => {
      if (!cur.current) return
      clearTimeout(timer.current)
      setNow({ id: cur.current.station.id, state: 'playing' })
    },
    onWaiting: () => {
      if (!cur.current) return
      armStall()
      setNow({ id: cur.current.station.id, state: 'loading' })
    },
    onError: next,
    onEnded: next
  }
  return { audio, now, toggle, stop, events }
}
