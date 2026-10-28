import type { AlertRow } from '../notify/store'
import { useAlertRows } from '../notify/useAlerts'

/** The newest unseen family SOS that nobody cancelled, or null. `rows` are the unexpired alert rows, newest first. */
export function pickSos(rows: AlertRow[]): AlertRow | null {
  const cancelled = (r: AlertRow) => rows.some((c) => c.kind === 'sos_cancel' && !!r.ref && !!c.ref && c.ref.startsWith(`${r.ref}:`))
  return rows.find((r) => r.kind === 'sos' && r.template === 'family_sos' && r.seenAt == null && !cancelled(r)) ?? null
}

/** true while a family SOS banner is up: Jack Jack stays off that screen (D-91). Lives here, not in IncomingSos.tsx, so Today does not load the SOS call plugin. */
export const useSosActive = () => pickSos(useAlertRows()) != null

