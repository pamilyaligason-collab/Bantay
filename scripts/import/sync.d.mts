export type Entry = {
  drive_file_id: string; name: string; mime: string; size: number | null; modified: string | null; md5: string | null
  path: string; person_folder: string; kind_guess: string; date_guess: string; lane?: string | null; skipped: string | null
  sha256?: string; duplicate_of?: string | null; stored_mime?: string; download_failed?: boolean
}
export function skipReason(row: { name: string; path: string; mime: string; size: string | number | null }): string | null
export function toEntry(row: Record<string, any>): Entry
export function needsDownload(entry: Entry, prev: Entry | undefined, fileExists: boolean): boolean
export function markDuplicates(entries: Entry[]): Entry[]
export function localPathId(rel: string): string
export function dryRunCounts(entries: Entry[], peopleMap?: Record<string, string>): { files: number; by_lane: Record<string, number>; skipped: Record<string, number>; by_person_lane: Record<string, Record<string, number>>; unassigned: number }
export function sha256(buf: Uint8Array): string
export function carryOver(entry: Entry, prev: Entry): Entry
export function idsFromCopyLog(jobs: { src: string; folder: string[]; title: string }[], log: { src: string; status: string; new_id?: string }[]): Map<string, string>
