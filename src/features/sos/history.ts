import { db } from '../../db'

export const HISTORY_KEY = 'sos.history'
export interface SosEvent { at: number; lat: number; lon: number; gps: boolean; texted: boolean }

/** Last 10 SOS, newest first. Kept on this phone only. */
export async function addHistory(e: SosEvent): Promise<void> {
  const cur = (await db.kv.get(HISTORY_KEY).catch(() => undefined))?.value
  await db.kv.put({ key: HISTORY_KEY, value: [e, ...(Array.isArray(cur) ? cur : [])].slice(0, 10) })
}
