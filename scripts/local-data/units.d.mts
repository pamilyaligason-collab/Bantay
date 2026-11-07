export const plain: (s: string) => string
export function simplify(ring: number[][], tol: number): number[][]
export function nest<T extends { code: string; bbox: number[]; polys: number[][][][]; parent?: string }>(units: T[]): T[]
type Feats = { features: { properties: { shapeName?: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] }
export function cityGaps(adm3: Feats, units: { code: string; bbox: number[]; polys: number[][][][] }[], lgus: { psgc_code: string; province_code: string; name: string; kind: string }[]): { outside: string[]; unmatched: string[] }
export function buildUnits(
  geojson: Feats,
  units: { code: string; name: string }[], sha256: string, tol?: number,
  adm3?: Feats | null, lgus?: { psgc_code?: string; province_code: string; name: string; kind: string }[]
): { file: { format: 1; source: string; sha256: string; units: { code: string; name: string; bbox: [number, number, number, number]; polys: number[][][][]; parent?: string }[] }; noUnit: string[]; noShape: string[]; cityGaps: { outside: string[]; unmatched: string[] } }
