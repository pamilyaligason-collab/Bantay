import { useEffect } from 'react'
import { enqueue } from '../../db'
import { supabase } from '../auth/client'
import { getAccessToken } from '../auth/session'

// Usage insights (contract D-16..D-19). PRIVACY: only these fixed names are ever recorded. No health values, no free text.
// Anything not on the list is dropped, so a reading like "bp_150" or a name with a digit cannot get through.
export const EVENT_NAMES = {
  screen: ['today', 'health', 'records', 'family', 'safety', 'admin', 'me', 'notif', 'docs', 'ask'],
  action: ['alerts_on', 'alerts_off', 'sensors_on', 'sensors_off', 'import_started', 'import_done', 'reading_added', 'dose_logged', 'sos_sent',
    // session 6 (docs/session-6/PART-2.md section 4): habit targets H1-H8
    'dose_skipped', 'med_added', 'med_edited', 'med_paused', 'med_deleted', 'reminder_opened', 'checkin_done',
    'card_seen_my_week', 'card_seen_family_line', 'weather_opened', 'weather_opened_action', 'records_confirmed'],
  error: ['sync_failed', 'import_failed', 'push_failed', 'assistant_failed']
} as const
export type EventKind = keyof typeof EVENT_NAMES

const BUILD_YEAR = 2026 // a device clock before this year is wrong
const version = (): string => {
  const v = String(import.meta.env.VITE_APP_VERSION ?? 'dev')
  return /^[0-9a-z.+-]{1,20}$/.test(v) ? v : 'dev'
}

/** Queue one usage event. Returns false (and queues nothing) when kind or name is not on the allowlist. */
export async function track(kind: string, name: string): Promise<boolean> {
  const names: readonly string[] | undefined = Object.hasOwn(EVENT_NAMES, kind) ? EVENT_NAMES[kind as EventKind] : undefined
  if (!names?.includes(name)) return false
  try {
    if (!supabase || !(await getAccessToken())) return false // nobody to sync for: signed out or not configured
    // clientAt: when the tap happened (an offline phone syncs later; `at` on the server is arrival time)
    // A wrong device clock must not make the server refuse the row: leave clientAt out (the server stamps arrival time).
    const now = new Date()
    const y = now.getFullYear()
    const payload: Record<string, unknown> = { kind, name, appVersion: version() }
    if (y >= BUILD_YEAR && y <= 2100) payload.clientAt = now.toISOString()
    await enqueue('usage_events', 'insert', payload)
    return true
  } catch {
    return false // tracking must never break the app
  }
}

/** The orchestrator calls this once in App with the current tab id: useTrackScreen(tab.id). */
export function useTrackScreen(tab: string): void {
  useEffect(() => { void track('screen', tab) }, [tab])
}
