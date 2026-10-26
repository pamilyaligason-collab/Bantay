import { describe, expect, it } from 'vitest'

// Every icon in the app is <Icon>. Text arrows and hand-written <path d=> icons drift in size, weight and tone,
// so this fails on both. Real graphics (charts, sparklines, body art) are allowlisted by file.
const files = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sources = Object.entries(files).filter(([f]) => !/\.test\.tsx$/.test(f))

const GRAPHICS = [
  '/src/features/anatomy/Silhouette.tsx', // body art
  '/src/features/health/MetricChart.tsx', // chart line
  '/src/features/health/LatestList.tsx', // sparkline
  '/src/features/weather/WeatherScene.tsx' // weather scene cloud
]

describe('no glyph or hand-drawn icons', () => {
  it('scans the app source', () => expect(sources.length).toBeGreaterThan(50))
  it('has no text arrows used as icons', () => {
    const bad = sources.filter(([, src]) => /[›‹↗←]/.test(src)).map(([f]) => f)
    expect(bad).toEqual([])
  })
  it('has no <path d= outside the graphics allowlist', () => {
    const bad = sources.filter(([f, src]) => !GRAPHICS.includes(f) && /<path\s+d=/.test(src)).map(([f]) => f)
    expect(bad).toEqual([])
  })
  it('keeps the allowlist honest', () => {
    const unused = GRAPHICS.filter((f) => !sources.some(([n, src]) => n === f && /<path\s+d=/.test(src)))
    expect(unused).toEqual([])
  })
})
