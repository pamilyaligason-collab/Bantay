import { describe, expect, it } from 'vitest'
import { render, within } from '@testing-library/react'
import { LatestList } from './LatestList'
import { latestVsNormal, rangeState, type Reading } from './ranges'
import { previewReading, entrySpec } from './readingPreview'

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
      if (t !== 185) expect(previewReading(entrySpec('bp')!, { top: String(t), bottom: String(b) }).word).toBe(word)
    })
    it(`${t}/${b} metric headline chip (latestVsNormal) reads ${word}`, () => {
      expect(rangeState(latestVsNormal(R('bp_systolic', t)).headline, 'bp', { top: t, bottom: b }).word).toBe(word)
    })
  }
})
