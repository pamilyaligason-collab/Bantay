export type Tab = 'today' | 'health' | 'family' | 'safety'
export type FamilySeg = 'plan' | 'people'
export const TABS: Tab[] = ['today', 'health', 'family', 'safety']
const VIEWS = new Set(['me', 'notif', 'admin', 'scan'])

/** Old Records links (#records, #family/records) now open Health > Papers. Callers replace the hash with this when it differs. */
export const canonicalHash = (h: string) => (h === '#records' || h === '#family/records' ? '#health/papers' : h)

export function parseHash(h: string): { tab: Tab | null; view: string | null } {
  const k = canonicalHash(h).replace(/^#/, '')
  if (k === 'plan' || k === 'people') return { tab: 'family', view: k }
  if (k.startsWith('family/')) return { tab: 'family', view: k.split('/')[1] || null } // #family/plan, #family/people, #family/people/<id>
  if (k === 'weather' || k.startsWith('weather?')) return { tab: 'today', view: 'weather' } // #weather, #weather?from=action
  if (k === 'docs' || k.startsWith('docs/')) return { tab: 'safety', view: 'docs' }
  // sub-screens of Safety, drawn by Safety itself; #medid/<personId> comes from a member page
  if (k === 'medid' || k === 'gobag') return { tab: 'safety', view: k }
  if (k.startsWith('safety/')) return { tab: 'safety', view: 'safety' } // #safety/warnings, #safety/map ... drawn by Safety itself
  if (k.startsWith('medid/')) return { tab: 'safety', view: 'medid' }
  if (k.startsWith('health/')) return { tab: 'health', view: null } // #health/metric/<code>
  if (VIEWS.has(k)) return { tab: null, view: k }
  return { tab: (TABS as string[]).includes(k) ? (k as Tab) : 'today', view: null }
}

export function familyEntry(o: { alertActive: boolean; last: FamilySeg | null }): FamilySeg {
  if (o.alertActive) return 'people'
  return o.last ?? 'people'
}

/** Routes whose screen draws its own Back + title header, so the avatar/bell top bar stays off. Tab roots and #family/plan|people keep it. */
export const hasOwnHeader = (h: string) => {
  const k = canonicalHash(h).replace(/^#/, '')
  return k === 'medid' || k === 'gobag' || k === 'docs' || k === 'weather' || k.startsWith('weather?') || (k.includes('/') && !/^family\/(plan|people)$/.test(k))
}
