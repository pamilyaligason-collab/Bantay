export interface SeedRow { [column: string]: string }
export interface Place {
  id: string; province_code: string; psgc_code: string | null; kind: string; name: string; address: string | null; phones: string[]
  lat: number | null; lon: number | null; capacity: number | null; status: 'confirmed' | 'not_confirmed'; source: string; source_url: string | null
  licence: string; source_date: string | null; last_verified_at: string | null; verified_by: string | null; confidence: 'high' | 'medium' | 'low'; notes: string | null
}
export interface Unit { psgc_code: string; name: string; neighbours?: string[] }
export const KINDS: string[]
export const COLUMNS: string[]
export const PACK_FORMAT: number
export function parseCsv(text: string): SeedRow[]
export function validateRow(r: SeedRow): string[]
export function dialable(p: string): boolean
export function splitPhones(p: string | undefined): string[]
export function toPlace(r: SeedRow, codes: Record<string, string>, lgus?: Record<string, string>, verifiedBy?: string): Place
export function buildPack(unit: Unit, places: Place[]): { body: string; checksum: string; size: number; rowCount: number }
export function staleRows<T extends { last_verified_at?: string | null }>(places: T[], days: number, today: string): T[]
export function nextVersion(latest: { version: number; checksum: string } | undefined, checksum: string): { version: number; changed: boolean }
export function hazardsEntry(code: string, manifest: Record<string, { pack?: string; bounds?: Record<string, number[]> }>, rows: { province_code: string; version: number; checksum: string; size_bytes: number; storage_path: string }[]): { pack: string; version: number; checksum: string; size: number; path: string; bounds?: Record<string, number[]> } | undefined
export interface BasemapFile { version: number; checksum: string; size: number; path: string; bounds: [number, number, number, number]; minzoom: number; maxzoom: number }
export interface BasemapManifest {
  basemaps?: Record<string, { pack?: string; version?: number; sha256?: string; size?: number; path?: string; bounds?: number[]; minzoom?: number; maxzoom?: number }>
  world?: { version: number; sha256: string; size: number; path: string; bounds: number[]; minzoom: number; maxzoom: number }
}
export function basemapEntry(code: string, manifest: BasemapManifest): (BasemapFile & { pack: string }) | undefined
export function worldEntry(manifest: BasemapManifest): BasemapFile | undefined
export function withBasemaps<T extends { packs: { code: string }[] }>(index: T, manifest: BasemapManifest): T & { world?: BasemapFile }
export function reachableManifest(manifest: BasemapManifest, base: string, fetchFn?: (url: string, init?: RequestInit) => Promise<{ status: number }>, log?: (line: string) => void): Promise<BasemapManifest>
