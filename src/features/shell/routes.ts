export type Tab = 'today' | 'health' | 'family' | 'safety'
export type FamilySeg = 'records' | 'plan' | 'people'
export const TABS: Tab[] = ['today', 'health', 'family', 'safety']
const VIEWS = new Set(['me', 'notif', 'admin'])

export function parseHash(h: string): { tab: Tab | null; view: string | null } {
  const k = h.replace(/^#/, '')
  if (k === 'records' || k === 'plan' || k === 'people') return { tab: 'family', view: k }
  if (k === 'docs' || k.startsWith('docs/')) return { tab: 'safety', view: 'docs' }
  if (k === 'medid' || k === 'gobag') return { tab: 'safety', view: k } // sub-screens of Safety, drawn by Safety itself
  if (VIEWS.has(k)) return { tab: null, view: k }
  return { tab: (TABS as string[]).includes(k) ? (k as Tab) : 'today', view: null }
}

export function familyEntry(o: { alertActive: boolean; last: FamilySeg | null }): FamilySeg {
  if (o.alertActive) return 'people'
  return o.last ?? 'records'
}
