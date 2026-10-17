import { buildNotification, FALLBACK, type Built } from './templates'

export const MAX_NUDGES_PER_DAY = 2
export interface NudgeState {
  day: string
  count: number
}
export interface PushDeps {
  getNudge: () => Promise<NudgeState | undefined>
  setNudge: (v: NudgeState) => Promise<void>
  show: (n: Built) => Promise<void>
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** Safety alerts always show. Health nudges stop after MAX_NUDGES_PER_DAY per device per local day.
 *  A capped nudge is dropped silently. */
export async function handlePush(raw: unknown, deps: PushDeps, now = new Date()): Promise<void> {
  const n = buildNotification(raw) ?? FALLBACK
  if (n.cls === 'health') {
    const day = dayKey(now)
    const st = await deps.getNudge()
    const count = st?.day === day ? st.count : 0
    if (count >= MAX_NUDGES_PER_DAY) return
    await deps.setNudge({ day, count: count + 1 })
  }
  await deps.show(n)
}
