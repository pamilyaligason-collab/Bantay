// Device reading (Scan & Capture): the numbers the server read off a photo of a BP monitor, glucose meter, scale, thermometer or oximeter,
// checked again here before anything is saved. Unknown is null, never 0. Pure; the screen is ReadingConfirm.tsx.
import type { SupabaseClient } from '@supabase/supabase-js'
import { toCanonicalReading, type Reading } from '../health/ranges'
import { PLAUSIBLE as P } from '../health/plausible'
import { aiOn } from '../privacy/ai'

export type ReadingKind = 'bp' | 'glucose' | 'weight' | 'temp' | 'spo2'
export const KIND_LABEL: Record<ReadingKind, string> = { bp: 'Blood pressure', glucose: 'Blood sugar', weight: 'Weight', temp: 'Temperature', spo2: 'Oxygen' }
export const KIND_ORDER: ReadingKind[] = ['bp', 'glucose', 'weight', 'temp', 'spo2']
/** The units a person may choose per kind; the first is the one we save in. */
export const UNITS: Record<ReadingKind, string[]> = { bp: ['mmHg'], glucose: ['mg/dL', 'mmol/L'], weight: ['kg', 'lb'], temp: ['C', 'F'], spo2: ['%'] }
export const UNIT_WORD: Record<string, string> = { C: '°C', F: '°F' }

/** What the server sends back (supabase/functions/records-extract, normalizeReading). Every field may be null. */
export interface ReadingDraft {
  kind: ReadingKind | null
  systolic: number | null
  diastolic: number | null
  pulse: number | null
  value: number | null
  unit: string | null
  confidence: number | null
}
export const EMPTY_DRAFT: ReadingDraft = { kind: null, systolic: null, diastolic: null, pulse: null, value: null, unit: null, confidence: null }

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** Whatever came back becomes a draft; a bad reply is an empty draft the person fills in by hand. */
export function parseDraft(r: unknown): ReadingDraft {
  const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
  const kind = KIND_ORDER.includes(o.kind as ReadingKind) ? (o.kind as ReadingKind) : null
  return { kind, systolic: n(o.systolic), diastolic: n(o.diastolic), pulse: n(o.pulse), value: n(o.value), unit: typeof o.unit === 'string' ? o.unit : null, confidence: n(o.confidence) }
}

const RANGE: Record<ReadingKind, Record<string, [number, number]>> = {
  bp: { mmHg: [P.bp.min, P.bp.max] },
  glucose: { 'mg/dL': [P.glucose.min, P.glucose.max], 'mmol/L': [1.1, 44.4] },
  weight: { kg: [P.weight.min, P.weight.max], lb: [4.4, 880] },
  temp: { C: [P.temperature.min, P.temperature.max], F: [86, 113] },
  spo2: { '%': [P.spo2.min, P.spo2.max] }
}
const round1 = (x: number) => Math.round(x * 10) / 10

export interface Typed { systolic: string; diastolic: string; pulse: string; value: string; unit: string }
export type Built = { ok: true; readings: Pick<Reading, 'test' | 'value' | 'unit'>[] } | { ok: false; error: string }
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))

/** The typed (or confirmed) fields -> the rows to save, in the units the rest of the app uses (mg/dL, kg, °C). An error says what to fix. */
export function buildReadings(kind: ReadingKind, t: Typed): Built {
  if (kind === 'bp') {
    const s = num(t.systolic)
    const d = num(t.diastolic)
    if (!Number.isFinite(s) || !Number.isFinite(d)) return { ok: false, error: 'Type the top and the bottom number.' }
    const [lo, hi] = RANGE.bp.mmHg!
    if (s < lo || s > hi || d < 20 || d > 200) return { ok: false, error: 'Check the numbers: they look too small or too big.' }
    if (d >= s) return { ok: false, error: 'The top number is higher than the bottom one. Check them.' }
    const out: Pick<Reading, 'test' | 'value' | 'unit'>[] = [{ test: 'bp_systolic', value: s, unit: 'mmHg' }, { test: 'bp_diastolic', value: d, unit: 'mmHg' }]
    if (t.pulse.trim() !== '') {
      const p = num(t.pulse)
      if (!Number.isFinite(p) || p < P.pulse.min || p > P.pulse.max) return { ok: false, error: 'Check the pulse: it looks too small or too big.' }
      out.push({ test: 'heart_rate', value: p, unit: 'bpm' })
    }
    return { ok: true, readings: out }
  }
  const v = num(t.value)
  if (!Number.isFinite(v)) return { ok: false, error: `Type the ${KIND_LABEL[kind].toLowerCase()} number.` }
  const range = RANGE[kind][t.unit]
  if (!range) return { ok: false, error: 'Pick the unit shown on the device.' }
  if (v < range[0] || v > range[1]) return { ok: false, error: 'Check the number: it looks too small or too big.' }
  if (kind === 'glucose') {
    // the existing helper converts mmol/L to mg/dL (x 18.016)
    const c = toCanonicalReading({ personId: '', takenAt: '', test: 'glucose', value: v, unit: t.unit })
    return c ? { ok: true, readings: [{ test: 'glucose', value: c.value, unit: 'mg/dL' }] } : { ok: false, error: 'Pick the unit shown on the device.' }
  }
  if (kind === 'weight') return { ok: true, readings: [{ test: 'weight', value: t.unit === 'lb' ? round1(v * 0.45359237) : v, unit: 'kg' }] }
  if (kind === 'temp') return { ok: true, readings: [{ test: 'temperature', value: t.unit === 'F' ? round1(((v - 32) * 5) / 9) : v, unit: 'C' }] }
  return { ok: true, readings: [{ test: 'spo2', value: v, unit: '%' }] }
}

/** Fields shown on the confirm screen: what was read, empty where it was not. A missing number is '' (never 0). */
export function toTyped(d: ReadingDraft): Typed {
  const s = (x: number | null) => (x == null ? '' : String(x))
  return { systolic: s(d.systolic), diastolic: s(d.diastolic), pulse: s(d.pulse), value: s(d.value), unit: d.unit && d.kind && UNITS[d.kind].includes(d.unit) ? d.unit : (d.kind ? UNITS[d.kind][0]! : '') }
}

const b64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result).split(',')[1] ?? '')
  r.onerror = () => rej(new Error('read'))
  r.readAsDataURL(b)
})

/** Ask the server to read the photo. Any failure (offline, no signal, server error) gives an empty draft and `failed: true`: the person types the numbers instead. */
export async function readDevicePhoto(client: SupabaseClient | null, photo: Blob): Promise<{ draft: ReadingDraft; failed: boolean; limited?: true; off?: true }> {
  if (!(await aiOn())) return { draft: EMPTY_DRAFT, failed: true, off: true } // privacy.ai: the photo never leaves the phone
  if (!client) return { draft: EMPTY_DRAFT, failed: true }
  try {
    const { data, error } = await client.functions.invoke('records-extract', { body: { mode: 'reading', mime: 'image/jpeg', image_base64: await b64(photo) } })
    if (error || !data?.ok) {
      const status = (error as { context?: { status?: number } } | null)?.context?.status
      return { draft: EMPTY_DRAFT, failed: true, ...(status === 429 || data?.error === 'rate_limited' ? { limited: true as const } : {}) }
    }
    return { draft: parseDraft(data.reading), failed: false }
  } catch {
    return { draft: EMPTY_DRAFT, failed: true }
  }
}
