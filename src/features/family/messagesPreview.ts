import type { Msg } from './messagesApi'
import { stamp } from './messagesLogic'
import type { FamilyPerson } from './roster'

const textOf = (m: Msg) => m.kind === 'voice' ? 'Voice note' : m.kind === 'photo' ? 'Photo' : m.kind === 'file' ? (m.name ?? 'File') : m.kind === 'kudos' ? 'Sent a heart' : (m.body ?? '')

/** The Messages row's words: the newest message with its sender, and how many arrived from others since the chat was last opened (one count, the rows it summarises, ML-34).
 *  Nothing yet = "No alerts yet" (the feed is read-only alerts and check-ins, D-168). */
export function messagesPreview(msgs: Msg[], people: FamilyPerson[], seen: string | null): { sub: string; unread: number } {
  const last = msgs[msgs.length - 1]
  if (!last) return { sub: 'No alerts yet', unread: 0 }
  const who = last.mine ? 'You' : (people.find((p) => p.id === last.senderPersonId)?.name.trim().split(/\s+/)[0] ?? 'Family')
  const t = stamp(last.createdAt)
  const seenAt = seen ? Date.parse(seen) : NaN // parsed, not string-compared: the server writes '+00:00', the phone 'Z'
  const unread = msgs.filter((m) => !m.mine && !(Date.parse(m.createdAt) <= seenAt)).length
  return { sub: `${who}: ${textOf(last)}${t ? ` · ${t}` : ''}`, unread }
}
