import type { Entry } from './entries'

/** Quick dial: only sourced (confirmed, listed) or family-added entries with a number get a big Call button; the rest wait under "Numbers we still need". */
export function splitDial(entries: Entry[]): { groups: { name: string; items: (Entry & { phone: string })[] }[]; missing: Entry[] } {
  const has = (e: Entry): e is Entry & { phone: string } => e.status !== 'UNKNOWN' && typeof e.phone === 'string' && e.phone.trim() !== ''
  const ok = entries.filter(has)
  return {
    groups: [...new Set(ok.map((e) => e.group))].map((name) => ({ name, items: ok.filter((e) => e.group === name) })),
    missing: entries.filter((e) => !has(e))
  }
}
