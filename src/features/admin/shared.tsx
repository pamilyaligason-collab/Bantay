import type { ReactNode } from 'react'

export const NOT_CONNECTED = 'Not connected yet. Admin tools need the internet and the Bantay server.'
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }) : 'Never')
const MANILA = { timeZone: 'Asia/Manila' } as const
const dt = (iso: string | null | undefined) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d : null }
const sameYear = (d: Date) => d.toLocaleDateString('en-PH', { ...MANILA, year: 'numeric' }) === new Date().toLocaleDateString('en-PH', { ...MANILA, year: 'numeric' })
/** Tables: "17 Oct 2026". Unknown date is a dash, never today. */
export const day = (iso: string | null | undefined) => { const d = dt(iso); return d ? d.toLocaleDateString('en-GB', { ...MANILA, day: 'numeric', month: 'short', year: 'numeric' }) : '-' }
/** Logs: "17 Oct, 8:12 AM"; the year shows only when it is not this year. */
export const dateTime = (iso: string | null | undefined) => {
  const d = dt(iso); if (!d) return '-'
  return `${d.toLocaleDateString('en-GB', { ...MANILA, day: 'numeric', month: 'short', ...(sameYear(d) ? {} : { year: 'numeric' }) })}, ${d.toLocaleTimeString('en-PH', { ...MANILA, hour: 'numeric', minute: '2-digit' })}`
}
/** One plain-words label for raw status and audit-action values. */
export const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed', draft: 'Draft', rejected: 'Rejected', failed: 'Failed', reading: 'Reading', new: 'New', done: 'Done', archived: 'Archived',
  insert: 'Added', update: 'Changed', delete: 'Removed', archive: 'Archived', restore: 'Restored', confirm: 'Confirmed', reject: 'Rejected',
}
/** Unknown values get a capital letter and spaces for underscores; null is a dash. */
export const label = (raw: string | null | undefined) => (raw ? STATUS_LABEL[raw.toLowerCase()] ?? raw.charAt(0).toUpperCase() + raw.slice(1).replaceAll('_', ' ') : '-')
export const why = (e: string) =>
  e === 'not_connected' ? NOT_CONNECTED
  : e === 'not_admin' ? 'Only an admin can do this.'
  : e === 'handle_taken' ? 'That sign-in name is taken.'
  : e === 'bad_input' ? 'Check what you typed and try again.'
  : e === 'not_found' ? 'That member was not found.'
  : e === 'forbidden' ? 'This link cannot be removed.'
  : 'Something went wrong. Try again.'

/** Opens the confirm bar. `abort` runs when it is cancelled or fails (the add form clears its PIN there). */
export type Ask = (text: string, run: () => Promise<void>, abort?: () => void) => void

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="ad-lbl">{label}{children}</label>
}
