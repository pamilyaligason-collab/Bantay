import { useEffect, useRef, useState } from 'react'
import { pickRecorderMime, VOICE_MAX_S } from './messagesLogic'

export type VoiceClip = { blob: Blob; secs: number; ext: 'webm' | 'm4a' | 'ogg'; mime: string; url: string }

/** The voice-note recorder (max 60 s), extracted unchanged from Messages so the SOS family sheet records the same way.
 *  `onNote('')` clears a message, `onNote(text)` shows one. `rec` is set while recording, `voice` holds the finished clip until it is sent or discarded. */
export function useVoiceNote(onNote: (text: string) => void) {
  const [rec, setRec] = useState<{ secs: number } | null>(null)
  const [voice, setVoice] = useState<VoiceClip | null>(null)
  const mr = useRef<{ stop: () => void; cancel: () => void } | null>(null)
  useEffect(() => () => { mr.current?.cancel() }, [])
  useEffect(() => () => { if (voice) URL.revokeObjectURL(voice.url) }, [voice])

  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const startRec = async () => {
    onNote('')
    const pick = canRecord ? pickRecorderMime((m) => MediaRecorder.isTypeSupported(m)) : null
    if (!pick) { onNote('Voice notes do not work on this phone. Type a message, or use Messenger.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream, { mimeType: pick.mime })
      const chunks: Blob[] = []
      const t0 = Date.now()
      let cancelled = false
      const stopTracks = () => stream.getTracks().forEach((t) => t.stop())
      const tick = setInterval(() => { const s = (Date.now() - t0) / 1000; setRec({ secs: s }); if (s >= VOICE_MAX_S) r.stop() }, 250)
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      r.onstop = () => {
        clearInterval(tick); stopTracks(); setRec(null); mr.current = null
        if (cancelled || !chunks.length) return
        const blob = new Blob(chunks, { type: pick.mime.split(';')[0] })
        setVoice({ blob, secs: Math.min(VOICE_MAX_S, Math.max(1, (Date.now() - t0) / 1000)), ext: pick.ext, mime: blob.type || pick.mime.split(';')[0], url: URL.createObjectURL(blob) })
      }
      mr.current = { stop: () => r.state !== 'inactive' && r.stop(), cancel: () => { cancelled = true; if (r.state !== 'inactive') r.stop(); else stopTracks() } }
      r.start()
      setRec({ secs: 0 })
    } catch { onNote('Bantay cannot use the microphone. Allow it in your phone settings, or type instead.') }
  }
  return { rec, voice, setVoice, canRecord, startRec, stop: () => mr.current?.stop(), cancel: () => mr.current?.cancel() }
}
