import type { Reading } from '../health/ranges'
import type { Activity, MedTaken } from '../log/store'

export const MAX_MESSAGES = 10
export const TABS = ['today', 'health', 'records', 'family', 'safety'] as const
export type Tab = (typeof TABS)[number]
export type Msg = { role: 'user' | 'assistant'; content: string }
export type DraftTool = 'log_reading' | 'log_med_taken' | 'log_activity'
export type Source = 'medlineplus' | 'wikipedia' | 'kiwix'

export type Card =
  | { kind: 'draft'; id: string; tool: DraftTool; fields: Record<string, string> }
  | { kind: 'open'; id: string; tab: Tab }
  | { kind: 'explain'; id: string; term: string; answer: string; source: Source }
  | { kind: 'weather'; id: string }

/** Never more than the last 10 messages, and only role + content leave the device. */
export const buildRequest = (messages: Msg[], screen: string) => ({
  messages: messages.slice(-MAX_MESSAGES).map(({ role, content }) => ({ role, content })),
  screen
})

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 300) : '')
export const FIELDS: Record<DraftTool, string[]> = {
  log_reading: ['person', 'test', 'value', 'unit', 'takenAt'],
  log_med_taken: ['person', 'name', 'takenAt'],
  log_activity: ['person', 'kind', 'minutes', 'steps', 'startedAt']
}

/** Server reply -> text + cards. Unknown tools and bad arguments are dropped, never executed. */
export function parseReply(r: unknown): { text: string; cards: Card[] } {
  const o = (r && typeof r === 'object' ? r : {}) as { reply?: unknown; tool_calls?: unknown }
  const calls = Array.isArray(o.tool_calls) ? o.tool_calls : []
  const cards: Card[] = []
  calls.forEach((c, i) => {
    const name = str((c as { name?: unknown })?.name)
    const a = ((c as { arguments?: unknown })?.arguments ?? {}) as Record<string, unknown>
    const id = `c${i}`
    if (name in FIELDS) {
      const fields: Record<string, string> = {}
      for (const k of FIELDS[name as DraftTool]) fields[k] = str(a[k])
      cards.push({ kind: 'draft', id, tool: name as DraftTool, fields })
    } else if (name === 'open_screen' && (TABS as readonly string[]).includes(str(a.tab))) {
      cards.push({ kind: 'open', id, tab: str(a.tab) as Tab })
    } else if (name === 'explain_term' && str(a.term) && str(a.answer)) {
      const s = str(a.source)
      cards.push({ kind: 'explain', id, term: str(a.term), answer: str(a.answer), source: s === 'wikipedia' || s === 'kiwix' ? s : 'medlineplus' })
    } else if (name === 'whats_the_weather') cards.push({ kind: 'weather', id })
  })
  return { text: typeof o.reply === 'string' ? o.reply : '', cards }
}

/** Source links are built here, never taken from the model. */
export function sourceLink(source: Source, term: string, kiwix = (import.meta.env.VITE_KIWIX_URL as string | undefined) ?? '') {
  const q = encodeURIComponent(term)
  if (source === 'kiwix' && kiwix) return { url: `${kiwix.replace(/\/$/, '')}/search?pattern=${q}`, label: 'Offline library (Kiwix)' }
  if (source === 'wikipedia') return { url: `https://en.wikipedia.org/wiki/Special:Search?search=${q}`, label: 'Read more on Wikipedia (CC BY-SA 4.0)' }
  return { url: `https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&query=${q}`, label: 'MedlinePlus, medlineplus.gov' }
}

export interface People { id: string; name: string }
/** No match means undefined: the card asks the user to pick, nobody is guessed. */
export const personFor = (name: string, people: People[]) =>
  people.find((p) => p.id === name) ?? people.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())

const num = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : null)
const when = (s: string, now: Date) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : now.toISOString())

/** Returns an error string when the draft is not complete enough to save. */
export function validateDraft(tool: DraftTool, f: Record<string, string>, people: People[]): string | null {
  if (!personFor(f.person ?? '', people)) return people.length ? 'Pick who this is for.' : 'Add a family member first.'
  if (tool === 'log_reading' && (!f.test?.trim() || num(f.value ?? '') === null)) return 'Needs a test name and a number.'
  if (tool === 'log_med_taken' && !f.name?.trim()) return 'Needs a medicine name.'
  if (tool === 'log_activity' && (!f.kind?.trim() || (num(f.minutes ?? '') === null && num(f.steps ?? '') === null))) return 'Needs an activity and minutes or steps.'
  return null
}

export interface LogApi {
  logReading: (r: Reading) => Promise<unknown>
  logMedTaken: (m: MedTaken) => Promise<unknown>
  logActivity: (a: Activity) => Promise<unknown>
}

/** The only place a draft becomes a saved record. Called by Confirm. */
export async function confirmDraft(tool: DraftTool, f: Record<string, string>, people: People[], api: LogApi, now = new Date()) {
  if (validateDraft(tool, f, people)) throw new Error('incomplete')
  const personId = personFor(f.person ?? '', people)!.id
  if (tool === 'log_reading') {
    const r: Reading = { personId, takenAt: when(f.takenAt ?? '', now), test: f.test!.trim(), value: num(f.value!)! }
    if (f.unit?.trim()) r.unit = f.unit.trim()
    return api.logReading(r)
  }
  if (tool === 'log_med_taken') return api.logMedTaken({ personId, name: f.name!.trim(), takenAt: when(f.takenAt ?? '', now) })
  return api.logActivity({ personId, kind: f.kind!.trim(), minutes: num(f.minutes ?? ''), steps: num(f.steps ?? ''), startedAt: when(f.startedAt ?? '', now), source: 'manual' })
}
