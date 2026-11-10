import { useEffect, useState } from 'react'
import { db } from '../../db'
import { supabase } from '../auth/client'
import { MONTH_NAMES } from './climate'

/** PAGASA's own page for the seasonal and drought outlook (link only; the numbers come from public.pagasa_drought, migration 0063, filled daily by the pagasa-drought function). */
export const OUTLOOK_URL = 'https://www.pagasa.dost.gov.ph/climate/climate-prediction/seasonal-forecast'
export type Level = 'not_affected' | 'dry_condition' | 'dry_spell' | 'drought'
export interface DroughtMonth { month: string; level: Level; kind: 'assessment' | 'outlook' }
/** saved: the read failed and this is the copy kept on the phone. */
export interface Drought { province: string; issued_at: string; months: DroughtMonth[]; saved: boolean }

export const LEVELS: { level: Level; label: string }[] = [
  { level: 'not_affected', label: 'Not affected' },
  { level: 'dry_condition', label: 'Dry condition' },
  { level: 'dry_spell', label: 'Dry spell' },
  { level: 'drought', label: 'Drought' }
]
export const levelLabel = (l: Level): string => LEVELS.find((x) => x.level === l)!.label
/** PAGASA issues the outlook monthly; one older than this is not shown as current. */
export const STALE_DAYS = 60
const CACHE = 'garden.drought'

const isLevel = (v: unknown): v is Level => LEVELS.some((x) => x.level === v)
const cleanMonths = (v: unknown): DroughtMonth[] =>
  (Array.isArray(v) ? v : [])
    .filter((m): m is DroughtMonth => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month) && isLevel(m.level) && (m.kind === 'assessment' || m.kind === 'outlook'))
    .map((m) => ({ month: m.month, level: m.level, kind: m.kind }))
    .sort((a, b) => (a.month < b.month ? -1 : 1))
const asRow = (r: unknown): Omit<Drought, 'saved'> | null => {
  const o = (r ?? {}) as { province?: unknown; issued_at?: unknown; months?: unknown }
  const months = cleanMonths(o.months)
  return typeof o.province === 'string' && typeof o.issued_at === 'string' && Number.isFinite(Date.parse(o.issued_at)) && months.some((m) => m.kind === 'outlook')
    ? { province: o.province, issued_at: o.issued_at, months }
    : null
}

/** The year-month (YYYY-MM) in Manila time, so a phone set to another zone still reads the Philippine month. */
export function manilaYm(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(now)
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`
}
/** The YYYY-MM n months after ym. */
export function addMonths(ym: string, n: number): string {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
export const monthName = (ym: string) => MONTH_NAMES[Number(ym.slice(5, 7)) - 1]!
export const shortMonth = (ym: string) => monthName(ym).slice(0, 3)

export const isStale = (issued: string, now: number = Date.now()): boolean => now - Date.parse(issued) > STALE_DAYS * 86_400_000

/** The outlook months the Climate card shows: this month on, at most six, in whole rows of three so the grid is never lopsided. Months already past are dropped. Plant's dry check reads the same months (one story). */
export function shownOutlook(months: readonly DroughtMonth[], nowYm: string): DroughtMonth[] {
  const ahead = months.filter((m) => m.kind === 'outlook' && m.month >= nowYm).slice(0, 6)
  return ahead.length >= 3 ? ahead.slice(0, ahead.length - (ahead.length % 3)) : ahead
}

/** Chips to show: the latest assessment (it reads "Now") and the shown outlook months. */
export function chipMonths(months: readonly DroughtMonth[], nowYm: string): DroughtMonth[] {
  return [...months.filter((m) => m.kind === 'assessment').slice(-1), ...shownOutlook(months, nowYm)]
}

const span = (ms: string[]) => (ms.length === 1 ? `in ${monthName(ms[0]!)}` : `${monthName(ms[0]!)} to ${monthName(ms[ms.length - 1]!)}`)

/** One plain sentence from the upcoming outlook months (PAGASA's outlook, never a forecast of ours). */
export function outlookSentence(months: readonly DroughtMonth[], nowYm: string): string {
  const ahead = months.filter((m) => m.kind === 'outlook' && m.month >= nowYm)
  if (!ahead.length) return 'Climate outlook not available yet.'
  const of = (l: Level) => ahead.filter((m) => m.level === l).map((m) => m.month)
  const spell = of('dry_spell'), drought = of('drought'), dry = of('dry_condition')
  const parts: string[] = []
  if (spell.length) parts.push(spell[0] === nowYm ? 'Dry spell now' : `Dry spell expected from ${monthName(spell[0]!)}`)
  if (drought.length) parts.push(`${parts.length ? 'drought' : 'Drought'} possible ${span(drought)}`)
  if (parts.length) return `${parts.join('; ')}.`
  if (dry.length) return `Dry conditions possible ${span(dry)}. No dry spell expected.`
  return 'No dry spell or drought expected in the coming months.'
}

/** The first dry month (dry spell or drought) among the outlook months the Climate card shows, or null: the Plant card then favours crops that cope with less water and says when. */
export function dryWhen(months: readonly DroughtMonth[] | null | undefined, nowYm: string): { ym: string; level: 'dry_spell' | 'drought' } | null {
  const m = months && shownOutlook(months, nowYm).find((x) => x.level === 'dry_spell' || x.level === 'drought')
  return m ? { ym: m.month, level: m.level as 'dry_spell' | 'drought' } : null
}
export const dryAhead = (months: readonly DroughtMonth[] | null | undefined, nowYm: string): boolean => !!dryWhen(months, nowYm)

let memo: { at: number; p: Promise<Omit<Drought, 'saved'>[] | null> } | null = null
export const resetDrought = () => { memo = null } // tests

/** Every province row (83 at most): the phone never says which province it wants, so no place leaves it. A missing table reads as null, never an error. */
function readAll(now: number): Promise<Omit<Drought, 'saved'>[] | null> {
  if (memo && now - memo.at < 30_000) return memo.p
  const p = (async () => {
    if (!supabase) throw new Error('not_connected')
    const { data, error } = await supabase.from('pagasa_drought').select('province,issued_at,months,fetched_at').limit(100)
    if (error) {
      if (/does not exist|schema cache|42P01|PGRST205/i.test(`${error.message} ${error.code ?? ''}`)) return null
      throw new Error('read')
    }
    return ((data ?? []) as unknown[]).map(asRow).filter((r): r is Omit<Drought, 'saved'> => !!r)
  })()
  memo = { at: now, p }
  return p
}

/** The outlook for one province: a signed-in read, kept on the phone, with the kept copy standing in when the read fails. null = nothing known. */
export async function loadDrought(province: string, now: number = Date.now()): Promise<Drought | null> {
  const key = `${CACHE}.${province}`
  try {
    const all = await readAll(now)
    const row = all?.find((r) => r.province.toLowerCase() === province.toLowerCase()) ?? null
    if (row) await db.kv.put({ key, value: row }).catch(() => undefined)
    return row && { ...row, saved: false }
  } catch {
    const s = asRow((await db.kv.get(key).catch(() => undefined))?.value)
    return s && { ...s, saved: true }
  }
}

/** undefined until the first read settles (or while the province is not known yet); null when nothing is known. */
export function useDrought(province: string | null): Drought | null | undefined {
  const [d, setD] = useState<{ province: string; v: Drought | null } | undefined>(undefined)
  useEffect(() => {
    if (!province) return
    let live = true
    const read = () => { void loadDrought(province).then((v) => { if (live) setD({ province, v }) }, () => { if (live) setD({ province, v: null }) }) }
    const vis = () => { if (document.visibilityState === 'visible') read() }
    read()
    window.addEventListener('online', read)
    document.addEventListener('visibilitychange', vis)
    return () => { live = false; window.removeEventListener('online', read); document.removeEventListener('visibilitychange', vis) }
  }, [province])
  return province ? (d && d.province === province ? d.v : undefined) : null
}
