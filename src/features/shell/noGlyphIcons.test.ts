import { describe, expect, it } from 'vitest'

// Every icon in the app is <Icon>. Text arrows and hand-written <path d=> icons drift in size, weight and tone,
// so this fails on both. Real graphics (charts, sparklines, body art) are allowlisted by file.
const files = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sources = Object.entries(files).filter(([f]) => !/\.test\.tsx$/.test(f))

const GRAPHICS = [
  '/src/features/anatomy/Silhouette.tsx', // body art
  '/src/features/health/MetricChart.tsx', // chart line
  '/src/features/health/LatestList.tsx', // sparkline
  '/src/features/weather/WeatherScene.tsx', // weather scene cloud
  '/src/features/look/Tile.tsx', // tile sparkline (S16)
  '/src/features/look/CheckDraw.tsx' // the self-drawing check mark graphic (S16)
]

// Status marks drawn as text (check, cross, dash, circle) drift like text arrows do (ICON-JACK-AUDIT rule, D-103). Files owned by other lanes that still have one wait here
// until their owner swaps in <Icon>; the last test fails when an entry is fixed so the list only shrinks.
const GLYPH_DEBT = [
  '/src/features/admin/desk/Sharing.tsx', // view cell '✓'
  '/src/features/health/bpcheck/BpCheck.tsx', // level '✓'
  '/src/features/nudge/Pillbox.tsx' // ✓ – ○ cells and legend
]
const MARKS = /[✓✔✕✗○◯]|['"`>]\s*×\s*['"`<]/

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
  it('has no text check, cross or circle marks used as status icons', () => {
    const bad = sources.filter(([f, src]) => !GLYPH_DEBT.includes(f) && MARKS.test(src)).map(([f]) => f)
    expect(bad).toEqual([])
  })
  it('keeps the glyph debt list honest', () => {
    const fixed = GLYPH_DEBT.filter((f) => !sources.some(([n, src]) => n === f && MARKS.test(src)))
    expect(fixed).toEqual([])
  })
  it('keeps the allowlist honest', () => {
    const unused = GRAPHICS.filter((f) => !sources.some(([n, src]) => n === f && /<path\s+d=/.test(src)))
    expect(unused).toEqual([])
  })
})
