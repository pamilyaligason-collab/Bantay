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
  /** Is the carer's "Quiet hours" setting on (kv quiet.on, default on)? Used only for carer alerts. */
  quietOn?: () => Promise<boolean>
}

export const MAX_CARER_PER_DAY = 6
export const readQuietOn = async () => (await db.kv.get('quiet.on').catch(() => undefined))?.value !== false
/** 10 PM to 6 AM Manila, the hours the Me screen promises. */
export const inQuietHours = (d: Date) => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).format(d)) % 24; return h >= 22 || h < 6 }

/** Own small cap for carer alerts (their own kv key, so health nudges never use it up). */
export const claimCarer = (day: string, max: number) =>
  db.transaction('rw', db.kv, async () => {
    const st = (await db.kv.get('nudge.carer'))?.value as NudgeState | undefined
    const count = st?.day === day ? st.count : 0
    if (count >= max) return false
    await db.kv.put({ key: 'nudge.carer', value: { day, count: count + 1 } })
    return true
  })

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
    if (typeof t === 'string' && (t === 'dose_watch' || HEALTH_IDS.includes(t as TemplateId))) return
    return deps.show(FALLBACK)
  }
  if (n.cls === 'health' && !(await deps.claimNudge(dayKey(now), MAX_NUDGES_PER_DAY))) return
  if (n.cls === 'carer') {
    // not the shared health cap: a claimed alert for a family member must not be dropped because a reminder used it up. Own cap of 6 a day.
    if (!(await claimCarer(dayKey(now), MAX_CARER_PER_DAY))) return
    if (inQuietHours(now) && (await (deps.quietOn ?? readQuietOn)())) return deps.show({ ...n, silent: true })
  }
  await deps.show(n)
}
