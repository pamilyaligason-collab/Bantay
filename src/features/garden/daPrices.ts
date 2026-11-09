import { useEffect, useState } from 'react'
import { db } from '../../db'
import { supabase } from '../auth/client'

/** A public.da_prices row (migration 0057): DA Daily Price Index, Metro Manila (NCR) wet markets. */
export interface DaRow { price_date: string; commodity: string; specification: string; unit: 'kg' | 'piece' | 'liter'; price_php: number }
export interface DaPrices { date: string; rows: DaRow[]; /** true = the saved copy (offline or the read failed) */ saved: boolean }
const CACHE = 'today.daPrices'
const KEEP_DAYS = 30 // the server keeps 60; an older saved list is no help

const valid = (r: unknown): r is DaRow => {
  const o = (r ?? {}) as Record<string, unknown>
  return typeof o.commodity === 'string' && o.commodity !== '' && typeof o.price_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.price_date) && Number.isFinite(Number(o.price_php)) && Number(o.price_php) > 0 && (o.unit === 'kg' || o.unit === 'piece' || o.unit === 'liter')
}

let memo: { at: number; p: Promise<DaPrices | null> } | null = null
export const resetDaPrices = () => { memo = null } // tests

/** The newest day of da_prices (signed-in read), saved on the phone; the saved list stands in when the read fails. null = nothing known (a missing table or an empty one reads as null, never an error). */
export function loadDaPrices(now: number = Date.now()): Promise<DaPrices | null> {
  if (memo && now - memo.at < 30_000) return memo.p
  const p = (async (): Promise<DaPrices | null> => {
    const saved = async (): Promise<DaPrices | null> => {
      const s = (await db.kv.get(CACHE).catch(() => undefined))?.value as { savedAt: number; date: string; rows: DaRow[] } | undefined
      return s && now - s.savedAt <= KEEP_DAYS * 86_400_000 && s.rows.length ? { date: s.date, rows: s.rows, saved: true } : null
    }
    try {
      if (!supabase) throw new Error('not_connected')
      const top = await supabase.from('da_prices').select('price_date').order('price_date', { ascending: false }).limit(1)
      if (top.error) throw new Error('read')
      const date = (top.data?.[0] as { price_date?: string } | undefined)?.price_date
      if (!date) return null
      const { data, error } = await supabase.from('da_prices').select('price_date,commodity,specification,unit,price_php').eq('price_date', date).order('commodity').limit(1000)
      if (error) throw new Error('read')
      const rows = ((data ?? []) as unknown[]).filter(valid).map((r) => ({ ...r, price_php: Number(r.price_php) }))
      if (!rows.length) return null
      await db.kv.put({ key: CACHE, value: { savedAt: now, date, rows } }).catch(() => undefined)
      return { date, rows, saved: false }
    } catch {
      return await saved()
    }
  })()
  memo = { at: now, p }
  return p
}

/** undefined until the first read settles; null when nothing is known. */
export function useDaPrices(): DaPrices | null | undefined {
  const [d, setD] = useState<DaPrices | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void loadDaPrices().then((r) => { if (live) setD(r) }, () => { if (live) setD(null) })
    return () => { live = false }
  }, [])
  return d
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Nov 8" from a yyyy-mm-dd price date. */
export const priceDay = (iso: string): string => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso); return m ? `${MONTHS[Number(m[1]) - 1] ?? ''} ${Number(m[2])}`.trim() : iso }
/** "₱109.77/kg" (a piece or a liter says so). */
export const priceText = (r: Pick<DaRow, 'price_php' | 'unit'>): string => `₱${r.price_php.toFixed(2)}${r.unit === 'kg' ? '/kg' : r.unit === 'piece' ? ' each' : '/liter'}`

/** The row for a commodity: the first pattern that matches a non-imported row. */
export function priceFor(rows: readonly DaRow[], patterns: readonly RegExp[]): DaRow | null {
  for (const re of patterns) {
    const hit = rows.find((r) => re.test(r.commodity) && !/imported/i.test(r.commodity))
    if (hit) return hit
  }
  return null
}

const COMMON: { label: string; re: RegExp[] }[] = [
  { label: 'Rice, regular milled', re: [/regular milled/i] }, { label: 'Galunggong', re: [/galunggong/i] }, { label: 'Pork liempo', re: [/liempo/i] }, { label: 'Red onion', re: [/^red onion, local/i, /^red onion/i] }
]
/** The four items on Today: rice, galunggong, liempo, red onion where they match; short of four, the first rows of the list fill up. */
export function commonItems(rows: readonly DaRow[]): { label: string; row: DaRow }[] {
  const out: { label: string; row: DaRow }[] = []
  for (const c of COMMON) { const row = priceFor(rows, c.re); if (row) out.push({ label: c.label, row }) }
  for (const row of rows) { if (out.length >= 4) break; if (!out.some((o) => o.row === row)) out.push({ label: row.commodity, row }) }
  return out.slice(0, 4)
}

// The table has no group column (the PDF section is not stored), so the group comes from the commodity name.
const GROUPS: [string, RegExp][] = [
  ['Rice and corn', /\brice\b|\bcorn\b/i],
  ['Fish and seafood', /galunggong|bangus|tilapia|tamban|salmon|pampano|alumahan|bisugo|dalagang|mackerel|matambaka|\bfish|squid|shrimp|crab|tuna|\bhasa/i],
  ['Meat', /beef|pork|liempo|kasim|pigue|tripe|head mask|\bham\b|carabeef|brisket|\bribs?\b|chuck|rump|sirloin|tenderloin|shank|offal/i],
  ['Chicken and eggs', /chicken|broiler|\begg|\bduck/i],
  ['Vegetables', /gourd|cabbage|chayote|cucumber|sitao|sitaw|okra|eggplant|tomato|carrot|potato|lettuce|beans?\b|habichuelas|pechay|squash|camote|cassava|radish|celery|pepper|broccoli|cauliflower|kangkong|ampalaya|upo\b|saluyot|malunggay|mustasa|pumpkin/i],
  ['Garlic, onion and spices', /garlic|onion|ginger|chili|siling|turmeric|spice/i],
  ['Fruits', /banana|mango|pineapple|papaya|calamansi|watermelon|melon|apple|orange|pomelo|lemon|avocado|grape|guava/i],
  ['Cooking items', /oil|sugar|salt|vinegar|soy|flour|milk|coffee|noodle|sardines|bread/i]
]
export const groupOf = (commodity: string): string => GROUPS.find(([, re]) => re.test(commodity))?.[0] ?? 'Other'
export const GROUP_ORDER = [...GROUPS.map(([g]) => g), 'Other']
/** Rows grouped for the All prices page: groups in a fixed order, items A to Z inside. Empty groups are left out. */
export function groupRows(rows: readonly DaRow[]): { group: string; rows: DaRow[] }[] {
  return GROUP_ORDER.map((group) => ({ group, rows: rows.filter((r) => groupOf(r.commodity) === group).sort((a, b) => a.commodity.localeCompare(b.commodity) || a.specification.localeCompare(b.specification)) })).filter((g) => g.rows.length)
}
