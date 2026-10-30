import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../db'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../setup/useProfile', async (orig) => ({ ...(await orig<typeof import('../setup/useProfile')>()), useSelfPersonId: () => 'p1' }))
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })

import Health from '../../screens/Health'
import MyWeek from '../today/MyWeek'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { resetPersonChoice } from '../records/useHealthData'
import MetricScreen from './MetricScreen'
import BpCheck from './bpcheck/BpCheck'

afterEach(cleanup) // no test may read an earlier test's rendered rows
import { LatestList } from './LatestList'
import { latestVsNormal, rangeState, type Reading } from './ranges'
import { previewReading, entrySpec } from './readingPreview'
import { bpHeadlineArg } from './MetricScreen'
import { BpWord } from './bpcheck/BpCheck'
import { bpPairLevel } from './verdict'

const T = '2026-10-20T07:00:00'
const R = (test: string, value: number): Reading => ({ personId: 'p1', test, value, unit: 'mmHg', takenAt: T } as Reading)
const cases: [number, number, string][] = [
  [118, 95, 'High'], [135, 80, 'High'], [134, 84, 'Above target'], [133, 83, 'Above target'], [138, 86, 'High'],
  [129, 79, 'A little raised'], [119, 79, 'In range'], [88, 58, 'Low'], [185, 95, 'High']
]

describe('blood pressure verdict is always from the pair (real path)', () => {
  for (const [t, b, word] of cases) {
    it(`${t}/${b} reads ${word} on both Vitals rows and in the add preview`, () => {
      const { container } = render(<LatestList ready readings={[R('bp_systolic', t), R('bp_diastolic', b)]} thresholds={[]} />)
      for (const test of ['bp_systolic', 'bp_diastolic']) {
        const row = container.querySelector(`[data-test="${test}"]`) as HTMLElement
        expect(row.querySelector('.hv-state')!.textContent).toContain(word)
        expect(within(row).getByText(String(test === 'bp_systolic' ? t : b))).toBeTruthy()
      }
      expect(previewReading(entrySpec('bp')!, { top: String(t), bottom: String(b) }).word).toBe(word)
    })
    it(`${t}/${b} metric headline chip (latestVsNormal) reads ${word}`, () => {
      expect(rangeState(latestVsNormal(R('bp_systolic', t)).headline, 'bp', { top: t, bottom: b }).word).toBe(word)
    })
  }
})

const TH = (test: string, high: number) => ({ key: `p1:${test}`, low: null, high })
describe('a doctor target lifts the PAIR, so both rows, the headline, the preview and the check say one word', () => {
  // [sys high, dia high, top, bottom, word] hand-computed: 118>115; 78>75; 128>125 (raised lifts); 135 stays High under a loose 140
  const cases: [number | null, number | null, number, number, string][] = [
    [115, null, 118, 70, 'Above target'], [null, 75, 118, 78, 'Above target'], [125, null, 128, 75, 'Above target'], [140, null, 135, 80, 'High'], [125, 85, 120, 70, 'A little raised']
  ]
  for (const [sh, dh, t, b, word] of cases) {
    it(`target ${sh ?? '-'}/${dh ?? '-'} with ${t}/${b} reads ${word} on both rows (LatestList with thresholds)`, () => {
      const th = [...(sh ? [TH('bp_systolic', sh)] : []), ...(dh ? [TH('bp_diastolic', dh)] : [])]
      const { container } = render(<LatestList ready readings={[R('bp_systolic', t), R('bp_diastolic', b)]} thresholds={th} />)
      for (const test of ['bp_systolic', 'bp_diastolic']) expect(container.querySelector(`[data-test="${test}"] .hv-state`)!.textContent).toContain(word)
      const doctor = { top: sh ? TH('bp_systolic', sh) : null, bottom: dh ? TH('bp_diastolic', dh) : null }
      expect(previewReading(entrySpec('bp')!, { top: String(t), bottom: String(b) }, null, doctor).word).toBe(word)
      expect(rangeState('within', 'bp', { top: t, bottom: b, doctor }).word).toBe(word)
      const { container: c2 } = render(<BpWord top={t} bottom={b} doctor={doctor} />)
      expect(c2.textContent).toContain(word)
    })
  }
  it('a doctor low target is ignored: 118/70 with sys low 125 stays In range (helper, both rows, preview)', () => {
    const low = { key: 'p1:bp_systolic', low: 125, high: null } // 118 < 125 would be "below" if the floor were read
    expect(bpPairLevel(118, 70, { top: low, bottom: null })).toBe('in')
    const { container } = render(<LatestList ready readings={[R('bp_systolic', 118), R('bp_diastolic', 70)]} thresholds={[low]} />)
    for (const test of ['bp_systolic', 'bp_diastolic']) expect(container.querySelector(`[data-test="${test}"] .hv-state`)!.textContent).toContain('In range')
    expect(previewReading(entrySpec('bp')!, { top: '118', bottom: '70' }, null, { top: low }).word).toBe('In range')
  })
  it('BpWord shows nothing for an unknown pair, never In range', () => {
    const { container } = render(<BpWord top={NaN} bottom={NaN} />)
    expect(container.textContent).toBe('')
  })
  it('185/95 preview is the crisis word and line, with and without targets', () => {
    expect(previewReading(entrySpec('bp')!, { top: '185', bottom: '95' })).toMatchObject({ word: 'High', line: 'Very high. Check for warning signs now.' })
    const doctor = { top: TH('bp_systolic', 115), bottom: TH('bp_diastolic', 75) } // a target never softens or rewrites the crisis line
    expect(previewReading(entrySpec('bp')!, { top: '185', bottom: '95' }, null, doctor)).toMatchObject({ word: 'High', line: 'Very high. Check for warning signs now.' })
    expect(bpPairLevel(185, 95, doctor)).toBe('high')
  })
})

describe('MetricScreen own pair finding (bpHeadlineArg)', () => {
  const at = (min: number) => `2026-10-20T07:${String(min).padStart(2, '0')}:00`
  const rs = [{ ...R('bp_systolic', 118), takenAt: at(40) }, { ...R('bp_diastolic', 78), takenAt: at(20) }, { ...R('bp_diastolic', 60), takenAt: '2026-10-20T05:00:00' }]
  it('pairs the diastolic within 30 minutes and ignores a far one', () => {
    expect(bpHeadlineArg(rs, 'bp_systolic', rs[0]!, undefined)).toMatchObject({ top: 118, bottom: 78 })
    expect(bpHeadlineArg(rs, 'bp_diastolic', rs[2]!, undefined)).toMatchObject({ top: undefined, bottom: 60 })
    expect(bpHeadlineArg(rs, 'bp_diastolic', rs[1]!, undefined)).toMatchObject({ top: 118, bottom: 78 })
  })
  it('the headline word with a dia target 75 on 118/78 is Above target', () => {
    const arg = bpHeadlineArg(rs, 'bp_systolic', rs[0]!, { top: null, bottom: { high: 75 } })
    expect(rangeState('within', 'bp', arg).word).toBe('Above target')
  })
})

// ONE invariant, rendered on every real surface: for one BP pair and one person's doctor targets, every surface says the same word.
// Hand-computed: (1) sys high 115, 118/70: table In range, 118 > 115 lifts -> Above target. (2) dia high 75, 118/70: 70 <= 75, no lift -> In range.
// (3) sys LOW 125 only, 118/70: a floor is ignored this phase -> In range. (4) dia high 75, 128/78: table A little raised, 78 > 75 lifts -> Above target.
type Th = { key: string; low: number | null; high: number | null }
const SURFACE_CASES: { name: string; th: Th[]; top: number; bottom: number; word: string }[] = [
  { name: 'sys high 115', th: [{ key: 'p1:bp_systolic', low: null, high: 115 }], top: 118, bottom: 70, word: 'Above target' },
  { name: 'dia high 75', th: [{ key: 'p1:bp_diastolic', low: null, high: 75 }], top: 118, bottom: 70, word: 'In range' },
  { name: 'sys low 125 only', th: [{ key: 'p1:bp_systolic', low: 125, high: null }], top: 118, bottom: 70, word: 'In range' },
  { name: 'dia high 75, raised pair', th: [{ key: 'p1:bp_diastolic', low: null, high: 75 }], top: 128, bottom: 78, word: 'Above target' }
]
const SLOW = { timeout: 8000 }
const ago = () => new Date(Date.now() - 60 * 60_000).toISOString() // one hour ago: today, in My week, and the latest for the KPI
async function seed(th: Th[], top: number, bottom: number) {
  resetPersonChoice()
  await Promise.all([db.kv.clear(), db.outbox.clear(), hdb.readings.clear(), hdb.people.clear(), hdb.thresholds.clear(), ldb.meds.clear(), ldb.medications.clear()])
  await hdb.people.put({ id: 'p1', name: 'Maria Sample' })
  await hdb.thresholds.bulkPut(th)
  const at = ago()
  await hdb.readings.bulkAdd([{ personId: 'p1', test: 'bp_systolic', value: top, unit: 'mmHg', takenAt: at }, { personId: 'p1', test: 'bp_diastolic', value: bottom, unit: 'mmHg', takenAt: at }])
}
const txt = (el: Element | null | undefined) => el?.textContent ?? ''
const word = (el: Element | null | undefined) => txt(el).replace(/^\W+/, '').trim() // BpWord starts with its arrow or tick
const typeIn = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })

/** Every surface's word for the seeded pair: both Vitals rows, the KPI chip, My week, the headline, the reading list and the add preview on both metric routes, and the guided check. */
async function wordsOnEverySurface(top: number, bottom: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  location.hash = '#health/readings' // S16: the rows and the KPI chip live on Readings
  render(<Health />)
  await waitFor(() => expect(txt(document.querySelector('[data-test="bp_diastolic"] .hv-state'))).not.toBe(''), SLOW)
  await waitFor(() => expect(txt(document.querySelector('[data-kpi="bp_systolic"] .kp-chip'))).not.toBe(''), SLOW)
  out.rowTop = txt(document.querySelector('[data-test="bp_systolic"] .hv-state')).split('.')[0]!
  out.rowBottom = txt(document.querySelector('[data-test="bp_diastolic"] .hv-state')).split('.')[0]!
  out.kpi = txt(document.querySelector('[data-kpi="bp_systolic"] .kp-chip'))
  cleanup()

  render(<MyWeek />)
  await waitFor(() => expect(txt(document.querySelector('.td-chip'))).not.toBe(''), SLOW)
  out.myWeek = txt(document.querySelector('.td-chip'))
  cleanup()

  for (const code of ['bp_systolic', 'bp_diastolic']) {
    render(<MetricScreen code={code} />)
    const add = await screen.findByRole('button', { name: 'Add reading' }, SLOW)
    out[`headline ${code}`] = txt(document.querySelector('.hv-latest .hv-state')).split('.')[0]!
    out[`list ${code}`] = word(document.querySelector('[data-testid="recent"] .bc-lvl'))
    fireEvent.click(add)
    typeIn('Top', String(top)); typeIn('Bottom', String(bottom))
    out[`preview ${code}`] = txt(screen.getByTestId('reading-preview').querySelector('.hv-state'))
    cleanup()
  }

  // the guided check loads the targets itself (its own hdb.thresholds effect): two readings of the same pair, so the average is the pair
  render(<BpCheck personId="p1" forName="Maria" onClose={() => undefined} />)
  typeIn('Top', String(top)); typeIn('Bottom', String(bottom))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(screen.getByTestId('bp-check').getAttribute('data-step')).toBe('two'))
  vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61_000 })
  await waitFor(() => expect(screen.getByLabelText('Top')).toBeTruthy(), SLOW)
  typeIn('Top', String(top)); typeIn('Bottom', String(bottom))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByTestId('bp-avg').textContent).toBe(`${top}/${bottom}`), SLOW)
  await waitFor(() => expect(document.querySelectorAll('.bc-lvl').length).toBe(2), SLOW)
  const lv = [...document.querySelectorAll('.bc-lvl')].map(word)
  out.check = lv[0] ?? ''
  out.checkWeek = lv[1] ?? ''
  vi.useRealTimers()
  cleanup()
  return out
}

describe("one BP pair, one person's doctor targets: every surface shows the same word (real components)", () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })
  for (const c of SURFACE_CASES) {
    it(`${c.name}, ${c.top}/${c.bottom}: every surface reads ${c.word}`, async () => {
      await seed(c.th, c.top, c.bottom)
      const words = await wordsOnEverySurface(c.top, c.bottom)
      expect(Object.keys(words)).toHaveLength(12)
      expect(words).toEqual(Object.fromEntries(Object.keys(words).map((k) => [k, c.word])))
    }, 30_000)
  }

  it('185/95 with both targets set: rows, KPI, My week, both headlines and both previews say High with the crisis line; the check goes to the crisis card', async () => {
    await seed([{ key: 'p1:bp_systolic', low: null, high: 115 }, { key: 'p1:bp_diastolic', low: null, high: 75 }], 185, 95)
    location.hash = '#health/readings' // S16: the rows and the KPI chip live on Readings
    render(<Health />)
    await waitFor(() => expect(txt(document.querySelector('[data-kpi="bp_systolic"] .kp-chip'))).toBe('High'), SLOW)
    await waitFor(() => expect(txt(document.querySelector('[data-test="bp_systolic"] .hv-state'))).toMatch(/^High/), SLOW)
    expect(txt(document.querySelector('[data-test="bp_diastolic"] .hv-state'))).toMatch(/^High/)
    cleanup()
    render(<MyWeek />)
    await waitFor(() => expect(txt(document.querySelector('.td-chip'))).toBe('High'), SLOW)
    cleanup()
    for (const code of ['bp_systolic', 'bp_diastolic']) {
      render(<MetricScreen code={code} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Add reading' }, SLOW))
      expect(txt(document.querySelector('.hv-latest .hv-state'))).toMatch(/^High/)
      typeIn('Top', '185'); typeIn('Bottom', '95')
      expect(txt(screen.getByTestId('reading-preview').querySelector('.hv-state'))).toBe('High')
      expect(txt(screen.getByTestId('reading-preview'))).toContain('Very high. Check for warning signs now.')
      cleanup()
    }
    render(<BpCheck personId="p1" forName="Maria" onClose={() => undefined} />)
    typeIn('Top', '185'); typeIn('Bottom', '95')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByTestId('crisis-card', {}, SLOW)).toBeTruthy()
  }, 30_000)
})
