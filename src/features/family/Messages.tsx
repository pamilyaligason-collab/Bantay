import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../shell/Icon'
import { listMessages, listQueued, removeMessage, sendAttachment, sendText, type Msg } from './messagesApi'
import { BODY_MAX, classifyFile, messengerHref, mmss, pickRecorderMime, stamp, VOICE_MAX_S, shortName } from './messagesLogic'
import { stripToJpeg } from './memoriesLogic'
import type { FamilyPerson } from './roster'
import { dial } from './roster'
import Sheet from './Sheet'
import './messages.css'

type View = { kind: 'loading' } | { kind: 'ready'; msgs: Msg[] } | { kind: 'not_set_up' } | { kind: 'unavailable' } | { kind: 'offline' } | { kind: 'failed' }
const WORDS = { not_set_up: 'Messages are not set up yet', unavailable: 'Messages need you to be signed in', offline: 'Messages show when you are online', failed: 'Messages could not load. Try again in a moment.' } as const
const POLL_MS = 8000
const first = (n: string) => n.trim().split(/\s+/)[0] || n

/** The family thread, opened from a member's bubble. One shared thread for everyone on Bantay (migration 0027); the buttons on top are about the person you tapped:
 *  Call, and Messenger for video (video is not built in). Text, voice note (max 60 s), photo or file (max 10 MB). New messages arrive by checking every 8 seconds while open. */
export default function Messages({ who, people, onClose, onOpenPage, nudge, inline = false }: { who: FamilyPerson; people: FamilyPerson[]; onClose: () => void; onOpenPage: () => void; nudge: { text: string; href: string } | null; inline?: boolean }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [rec, setRec] = useState<{ secs: number } | null>(null)
  const [voice, setVoice] = useState<{ blob: Blob; secs: number; ext: 'webm' | 'm4a' | 'ogg'; mime: string; url: string } | null>(null)
  const [queued, setQueued] = useState<Msg[]>([])
  const [gone, setGone] = useState<Msg | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const mr = useRef<{ stop: () => void; cancel: () => void } | null>(null)
  const count = useRef(0)

  const load = useCallback(async () => {
    const r = await listMessages()
    setView(r.ok ? { kind: 'ready', msgs: r.data } : { kind: r.error })
    setQueued(await listQueued(new Set(r.ok ? r.data.flatMap((m) => (m.clientId ? [m.clientId] : [])) : [])))
  }, [])
  useEffect(() => {
    void load()
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, POLL_MS)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => { if (view.kind === 'ready' && view.msgs.length !== count.current) { count.current = view.msgs.length; end.current?.scrollIntoView?.({ block: 'end' }) } }, [view])
  useEffect(() => () => { mr.current?.cancel() }, [])
  useEffect(() => () => { if (voice) URL.revokeObjectURL(voice.url) }, [voice])

  const failWord = (e: 'unavailable' | 'not_set_up' | 'offline' | 'failed') => (e === 'offline' ? 'Needs signal. Try again when you are connected.' : e === 'not_set_up' ? WORDS.not_set_up : 'It did not send. Try again.')
  const done = async (p: Promise<{ ok: true; data: null } | { ok: false; error: 'unavailable' | 'not_set_up' | 'offline' | 'failed' }>) => {
    setBusy(true); setNote('')
    const r = await p
    setBusy(false)
    if (r.ok) { await load(); return true }
    setNote(failWord(r.error))
    return false
  }

  const send = async () => { if (text.trim() && (await done(sendText(text)))) setText('') }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const c = classifyFile(f)
    if ('error' in c) { setNote(c.error === 'big' ? 'That file is over 10 MB. Send a smaller one, or use Messenger.' : 'Bantay can send pictures, PDF, text and Word files only.'); return }
    if (c.kind === 'photo') {
      const jpeg = await stripToJpeg(f) // the original never leaves this function; location and camera details are gone
      if (!jpeg) { setNote('That is not a picture Bantay can read.'); return }
      await done(sendAttachment(jpeg, { kind: 'photo', ext: 'jpg', mime: 'image/jpeg' }))
    } else await done(sendAttachment(f, { kind: 'file', ext: c.ext, mime: c.mime, name: f.name }))
  }

  const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const startRec = async () => {
    setNote('')
    const pick = canRecord ? pickRecorderMime((m) => MediaRecorder.isTypeSupported(m)) : null
    if (!pick) { setNote('Voice notes do not work on this phone. Type a message, or use Messenger.'); return }
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
    } catch { setNote('Bantay cannot use the microphone. Allow it in your phone settings, or type instead.') }
  }
  const sendVoice = async () => { if (voice && (await done(sendAttachment(voice.blob, { kind: 'voice', ext: voice.ext, mime: voice.mime, durationS: voice.secs })))) setVoice(null) }

  const nameOf = (m: Msg) => (m.mine ? 'You' : first(people.find((p) => p.id === m.senderPersonId)?.name ?? 'Family'))
  const tel = dial(who.phone)
  const mess = messengerHref(null)

  const body = (
    <>
      {inline ? <div><h2 className="h2">Family messages</h2><p className="sub msg-lead">{people.length} {people.length === 1 ? 'person' : 'people'}, one shared chat</p></div> : <p className="sub msg-lead">One private thread for the whole family on Bantay.</p>}
      <div className="msg-actions">
        {tel && !who.isMe && <a className="pill" href={`tel:${tel}`} aria-label={`Call ${first(who.name)}`}><Icon name="phone" size={20} />Call</a>}
        <a className="pill" href={mess.href} target="_blank" rel="noreferrer"><Icon name="out" size={20} />{mess.label}</a>
        {!who.isMe && <button type="button" className="pill" onClick={onOpenPage}>{first(who.name)}&apos;s page</button>}
      </div>
      {nudge && <a className="fm-nudge msg-nudge" href={nudge.href}>{nudge.text}</a>}

      {view.kind === 'loading' && <p className="sub" role="status">Loading</p>}
      {view.kind !== 'loading' && view.kind !== 'ready' && <p role="status" data-testid="msg-state"><b>{WORDS[view.kind]}</b></p>}
      {(view.kind === 'ready' || queued.length > 0) && (
        <ul className="msg-list" aria-label="Family messages" data-testid="msg-list">
          {view.kind === 'ready' && view.msgs.length === 0 && queued.length === 0 && <li className="sub msg-empty">No messages yet. Say hello.</li>}
          {[...(view.kind === 'ready' ? view.msgs : []), ...queued].map((m) => (
            <li key={m.id} className={`msg ${m.mine ? 'me' : 'them'}`}>
              <span className="msg-by">{nameOf(m)}<time> {stamp(m.createdAt) ?? ''}</time>{m.queued && <b className="msg-q" data-testid="msg-queued"> Queued</b>}</span>
              {m.kind === 'text' && <p>{m.body}</p>}
              {m.kind === 'voice' && (m.url ? <audio controls preload="none" src={m.url} aria-label={`Voice note from ${nameOf(m)}, ${m.durationS ? mmss(m.durationS) : ''}`} /> : <p className="sub">Voice note</p>)}
              {m.kind === 'photo' && (m.url ? <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt={`Photo from ${nameOf(m)}`} loading="lazy" /></a> : <p className="sub">Photo</p>)}
              {m.kind === 'file' && (m.url ? <a className="msg-file" href={m.url} target="_blank" rel="noreferrer" download={shortName(m.name)}><Icon name="pdf" size={22} />{shortName(m.name)}</a> : <p className="sub">{shortName(m.name)}</p>)}
              {m.kind === 'recap' && <p>{m.body}</p>}
              {m.kind === 'kudos' && (m.url ? <audio controls preload="none" src={m.url} aria-label={`Voice kudos from ${nameOf(m)}, ${m.durationS ? mmss(m.durationS) : ''}`} /> : <p><span aria-hidden="true">{'♥'} </span>Sent a heart</p>)}
              {m.mine && !m.queued && <button type="button" className="msg-del" onClick={() => setGone(m)} aria-label="Delete this message"><Icon name="trash" size={18} /></button>}
            </li>
          ))}
          <div ref={end} />
        </ul>
      )}

      {gone && (
        <div className="msg-confirm" role="alertdialog" aria-label="Delete this message?">
          <p>Delete this message for everyone?</p>
          <div className="msg-actions">
            <button type="button" className="pill" onClick={() => setGone(null)}>Keep it</button>
            <button type="button" className="pill msg-danger" onClick={() => { const g = gone; setGone(null); void done(removeMessage(g.id)) }}>Delete</button>
          </div>
        </div>
      )}

      {rec && (
        <div className="msg-rec" role="status"><span className="msg-dot" aria-hidden="true" />Recording {mmss(rec.secs)} of {mmss(VOICE_MAX_S)}
          <button type="button" className="pill" onClick={() => mr.current?.stop()}>Stop</button>
          <button type="button" className="pill" onClick={() => { mr.current?.cancel() }}>Cancel</button></div>
      )}
      {voice && !rec && (
        <div className="msg-rec">
          <audio controls src={voice.url} aria-label="Your voice note" />
          <button type="button" className="pill primary" disabled={busy} onClick={() => void sendVoice()}>Send voice note</button>
          <button type="button" className="pill" onClick={() => setVoice(null)}>Discard</button>
        </div>
      )}
      {note && <p className="fm-warn" role="alert">{note}</p>}

      <div className="msg-qr" role="group" aria-label="Quick replies">
        {['All good', 'On my way'].map((q) => <button key={q} type="button" className="chip" disabled={busy} onClick={() => void done(sendText(q))}>{q}</button>)}
      </div>
      <div className="msg-compose">
        <label htmlFor="msg-text" className="msg-sr">Message</label>
        <textarea id="msg-text" rows={2} maxLength={BODY_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" />
        <div className="msg-tools">
          <button type="button" className="msg-ic" aria-label="Record a voice note" onClick={() => void startRec()} disabled={!!rec || busy}><Icon name="mic" size={24} /></button>
          <button type="button" className="msg-ic" aria-label="Attach a photo or file" onClick={() => file.current?.click()} disabled={busy}><Icon name="plus" size={24} /></button>
          <button type="button" className="btn msg-send" onClick={() => void send()} disabled={busy || !text.trim()}><Icon name="send" size={20} />Send</button>
        </div>
        <input ref={file} type="file" accept="image/*,.pdf,.txt,.doc,.docx" hidden data-testid="msg-file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
        <p className="sub msg-fine">Texts wait on your phone until there is signal. Voice notes (up to 1 minute) and files (up to 10 MB) need signal. For video, use Messenger.</p>
      </div>
    </>
  )
  return inline ? <section className="msg-inline" aria-label="Family messages">{body}</section> : <Sheet title={who.isMe ? 'Family messages' : `Message ${first(who.name)}`} onClose={onClose}>{body}</Sheet>
}
