import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useEffect, useState } from 'react'
import { db } from '../../db'
import { remindPeople } from '../health/reminders'
import { ensureAlarmChannel } from '../phonecheck/channel'
import { ALARM_CHANNEL, KEY_ALARM_HEALTH, type AlarmHealth } from '../phonecheck/keys'
import { selfIdOrCached } from '../sync/profile'
import type { FamilyTask } from './store'

/** Family task reminders on this phone (S28, D-168). One one-shot local notification per open task that has a due day and a reminder time, for the next 30 days.
 *  It rings here only when this phone's alarm rules say so: the person it is for (the assignee; "Everyone" counts as the signed-in person) is in remindPeople AND the last alarm plan was healthy (KEY_ALARM_HEALTH.ok).
 *  Otherwise the time is only shown in the calendar. The text names nothing (B-7): a task title can be anything. Ids live in 1.85e9..1.89e9: above the dose alarms (< 1.8e9), below the snoozes (1.9e9 and up). */
export const TASK_ID_BASE = 1_850_000_000
export const TASK_ID_SPAN = 40_000_000
export const HORIZON_DAYS = 30
const KEY_TASK_IDS = 'family.taskRingIds'

/** True when a reminder for this task rings on this phone. Pure. */
export function ringsHere(assignee: string | null, selfId: string | null, remind: string[], alarmsOk: boolean): boolean {
  const who = assignee ?? selfId
  return alarmsOk && !!who && remind.includes(who)
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

export interface TaskRing { id: number; at: Date; clientId: string }
/** The rings to schedule: open tasks with a day and a time, in the future and inside the horizon, for people who ring here. Ids are probed apart so two never collide. */
export function plannedTaskRings(tasks: FamilyTask[], selfId: string | null, remind: string[], alarmsOk: boolean, now = new Date()): TaskRing[] {
  const end = now.getTime() + HORIZON_DAYS * 86_400_000
  const used = new Set<number>()
  const out: TaskRing[] = []
  for (const t of [...tasks].sort((a, b) => a.clientId.localeCompare(b.clientId))) {
    if (t.done || !t.due || !t.remindAt || !ringsHere(t.assigneePersonId, selfId, remind, alarmsOk)) continue
    const at = new Date(`${t.due}T${t.remindAt}:00`) // the phone's own clock, as the calendar shows it
    if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() || at.getTime() > end) continue
    let id = TASK_ID_BASE + (hash(`${t.clientId}|${t.due}|${t.remindAt}`) % TASK_ID_SPAN)
    while (used.has(id)) id = id + 1 >= TASK_ID_BASE + TASK_ID_SPAN ? TASK_ID_BASE : id + 1
    used.add(id)
    out.push({ id, at, clientId: t.clientId })
  }
  return out
}

let chain: Promise<unknown> = Promise.resolve()
/** Re-arm every wanted task ring (cancel what this feature armed before, schedule the plan again). Native only. Serialised: a change and a resume can both ask. Never throws. */
export function syncTaskReminders(tasks: FamilyTask[], now = new Date()): Promise<void> {
  const next = chain.then(() => once(tasks, now))
  chain = next.catch(() => undefined)
  return next.catch(() => undefined)
}

async function once(tasks: FamilyTask[], now: Date): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const selfId = await selfIdOrCached().catch(() => null)
  const remind = await remindPeople(selfId)
  const health = (await db.kv.get(KEY_ALARM_HEALTH).catch(() => undefined))?.value as AlarmHealth | undefined
  const plan = plannedTaskRings(tasks, selfId, remind, health?.ok === true, now)
  const had = (await db.kv.get(KEY_TASK_IDS).catch(() => undefined))?.value
  const old = Array.isArray(had) ? (had as number[]).filter((n) => typeof n === 'number') : []
  if (old.length) await LocalNotifications.cancel({ notifications: old.map((id) => ({ id })) })
  if (plan.length && (await LocalNotifications.checkPermissions()).display === 'granted') {
    await ensureAlarmChannel()
    await LocalNotifications.schedule({ notifications: plan.map((p) => ({ id: p.id, title: 'Family reminder', body: 'Open Bantay to see it.', channelId: ALARM_CHANNEL, extra: { kind: 'task' }, schedule: { at: p.at, allowWhileIdle: true } })) })
    await db.kv.put({ key: KEY_TASK_IDS, value: plan.map((p) => p.id) })
  } else await db.kv.put({ key: KEY_TASK_IDS, value: [] })
}

/** Whether a reminder for `assignee` would ring on this phone right now (for the Add sheet's one line). False until known. */
export function useRingsHere(assignee: string | null): boolean {
  const [r, setR] = useState(false)
  useEffect(() => {
    let live = true
    void (async () => {
      const selfId = await selfIdOrCached().catch(() => null)
      const health = (await db.kv.get(KEY_ALARM_HEALTH).catch(() => undefined))?.value as AlarmHealth | undefined
      const ok = ringsHere(assignee, selfId, await remindPeople(selfId).catch(() => []), health?.ok === true && Capacitor.isNativePlatform())
      if (live) setR(ok)
    })()
    return () => { live = false }
  }, [assignee])
  return r
}
