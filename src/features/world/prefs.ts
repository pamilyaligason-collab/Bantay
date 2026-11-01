export const ALERT_KEY = 'safety.alertPrefs'
export const ALERT_DEFAULTS = { nearFamily: true, phWide: true, worldDigest: true, macro: false, digestTime: '07:00', quiet: true, push: true, sms: false }
export type AlertPrefs = typeof ALERT_DEFAULTS

export const URGENT_TEXT = 'Urgent means: a tsunami warning, wind signal 3 or higher, an earthquake of M6 or more near you, a red flood or rainfall level, or volcano level 3 or higher.'

/** Unknown keys and values of the wrong type are ignored; anything unreadable gives the defaults. */
export function readPrefs(raw: unknown): AlertPrefs {
  const out: AlertPrefs = { ...ALERT_DEFAULTS }
  if (!raw || typeof raw !== 'object') return out
  const o = raw as Record<string, unknown>
  for (const k of Object.keys(ALERT_DEFAULTS) as (keyof AlertPrefs)[]) if (typeof o[k] === typeof ALERT_DEFAULTS[k]) (out as Record<string, unknown>)[k] = o[k]
  return out
}
