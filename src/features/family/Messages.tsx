import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../shell/Icon'
import { EmptyState } from '../look'
import { listMessages, type Msg } from './messagesApi'
import { mmss, stamp, shortName } from './messagesLogic'
import type { FamilyPerson } from './roster'
import './messages.css'

type View = { kind: 'loading' } | { kind: 'ready'; msgs: Msg[] } | { kind: 'not_set_up' } | { kind: 'unavailable' } | { kind: 'offline' } | { kind: 'failed' }
const WORDS = { not_set_up: 'Messages are not set up yet', unavailable: 'Messages need you to be signed in', offline: 'Messages show when you are online', failed: 'Messages could not load. Try again in a moment.' } as const
const POLL_MS = 8000
const first = (n: string) => n.trim().split(/\s+/)[0] || n

/** The family feed inside Bantay, read only (S28, D-168): Bantay's alerts and check-ins, plus what was already in the thread. Nobody writes here any more; people talk in Messenger or WhatsApp
 *  (the per-person buttons above it). New items arrive by checking every 8 seconds while it is open. */
export default function Messages({ people }: { people: FamilyPerson[] }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const end = useRef<HTMLDivElement>(null)
  const count = useRef(0)

  const load = useCallback(async () => {
    const r = await listMessages()
    setView(r.ok ? { kind: 'ready', msgs: r.data } : { kind: r.error })
  }, [])
  useEffect(() => {
    void load()
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') void load() }, POLL_MS)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => { if (view.kind === 'ready' && view.msgs.length !== count.current) { count.current = view.msgs.length; end.current?.scrollIntoView?.({ block: 'end' }) } }, [view])

  const nameOf = (m: Msg) => (m.mine ? 'You' : first(people.find((p) => p.id === m.senderPersonId)?.name ?? 'Family'))
  const msgs = view.kind === 'ready' ? view.msgs : []
  return (
    <section className="msg-inline" aria-label="Family feed">
      {view.kind === 'loading' && <p className="sub" role="status">Loading</p>}
      {view.kind !== 'loading' && view.kind !== 'ready' && <p role="status" data-testid="msg-state"><b>{WORDS[view.kind]}</b></p>}
      {view.kind === 'ready' && msgs.length === 0 && <EmptyState jack="family-hug" title="Nothing here yet" body="Alerts and check-ins from your family show here." />}
      {msgs.length > 0 && (
        <ul className="msg-list" aria-label="Alerts and check-ins" data-testid="msg-list">
          {msgs.map((m) => (
            <li key={m.id} className={`msg ${m.mine ? 'me' : 'them'}`}>
              <span className="msg-by">{nameOf(m)}<time> {stamp(m.createdAt) ?? ''}</time></span>
              {m.kind === 'text' && <p>{m.body}</p>}
              {m.kind === 'voice' && m.body && <span className="msg-for" data-testid="msg-for">{m.body}</span>}
              {m.kind === 'voice' && (m.url ? <audio controls preload="none" src={m.url} aria-label={`Voice note from ${nameOf(m)}, ${m.durationS ? mmss(m.durationS) : ''}`} /> : <p className="sub">Voice note</p>)}
              {m.kind === 'photo' && (m.url ? <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt={`Photo from ${nameOf(m)}`} loading="lazy" /></a> : <p className="sub">Photo</p>)}
              {m.kind === 'file' && (m.url ? <a className="msg-file" href={m.url} target="_blank" rel="noreferrer" download={shortName(m.name)}><Icon name="pdf" size={22} />{shortName(m.name)}</a> : <p className="sub">{shortName(m.name)}</p>)}
              {m.kind === 'recap' && <p>{m.body}</p>}
              {m.kind === 'kudos' && (m.url ? <audio controls preload="none" src={m.url} aria-label={`Voice kudos from ${nameOf(m)}, ${m.durationS ? mmss(m.durationS) : ''}`} /> : <p><span aria-hidden="true">{'♥'} </span>Sent a heart</p>)}
            </li>
          ))}
          <div ref={end} />
        </ul>
      )}
    </section>
  )
}
