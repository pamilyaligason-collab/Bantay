export type Tab = 'today' | 'health' | 'discover' | 'family' | 'safety'
export const TABS: Tab[] = ['today', 'health', 'discover', 'family', 'safety']
const VIEWS = new Set(['me', 'notif', 'admin', 'scan', 'privacy', 'sharing'])

/** Old links that moved (S16 C-3). The first matching rule wins; callers replace the hash with the result when it differs. */
const REDIRECT: [RegExp, string][] = [
  [/^#(records|family\/records|health\/papers)$/, '#family/papers'],
  [/^#health\/library$/, '#discover/learn/library'],
  [/^#health\/library\/(.+)$/, '#discover/learn/library/$1'],
  [/^#health\/videos$/, '#discover/watch'],
  [/^#family\/people$/, '#family'],
  [/^#people$/, '#family']
]
export const canonicalHash = (h: string) => {
  for (const [re, to] of REDIRECT) if (re.test(h)) return h.replace(re, to)
  return h
}

export function parseHash(h: string): { tab: Tab | null; view: string | null } {
  const k = canonicalHash(h).replace(/^#/, '')
  if (k === 'plan') return { tab: 'family', view: k }
  if (k.startsWith('me/')) return { tab: null, view: 'me' } // #me/<group>: a Settings group, drawn by Me
  if (k.startsWith('family/')) return { tab: 'family', view: k.split('/')[1] || null } // #family/plan, #family/papers, #family/people/<id>
  if (k === 'weather' || k.startsWith('weather?')) return { tab: 'today', view: 'weather' } // #weather, #weather?from=action
  if (k === 'docs' || k.startsWith('docs/')) return { tab: 'safety', view: 'docs' }
  // sub-screens of Safety, drawn by Safety itself; #medid/<personId> comes from a member page
  if (k === 'medid' || k === 'gobag') return { tab: 'safety', view: k }
  if (k.startsWith('safety/')) return { tab: 'safety', view: 'safety' } // #safety/warnings, #safety/map ... drawn by Safety itself
  if (k.startsWith('medid/')) return { tab: 'safety', view: 'medid' }
  if (k.startsWith('discover/')) return { tab: 'discover', view: k.split('/')[1] || null } // #discover/learn|listen|play|watch|news
  if (k.startsWith('health/')) return { tab: 'health', view: null } // #health/metric/<code>
  if (k.startsWith('admin/')) return { tab: null, view: 'admin' } // #admin/<page>/<id>: the wide admin dashboard
  if (VIEWS.has(k)) return { tab: null, view: k }
  return { tab: (TABS as string[]).includes(k) ? (k as Tab) : 'today', view: null }
}

/** Routes whose screen draws its own Back + title header, so the avatar/bell top bar stays off. Tab roots and #family/plan|people|messages keep it. */
export const hasOwnHeader = (h: string) => {
  const k = canonicalHash(h).replace(/^#/, '')
  return k === 'privacy' || k === 'sharing' || k === 'medid' || k === 'gobag' || k === 'docs' || k === 'weather' || k.startsWith('weather?') || (k.includes('/') && !/^family\/(plan|people|messages)$/.test(k))
}
