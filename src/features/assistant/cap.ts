import { db } from '../../db'

export const DEFAULT_CAP = 30
const KEY = 'assistant.cap'

/** Day in Asia/Manila, YYYY-MM-DD. */
export const manilaDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d)

/** Counts one message. false = the daily limit is reached and nothing was counted. The server enforces the same cap. */
export async function takeMessage(limit = DEFAULT_CAP, now = new Date()): Promise<boolean> {
  const day = manilaDay(now)
  const row = (await db.kv.get(KEY))?.value as { day: string; count: number } | undefined
  const count = row?.day === day ? row.count : 0
  if (count >= limit) return false
  await db.kv.put({ key: KEY, value: { day, count: count + 1 } })
  return true
}
