import { describe, expect, it } from 'vitest'

// C-9 / C-6: the acting id is read only by an allowlist of UI files. Background, notification, sensor, SOS, privacy and setup paths never read it (D-99, B2-1).
const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sources = Object.entries(files).filter(([p]) => !/\.(test|spec)\.tsx?$/.test(p) && !p.startsWith('/src/features/viewas/'))
const READERS = /\b(getActingPersonId|useActingPersonId|useViewedVisibleIds)\b/

const ALLOWED: RegExp[] = [
  /^\/src\/screens\/(Today|Health|Family)\.tsx$/,
  /^\/src\/features\/today\/(QuickLog|NextUp|SimpleToday|useDueMeds|useMyTakes|MyWeek)\.tsx?$/,
  /^\/src\/features\/safety\/StormCard\.tsx$/,
  /^\/src\/features\/health\/(useHealthPerson|AddReadingSheet|LabsScreen)\.tsx?$/,
  /^\/src\/features\/nutrition\/(PlateSheet|WaterSheet|SaltSummary|NutritionScreen)\.tsx$/,
  /^\/src\/features\/exercise\/MoveScreen\.tsx$/,
  /^\/src\/features\/family\/(ProfileCard|FacesRow|Calendar)\.tsx$/,
  /^\/src\/features\/settings\//,
  /^\/src\/features\/inbox\/MissedDoseActions\.tsx$/,
  /^\/src\/features\/scan\/ScanFlow\.tsx$/,
  /^\/src\/features\/sync\/profile\.ts$/
]
const FORBIDDEN: RegExp[] = [
  /^\/src\/features\/today\/actions\.ts$/,
  /^\/src\/features\/nudge\//,
  /^\/src\/features\/health\/reminder[^/]*$/,
  /^\/src\/features\/sensors\//,
  /^\/src\/features\/sos\//,
  /^\/src\/features\/sync\/(?!profile\.ts$)/,
  /^\/src\/features\/privacy\//,
  /^\/src\/features\/setup\//,
  /^\/src\/features\/exercise\/(actions|data)\.ts$/,
  /^\/src\/db\.ts$/
]

describe('acting id import allowlist', () => {
  it('sees the source tree (guards against a glob that matches nothing)', () => {
    expect(sources.length).toBeGreaterThan(200)
    expect(sources.some(([p]) => p === '/src/features/today/actions.ts')).toBe(true)
  })
  it('only allowlisted files mention the three acting readers', () => {
    const bad = sources.filter(([p, s]) => READERS.test(s) && !ALLOWED.some((r) => r.test(p))).map(([p]) => p)
    expect(bad).toEqual([])
  })
  it('forbidden paths never import from viewas at all (sync/profile.ts is the one guard line and imports store.ts only)', () => {
    const bad = sources.filter(([p, s]) => FORBIDDEN.some((r) => r.test(p)) && /from ['"][./]*(?:[^'"]*\/)?viewas\//.test(s)).map(([p]) => p)
    expect(bad).toEqual([])
    const profile = files['/src/features/sync/profile.ts']!
    const imports = [...profile.matchAll(/from ['"]([^'"]*viewas[^'"]*)['"]/g)].map((m) => m[1])
    expect(imports).toEqual(['../viewas/store'])
  })
  it('db.ts enqueue and the SOS paths do not mention acting at all', () => {
    for (const p of ['/src/db.ts', '/src/features/sos/SosScreen.tsx']) expect(files[p] ?? '').not.toMatch(/viewas|Acting/)
  })
})
