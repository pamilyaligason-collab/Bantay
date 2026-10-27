// Web admin routes (bantay.pages.dev/admin): #/<page>, #/<page>/<id>, #/<page>/<id>/<sub>. Plain #admin in the app stays the phone page.
export const DESK_PAGES = ['home', 'members', 'calendar', 'queue', 'records', 'duplicates', 'files', 'ids', 'history', 'system', 'sharing'] as const
export type DeskPage = (typeof DESK_PAGES)[number]

export const DESK_LABELS: Record<DeskPage, string> = {
  home: 'Dashboard', members: 'Members', calendar: 'Calendar', queue: 'Confirm queue', records: 'Records', duplicates: 'Duplicates',
  files: 'Files and scans', ids: 'IDs and insurance', history: 'History', system: 'System health', sharing: 'Who sees whom'
}

/** Sidebar groups, in order. */
export const DESK_GROUPS: { label: string; pages: DeskPage[] }[] = [
  { label: 'Overview', pages: ['home', 'calendar'] },
  { label: 'People', pages: ['members', 'sharing'] },
  { label: 'Records', pages: ['queue', 'records', 'duplicates', 'files'] },
  { label: 'Private', pages: ['ids'] },
  { label: 'System', pages: ['history', 'system'] }
]

/**
 * Page props. `id` is the second hash segment (a person id for members/records/ids, a row id elsewhere), `sub` the third (a tab).
 * `embedded`: drawn inside another page (e.g. the member page's Records tab): no page header, no person picker, links keep the host page.
 */
export type PageProps = { id: string | null; sub?: string | null; embedded?: boolean }

const ALIAS: Record<string, DeskPage> = { people: 'members' } // old #admin/people links

export function parseDesk(hash: string): { page: DeskPage; id: string | null; sub: string | null } {
  const [, page = '', id, sub] = hash.replace(/^#/, '').split('/')
  const p = ALIAS[page] ?? ((DESK_PAGES as readonly string[]).includes(page) ? (page as DeskPage) : 'home')
  return { page: p, id: id ? decodeURIComponent(id) : null, sub: sub ? decodeURIComponent(sub) : null }
}

export const deskHref = (page: DeskPage, id?: string | null, sub?: string | null) =>
  `#/${page}${id ? '/' + encodeURIComponent(id) : ''}${id && sub ? '/' + encodeURIComponent(sub) : ''}`

/** Old in-app dashboard links (#admin/<page>/...) -> the web admin page. Null for anything else. */
export const webAdminUrl = (hash: string) => (hash.startsWith('#admin/') ? '/admin#/' + hash.slice('#admin/'.length) : null)
