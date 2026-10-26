/** Shared names of the phone check (lane S3). Local kv keys and the alarm channel; nothing here is sent anywhere. */
export const ALARM_CHANNEL = 'alarms_v1' // versioned: an Android channel cannot be changed after it is created, so a new setup means a new id
export const KEY_ALARM_HEALTH = 'alarms.health' // { at, set, rearmed, ok } written by reminders.ts after every plan
export const KEY_PHONE_CHECK = 'phone.check' // contracts.md: { at, notif_ok, exact_ok, battery_ok, alarms_ok, call_ok, oem } last probe result
export const KEY_PHONE_LATER = 'phonecheck.later' // { at } "Remind me later": a small card stays on Today until the problem is fixed
export const KEY_PHONE_SENT = 'phonecheck.sent' // { sig, at } last phone_health row queued, so an unchanged phone sends one row per 12 h
export const KEY_TOAST_SEEN = 'alarms.toastSeen' // the alarms.health.at the "set again" toast was last shown for

export interface AlarmHealth { at: string; set: number; rearmed: number; ok: boolean; days?: number }
