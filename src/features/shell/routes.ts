export type Tab = 'today' | 'health' | 'discover' | 'family' | 'safety'
export const TABS: Tab[] = ['today', 'health', 'discover', 'family', 'safety']
const VIEWS = new Set(['me', 'notif', 'admin', 'scan', 'privacy', 'sharing'])

/** Old links that moved (S16 C-3). The first matching rule wins; callers replace the hash with the result when it differs. */
const REDIRECT: [RegExp, string][] = [
  [/^#(records|family\/records|health\/papers)$/, '#family/papers'],
  [/^#discover\/learn\/library$/, '#health/library'], // S25 (D-155): the library lives in Health again
  [/^#discover\/learn\/library\/(.+)$/, '#health/library/$1'],
  [/^#health\/videos$/, '#health'], // S25: Health videos are a section of the Health overview
  // S26 W4F (D-168): Plan folded into the Calendar. The old links open the calendar page, which lists the same saved items.
  [/^#(family\/)?plan$/, '#family/calendar'],
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
  if (k === 'calm' || k === 'calm/listen') return { tab: 'today', view: 'calm' } // #calm: the Calm page under Today (lane C)
  if (k.startsWith('garden/')) return { tab: 'today', view: null } // #garden/plant, #garden/prices: Today draws these pages itself
  if (k === 'docs' || k.startsWith('docs/')) return { tab: 'safety', view: 'docs' }
  // sub-screens of Safety, drawn by Safety itself; #medid/<personId> comes from a member page
  if (k === 'medid' || k === 'gobag') return { tab: 'safety', view: k }
  if (k.startsWith('safety/')) return { tab: 'safety', view: 'safety' } // #safety/warnings, #safety/map ... drawn by Safety itself
  if (k.startsWith('medid/')) return { tab: 'safety', view: 'medid' }
  if (k.startsWith('discover/')) return { tab: 'discover', view: k.split('/')[1] || null } // #discover/learn|listen|play|watch|news
  if (k.startsWith('health/')) return { tab: 'health', view: null } // #health/metric/<code>
  if (k.startsWith('admin/')) return { tab: null, view: 'admin' } // #admin/<page>/<id>: the wide admin dashboard
  if (k.startsWith('setup/')) return { tab: null, view: 'setup' } // S31: #setup/all, the Set up everything checklist (also opened by ph.bantay.family://setup)
  if (k.startsWith('sharing/')) return { tab: null, view: 'sharing' } // #sharing/all (owner list), #sharing/<personId>: SharingScreen reads the rest itself
  if (VIEWS.has(k)) return { tab: null, view: k }
  return { tab: (TABS as string[]).includes(k) ? (k as Tab) : 'today', view: null }
}

/** Routes whose screen draws its own Back + title header, so the Jack button stays off. The avatar and bell now sit in each tab root's title row (HeadActions). */
export const hasOwnHeader = (h: string) => {
  const k = canonicalHash(h).replace(/^#/, '')
  if (k === 'safety/world') return false // World is the other half of the Safety root switch
  return k === 'privacy' || k === 'sharing' || k === 'medid' || k === 'gobag' || k === 'docs' || k === 'weather' || k === 'calm' || k.startsWith('weather?') || (k.includes('/') && !/^family\/(plan|calendar|people|messages)$/.test(k))
}
