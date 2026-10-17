import { db } from '../../db'
import { buildNotification, FALLBACK, HEALTH_IDS, type Built, type TemplateId } from './templates'

export const MAX_NUDGES_PER_DAY = 2
export interface NudgeState {
  day: string
  count: number
}
export interface PushDeps {
  /** Atomically: true and count it if today's health nudges are under max, else false. */
  claimNudge: (day: string, max: number) => Promise<boolean>
  show: (n: Built) => Promise<void>
}

/** Calendar day in Manila (the family's day), whatever the phone's timezone says. */
export const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d)

/** Read and increment inside one Dexie rw transaction so two pushes cannot both pass the cap. */
export const claimNudge = (day: string, max: number) =>
  db.transaction('rw', db.kv, async () => {
    const st = (await db.kv.get('nudge'))?.value as NudgeState | undefined
    const count = st?.day === day ? st.count : 0
    if (count >= max) return false
    await db.kv.put({ key: 'nudge', value: { day, count: count + 1 } })
    return true
  })

/** Safety alerts always show. Health nudges stop after MAX_NUDGES_PER_DAY per device per Manila day;
 *  a capped nudge is dropped silently. A malformed payload naming a health id is dropped, never shown uncapped. */
export async function handlePush(raw: unknown, deps: PushDeps, now = new Date()): Promise<void> {
  const n = buildNotification(raw)
  if (!n) {
    const t = (raw as { t?: unknown } | null)?.t
    if (typeof t === 'string' && HEALTH_IDS.includes(t as TemplateId)) return
    return deps.show(FALLBACK)
  }
  if (n.cls === 'health' && !(await deps.claimNudge(dayKey(now), MAX_NUDGES_PER_DAY))) return
  await deps.show(n)
}
