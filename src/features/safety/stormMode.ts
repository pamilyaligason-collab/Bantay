import type { Alert } from './alerts'

/** Storm mode (mockup safety-storm): a PAGASA wind signal row from alerts-ingest, unexpired (the pull drops expired rows) and not older than a day.
 *  A stale row (the feed could not be reached on the last run) still counts: the last known signal is safer to show than silence. */
export function liveSignals(alerts: Alert[], now: number = Date.now()): Alert[] {
  return alerts
    .filter((a) => a.kind === 'tcws' && signalOf(a) !== null && now - Date.parse(a.issuedAt) < 24 * 3_600_000)
    .sort((a, b) => (signalOf(b) ?? 0) - (signalOf(a) ?? 0) || b.issuedAt.localeCompare(a.issuedAt))
}

/** 1-5 from "Signal No. 3"; null when the level is missing (a lifted signal has no level). */
export function signalOf(a: Pick<Alert, 'level'>): number | null {
  const n = /Signal No\. ([1-5])/.exec(a.level ?? '')?.[1]
  return n ? Number(n) : null
}

/** The storm name inside a row title: "Wind Signal No. 2 for Dampas, Tagbilaran City: Typhoon Rosal (CHAMPI)" -> "Typhoon Rosal (CHAMPI)". */
export const stormTitle = (a: Pick<Alert, 'title'>): string => a.title.split(': ').slice(1).join(': ') || a.title

export const PAGASA_CREDIT = 'PAGASA, CC BY 4.0'
/** The one line under Warnings: where the alerts come from and what happens when a source is down. */
export const WARNINGS_SOURCE_LINE = `From PAGASA (${PAGASA_CREDIT}), GDACS, Open-Meteo. Checked every 10 min.`

/** The phone check result (kv phone.check, written by the phone check). null = unknown, never counted as a problem. */
export interface PhoneCheck { notif_ok?: boolean | null; exact_ok?: boolean | null; battery_ok?: boolean | null; alarms_ok?: boolean | null; call_ok?: boolean | null }
export type Health = 'ok' | 'fix' | 'unknown'

const healthOf = (v: (boolean | null | undefined)[]): Health => (v.some((x) => x === false) ? 'fix' : v.length && v.every((x) => x === true) ? 'ok' : 'unknown')
export const alarmsHealth = (c: PhoneCheck | null): Health => (c ? healthOf([c.notif_ok, c.exact_ok, c.battery_ok, c.alarms_ok]) : 'unknown')
export const callHealth = (c: PhoneCheck | null): Health => (c ? healthOf([c.call_ok]) : 'unknown')

/** How many phone settings need fixing: the hub tile shows a count only while this is above zero. */
export const phoneAlertCount = (c: PhoneCheck | null): number => [alarmsHealth(c), callHealth(c)].filter((h) => h === 'fix').length

/** The storm a roll call and its shared checklist belong to: the id of the live signal (safety_alerts.id), so every phone on the same signal agrees. */
export const stormRef = (a: Pick<Alert, 'id'>): string => a.id

/** The storm part of a PAGASA signal id (`pagasa-tcws-<storm>-<zone>`): every zone row of one storm shares it. Other ids are their own key. */
export const stormKey = (a: Pick<Alert, 'id'>): string => (a.id.startsWith('pagasa-tcws-') ? a.id.slice(0, a.id.lastIndexOf('-')) : a.id)
