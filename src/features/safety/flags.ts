export const DEFAULTS = { worldFeeds: false, offlineMaps: false, firstAidOffline: false, phivolcs: false, smsFallback: false } as const
export type Flags = { -readonly [K in keyof typeof DEFAULTS]: boolean }

/** Unknown keys and non-boolean values are ignored; garbage gives the defaults. */
export function readFlags(raw: string | null = safeGet()): Flags {
  const out: Flags = { ...DEFAULTS }
  try {
    const o = JSON.parse(raw ?? '{}') as Record<string, unknown>
    for (const k of Object.keys(DEFAULTS) as (keyof Flags)[]) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean
  } catch { /* defaults */ }
  return out
}
function safeGet(): string | null {
  try { return localStorage.getItem('bantay.flags') } catch { return null }
}

// shortcut: flags are read once at load; upgrade to a kv row when a flag must flip at runtime
export const FLAGS: Flags = readFlags()
