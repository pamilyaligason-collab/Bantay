import { supabase } from '../../auth/client'
import { listCarers, type Carer } from '../api'

// "View as member": a READ-ONLY approximation of what one member's phone lists. It is worked out here from rows the admin can already read
// (people_admin_read, carers_admin_read, readings_admin_read and the records policies). It never signs in as the member, never mints a token
// and never writes health data. Real visibility is decided by RLS (people_read 0022, readings_read 0001); this file mirrors it.

export type ViewPerson = { id: string; display_name: string; auth_user_id: string | null; created_by: string | null; archived_at: string | null; photo_path: string | null }
/** self: their own login row. writer/carer: a carers link. creator: made the person but has no carers row (people_read shows the row, the records policies do not). */
export type Relation = 'self' | 'writer' | 'carer' | 'creator'
export type Visible = { person: ViewPerson; relation: Relation; records: boolean }

/**
 * Mirrors people_read (self always; creator or carer only while not archived) and readings_read / the records policies (self or any carers link).
 * shortcut: the admin role adds nothing here, because the phone never applies is_admin to a member's lists; revisit if a policy starts to.
 */
export function visibleTo(userId: string, people: ViewPerson[], carers: Pick<Carer, 'carer_id' | 'person_id' | 'can_write'>[]): { shown: Visible[]; hidden: ViewPerson[] } {
  const link = new Map(carers.filter((c) => c.carer_id === userId).map((c) => [c.person_id, c]))
  const shown: Visible[] = []
  const hidden: ViewPerson[] = []
  for (const p of people) {
    const c = link.get(p.id)
    if (p.auth_user_id === userId) shown.push({ person: p, relation: 'self', records: true })
    else if (p.archived_at) hidden.push(p)
    else if (c) shown.push({ person: p, relation: c.can_write ? 'writer' : 'carer', records: true })
    else if (p.created_by === userId) shown.push({ person: p, relation: 'creator', records: false })
    else hidden.push(p)
  }
  const rank: Record<Relation, number> = { self: 0, writer: 1, carer: 2, creator: 3 }
  shown.sort((a, b) => rank[a.relation] - rank[b.relation] || a.person.display_name.localeCompare(b.person.display_name))
  hidden.sort((a, b) => a.display_name.localeCompare(b.display_name))
  return { shown, hidden }
}

export const RELATION_TEXT: Record<Relation, string> = { self: 'You', writer: 'Carer, can edit', carer: 'Carer, read only', creator: 'Added by them, no records access' }

export type PvMed = { name: string; dose: string | null; strength: string | null; schedule: string[]; as_needed: boolean }
export type PvReading = { test: string; value: number | null; unit: string | null; taken_at: string }
export type PvDoc = { id: string; kind: string; title: string | null; doc_date: string | null }
export type Preview = { meds: PvMed[] | null; readings: PvReading[] | null; docs: PvDoc[] | null }

/** Newest reading of each test; a reading with no value is skipped (unknown is never shown as 0). */
export function latestReadings(rows: PvReading[]): PvReading[] {
  const best = new Map<string, PvReading>()
  for (const r of rows) {
    if (r.value === null || r.value === undefined || Number.isNaN(Number(r.value))) continue
    const cur = best.get(r.test)
    if (!cur || Date.parse(r.taken_at) > Date.parse(cur.taken_at)) best.set(r.test, r)
  }
  return [...best.values()].sort((a, b) => a.test.localeCompare(b.test))
}

/** The only write this feature makes: one audit row. It carries the person id and nothing else (no values, no names, no text). */
export const auditArgs = (personId: string) => ({ p_person: personId })

export async function logViewAs(personId: string): Promise<boolean> {
  if (!supabase) return false
  try { return !(await supabase.rpc('admin_log_view_as', auditArgs(personId))).error } catch { return false }
}

type Q<T> = PromiseLike<{ data: T[] | null; error: unknown }>
const rows = async <T,>(q: Q<T>): Promise<T[] | null> => { try { const { data, error } = await q; return error ? null : data ?? [] } catch { return null } }

/** People (with created_by) and the carers links. Null when either could not be read. */
export async function loadRoster(): Promise<{ people: ViewPerson[]; carers: Carer[] } | null> {
  if (!supabase) return null
  const sel = (cols: string) => supabase!.from('people').select(cols) as unknown as Q<ViewPerson>
  const [full, c] = await Promise.all([rows(sel('id, display_name, auth_user_id, created_by, archived_at, photo_path')), listCarers()])
  // shortcut: a server before migration 0022 has no archived_at, so retry without it; drop this once 0022 is live everywhere.
  const people = full ?? (await rows(sel('id, display_name, auth_user_id, created_by, photo_path')))?.map((p) => ({ ...p, archived_at: null })) ?? null
  return people && c.ok ? { people, carers: c.data } : null
}

type MedRow = PvMed & { med_status: string; status: string; deleted_at: string | null }
/** Reads for one person, all SELECT. A part that fails is null so the screen says "could not load" for it instead of showing 0. */
export async function loadPreview(personId: string): Promise<Preview> {
  if (!supabase) return { meds: null, readings: null, docs: null }
  const s = supabase
  const [meds, readings, docs] = await Promise.all([
    rows(s.from('medications').select('name, dose, strength, schedule, as_needed, med_status, status, deleted_at').eq('person_id', personId).eq('status', 'confirmed').eq('med_status', 'active').is('deleted_at', null).order('name') as unknown as Q<MedRow>),
    rows(s.from('readings').select('test, value, unit, taken_at').eq('person_id', personId).order('taken_at', { ascending: false }).limit(300) as unknown as Q<PvReading>),
    rows(s.from('documents').select('id, kind, title, doc_date').eq('person_id', personId).eq('status', 'confirmed').order('doc_date', { ascending: false }).limit(20) as unknown as Q<PvDoc>)
  ])
  return {
    meds: meds ? meds.map((m) => ({ name: m.name, dose: m.dose, strength: m.strength, schedule: Array.isArray(m.schedule) ? m.schedule : [], as_needed: !!m.as_needed })) : null,
    readings: readings ? latestReadings(readings) : null,
    docs
  }
}
