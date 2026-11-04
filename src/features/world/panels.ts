export const PANEL_KEY = 'safety.worldPanels'
export const PANELS = ['forecasts', 'macro', 'volcanoes'] as const
export type Panel = (typeof PANELS)[number]
export const PANEL_LABEL: Record<Panel, string> = { forecasts: 'Forecasts to watch', macro: 'Macro and news', volcanoes: 'Volcanoes' }
export type PanelPrefs = Record<Panel, boolean>

/** Every panel is on until the person turns it off. Unknown keys and non-boolean values are ignored; anything unreadable gives the defaults. */
export function readPanels(raw: unknown): PanelPrefs {
  const out = Object.fromEntries(PANELS.map((p) => [p, true])) as PanelPrefs
  if (!raw || typeof raw !== 'object') return out
  const o = raw as Record<string, unknown>
  for (const p of PANELS) if (typeof o[p] === 'boolean') out[p] = o[p] as boolean
  return out
}

// ---- Daily digest card (safety_digests, built by alerts-digest at 06:45 Manila) ----
export interface DigestTop { id: string; title: string; kind: string; level: string | null; source: string }
/** `summary` is lane A's own plain line (it says so when a feed was not checked); `total` counts warnings only, never EONET awareness rows. */
export interface Digest { day: string; total: number; top: DigestTop[]; sources: string; summary: string }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Reads one `safety_digests` row. Returns null for anything that is not a dated row, so a bad row never paints a number. */
export function parseDigest(row: unknown): Digest | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const body = (r.body && typeof r.body === 'object' ? r.body : null) as Record<string, unknown> | null
  const day = str(r.day) || str(body?.day)
  if (!body || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const counts = body.counts && typeof body.counts === 'object' ? Object.entries(body.counts as Record<string, unknown>).filter(([k]) => k !== 'eonet').map(([, v]) => v) : []
  const total = counts.reduce<number>((n, c) => n + (typeof c === 'number' && Number.isFinite(c) && c > 0 ? Math.floor(c) : 0), 0)
  const top = (Array.isArray(body.top) ? body.top : []).flatMap((t): DigestTop[] => {
    const o = t as Record<string, unknown> | null
    return o && typeof o.id === 'string' && typeof o.title === 'string' && o.title ? [{ id: o.id, title: o.title, kind: str(o.kind), level: typeof o.level === 'string' ? o.level : null, source: str(o.source) }] : []
  }).slice(0, 5)
  return { day, total, top, sources: str(body.sources), summary: str(body.summary).trim() }
}

const MANILA = { timeZone: 'Asia/Manila' } as const
export const manilaDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { ...MANILA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
const manilaMinutes = (ms: number) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { ...MANILA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms).split(':').map(Number)
  return h! * 60 + m!
}

/** The card shows the digest only for today's Manila day and only from the person's chosen time on; before that it keeps the "coming" line. */
export function digestShown(d: Digest | null, time: string, now: number): d is Digest {
  if (!d || d.day !== manilaDay(now)) return false
  const [h, m] = time.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) && manilaMinutes(now) >= h! * 60 + m!
}

/** The server's own line wins. Without one, a count is all this phone can say: it never claims a quiet day on its own. */
export const digestHeadline = (d: Digest) => d.summary || (d.total === 0 ? 'Nothing to report in this digest.' : `${d.total} ${d.total === 1 ? 'warning' : 'warnings'} in the last 24 h`)
