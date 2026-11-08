import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import catalog from '../../../scripts/import/test-catalog.json'
import { GUIDE } from './ranges'
import { LAB_GLOSSARY, labEntry } from './labGlossary'
import { attentionLine, gapWords, labInfo, labRow, loadLabGlossary, plainWords } from './labsLogic'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../records/useRecordsServer', () => ({ useConfirmedDocs: () => [] }))
vi.mock('./useVisits', () => ({ useVisits: () => ({ next: null }) }))
import { LabDetail } from './LabDetail'
import Article from './library/Article'
import { AttentionHero } from './AttentionHero'
import { pickAttention } from './attention'

afterEach(cleanup)

const alt = { personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'alt', value: 98, unit: 'U/L', labLow: 7, labHigh: 40 }

beforeAll(async () => { await loadLabGlossary() }) // the glossary is its own lazy chunk

describe('lab glossary coverage', () => {
  it('has an entry for every code and alias the importer maps', () => {
    const missing: string[] = []
    for (const t of catalog) for (const k of [t.code, t.name, ...t.aliases]) if (!labEntry(k)) missing.push(`${t.code}:${k}`)
    expect(missing).toEqual([])
  })
  it('has an entry for every lab code the guide ranges name (vitals aside)', () => {
    for (const k of Object.keys(GUIDE).filter((x) => !/^bp_|heart_rate/.test(x))) expect(labEntry(k), k).not.toBeNull()
  })
  it('every entry is complete and cites a MedlinePlus page', () => {
    for (const e of LAB_GLOSSARY) {
      expect(e.url, e.code).toMatch(/^https:\/\/medlineplus\.gov\/lab-tests\//)
      for (const f of [e.organ, e.short, e.what, e.high, e.low]) expect(f.length, e.code).toBeGreaterThan(5)
      expect(e.affects.length, e.code).toBeGreaterThan(0)
      expect(e.ask.length, e.code).toBeGreaterThan(0)
    }
  })
  it('codes are unique', () => expect(new Set(LAB_GLOSSARY.map((e) => e.code)).size).toBe(LAB_GLOSSARY.length))
  it('resolves SGPT and unknown tests honestly', () => {
    expect(labEntry('SGPT')?.code).toBe('alt')
    expect(labEntry('zinc_level')).toBeNull()
    expect(labInfo('zinc_level').known).toBe(false)
  })
})

describe('Needs-attention subtext', () => {
  it('names what the test is and how far out, about 2x for 98 against a top of 40', () => {
    expect(attentionLine(labRow(alt))).toBe('Liver enzyme · about 2× the top of normal')
  })
  it('is empty for a test the glossary does not know', () => {
    expect(attentionLine(labRow({ ...alt, test: 'zinc_level' }))).toBe('')
  })
  it('shows on the Health card', () => {
    const att = pickAttention([alt], () => undefined, new Date('2026-10-10T00:00:00'))
    render(<AttentionHero attention={att} canLog canEdit onAdd={() => undefined} />)
    expect(screen.getByTestId('ah-what').textContent).toBe('Liver enzyme · about 2× the top of normal')
  })
})

describe('ALT lab page and library', () => {
  it('shows the glossary sections instead of the generic text', () => {
    render(<LabDetail code="alt" readings={[alt]} personId="p1" />)
    expect(screen.getByTestId('lab-short').textContent).toBe('An enzyme that mostly sits inside liver cells')
    expect(screen.getByTestId('lab-measures').textContent).toContain('ALT is an enzyme found mostly in the liver')
    expect(screen.getByRole('heading', { name: 'What a high or low result can mean' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Things that can affect it' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ask at next visit' }).getAttribute('href')).toBe('#health/visits')
    expect(screen.getByTestId('lab-library').getAttribute('href')).toBe('#health/library/t%3Aalt')
    expect(document.body.textContent).not.toContain('A test from your lab results')
  })
  it('the library article for t:alt shows the same text without a network request', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<Article rawKey="t:alt" />)
    expect((await screen.findByTestId('lab-measures')).textContent).toContain('ALT is an enzyme found mostly in the liver')
    expect(f).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('gapWords agrees with plainWords', () => {
  const cases: Array<[number, number | null, number | null]> = [[44, 7, 40], [98, 7, 40], [6, 7.5, 40], [2, 7, 40], [5, null, 0], [0, 7, 40]]
  it.each(cases)('value %s', (value, labLow, labHigh) => {
    const row = labRow({ ...alt, value, labLow, labHigh })
    const g = gapWords(row)
    expect(g).not.toMatch(/Infinity|NaN/)
    expect(plainWords(value, row.range)).toContain(g.replace(/about (\d+)×/, 'about $1 times'))
  })
  it('is empty inside the range', () => expect(gapWords(labRow({ ...alt, value: 20 }))).toBe(''))
})

describe('glucose and tone', () => {
  it('a plain glucose reading is the after-eating test, not the fasting one', () => expect(labEntry('glucose')?.code).toBe('random_glucose'))
  it('no entry gives a medicine instruction or a diagnosis cut-off', () => {
    const all = LAB_GLOSSARY.flatMap((e) => [e.what, e.high, e.low, ...e.affects]).join(' ')
    expect(all).not.toMatch(/do not stop|5\.7%|6\.5%/i)
  })
  it('every low line that names a serious cause carries the reassurance', () => {
    for (const c of ['wbc', 'hematocrit', 'platelets', 'hemoglobin']) expect(labEntry(c)?.low, c).toContain('does not mean you have a condition')
  })
})
