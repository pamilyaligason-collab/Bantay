export const AUTO_THRESHOLD: number
export type AliasConfig = { people: { name: string; aliases: string[]; dependent: boolean }[] }
export type Strength = 'both' | 'folder' | 'weak' | 'printed' | 'conflict' | 'none'
export type Matcher = { idx: Map<string, string>; multi: { t: Set<string>; id: string }[] }
export function stripNumber(s: string): string
export function resolveThreshold(t?: number): number
export function parseAliasConfig(cfg: unknown): AliasConfig
export function extractPeopleRows(json: unknown): { id: string; display_name: string }[]
export function buildPeopleMap(cfg: AliasConfig, dbPeople: { id: string; display_name: string }[]): { map: Record<string, string>; missing: string[]; ambiguous: number }
export function dependentsSql(cfg: AliasConfig): string
export function buildMatcher(peopleMap: Record<string, string>): Matcher
export function printedHit(m: Matcher, printed: string | null | undefined): string | null
export function matchPerson(m: Matcher, o: { segments: string[]; printed?: string | null }): { id: string | null; strength: Strength }
export function gate(o: { strength: Strength; confidence: number | null | undefined; lane?: string; threshold?: number }): 'confirmed' | 'draft'
export const PROFILE_FIELDS: Record<string, (v: unknown) => string | null>
export function pickField(cands: { value: string | null; conf: number }[]): string | null
export function buildProfiles(items: { personId: string; fields: Record<string, unknown>; conf: number }[]): Map<string, Record<string, string>>
