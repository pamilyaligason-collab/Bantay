export const plain: (s: string) => string
export function simplify(ring: number[][], tol: number): number[][]
export function buildUnits(
  geojson: { features: { properties: { shapeName?: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] },
  units: { code: string; name: string }[], sha256: string, tol?: number
): { file: { format: 1; source: string; sha256: string; units: { code: string; name: string; bbox: [number, number, number, number]; polys: number[][][][] }[] }; noUnit: string[]; noShape: string[] }
