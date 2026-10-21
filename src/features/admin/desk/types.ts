// Admin dashboard routes: #admin/<page> or #admin/<page>/<id>. Plain #admin stays the phone Admin page.
export const DESK_PAGES = ['members', 'people', 'queue', 'records', 'files', 'ids', 'duplicates', 'history'] as const
export type DeskPage = (typeof DESK_PAGES)[number]

export const DESK_LABELS: Record<DeskPage, string> = {
  members: 'Members', people: 'People', queue: 'Confirm queue', records: 'Records', files: 'Files and scans',
  ids: 'IDs and insurance', duplicates: 'Duplicates', history: 'History'
}

/** Page props: `id` is the third hash segment (a person id for people/records/ids, a row id elsewhere), or null. */
export type PageProps = { id: string | null }

export function parseDesk(hash: string): { page: DeskPage; id: string | null } | null {
  const [root, page, id] = hash.replace(/^#/, '').split('/')
  if (root !== 'admin' || page === undefined) return null
  return { page: (DESK_PAGES as readonly string[]).includes(page) ? (page as DeskPage) : 'members', id: id ? decodeURIComponent(id) : null }
}

export const deskHref = (page: DeskPage, id?: string | null) => `#admin/${page}${id ? '/' + encodeURIComponent(id) : ''}`
