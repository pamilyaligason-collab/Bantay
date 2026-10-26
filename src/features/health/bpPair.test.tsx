import { describe, expect, it } from 'vitest'
import { render, within } from '@testing-library/react'
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
      expect(previewReading(entrySpec('bp')!, { top: String(t), bottom: String(b) }, sh ? TH('bp_systolic', sh) : null, dh ? TH('bp_diastolic', dh) : null).word).toBe(word)
      const doctor = { top: sh ? TH('bp_systolic', sh) : null, bottom: dh ? TH('bp_diastolic', dh) : null }
      expect(rangeState('within', 'bp', { top: t, bottom: b, doctor }).word).toBe(word)
      const { container: c2 } = render(<BpWord top={t} bottom={b} doctor={doctor} />)
      expect(c2.textContent).toContain(word)
    })
  }
  it('a doctor low target is ignored: 118/70 with sys low 125 stays In range', () => {
    expect(bpPairLevel(118, 70, { top: { high: null }, bottom: null })).toBe('in')
  })
  it('BpWord shows nothing for an unknown pair, never In range', () => {
    const { container } = render(<BpWord top={NaN} bottom={NaN} />)
    expect(container.textContent).toBe('')
  })
  it('185/95 preview is the crisis word and line, with and without targets', () => {
    expect(previewReading(entrySpec('bp')!, { top: '185', bottom: '95' })).toMatchObject({ word: 'High', line: 'Very high. Check for warning signs now.' })
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
