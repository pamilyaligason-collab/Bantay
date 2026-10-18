export type CatalogRow = { code: string; name: string; loinc: string | null; unit: string; aliases: string[]; conversions: Record<string, number> }
export function loadCatalog(): CatalogRow[]
export function parseCatalogSql(sql: string): CatalogRow[]
export function matchTest(name: string | null | undefined, catalog?: CatalogRow[]): string | null
export function normalizeUnit(u: string | null | undefined): string | null
export function toCanonical(value: number, unitRaw: string | null | undefined, code: string, catalog?: CatalogRow[]): number | null
export function parseNumber(v: unknown): { value_num: number | null; value_text: string | null }
export function normalizeFlag(f: unknown): 'H' | 'L' | 'N' | 'A' | null
export function normalizeTest(t: Record<string, unknown>, catalog?: CatalogRow[]): {
  panel: string | null; name_raw: string; test_code: string | null; value_num: number | null; value_text: string | null
  unit_raw: string | null; value_canonical: number | null; flag: string | null; ref_low: number | null; ref_high: number | null; ref_text: string | null
}
export function buildPeopleIndex(map: Record<string, string>): Map<string, string>
export function resolvePerson(idx: Map<string, string>, o: { folder?: string | null; printed?: string | null }): string | null
