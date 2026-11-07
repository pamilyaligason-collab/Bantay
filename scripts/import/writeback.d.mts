export type WbRow = {
  key: string; type: 'file' | 'labs'; person_id: string; kind: string; doc_id: string
  doc_date?: string | null; created_at?: string | null; page?: number; ext?: string; sha256?: string; storage_path?: string; csv?: string
}
export type WbAction = { key: string; action: 'write' | 'skip' | 'conflict' | 'unmapped' | 'bad_dest'; dest?: string }
export const EXCLUDED_KINDS: Set<string>
export const LABS_COLS: string[]
export function docDay(row: { doc_date?: string | null; created_at?: string | null }): string
export function destName(row: WbRow): string
export function eligible(row: { kind: string }): boolean
export function planWrites(rows: WbRow[], manifest: Record<string, { dest: string; sha256: string }>, mapping: Record<string, string>, existsFn: (p: string) => boolean, root?: string): WbAction[]
export function applyPlan(plan: Record<string, unknown>[], manifest: Record<string, { dest: string; sha256: string; written_at?: string }>, write: boolean, srcDir: string, save?: (m: unknown) => void): { written: number; would_write: number; sha_mismatch: number; missing_download: number; failed: number }
export function undoManifest(manifest: Record<string, { dest: string; sha256: string }>, write: boolean): { removed: number; would_remove: number; already_gone: number; changed: number; failed: number }
export function labsCsv(rows: Record<string, unknown>[]): string
export function rowsOf(v: unknown): Record<string, unknown>[]
export function buildMap(people: { id: string; display_name: string }[], folders: string[], root: string): { map: Record<string, string>; missing: number }
export function buildRows(fileRows: Record<string, string>[], labRows: Record<string, unknown>[]): WbRow[]
