import type { ReactNode } from 'react'

export const NOT_CONNECTED = 'Not connected yet. Admin tools need the internet and the Bantay server.'
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }) : 'Never')
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
