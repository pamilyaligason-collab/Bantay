import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabsList, LabsRow } from './LabsList'
import type { LabSource } from './labsLogic'
import type { Reading } from './ranges'

afterEach(cleanup)
const rd = (test: string, value: number, extra: Partial<Reading> = {}): Reading => ({ personId: 'p1', takenAt: '2026-10-02T12:00:00', test, value, unit: 'mg/dL', ...extra })
const none = new Map<string, LabSource>()
const paper = new Map<string, LabSource>([['f1', { facility: 'GenSan Medical Lab', docDate: '2026-10-02', file: { id: 'f1', name: 'labs.pdf', mime: 'application/pdf', drive_file_id: 'abc123', storage_path: null } }]])

describe('LabsList empty state', () => {
  it('says so when ready with no lab rows', () => {
    render(<LabsList readings={[]} thresholds={[]} ready sources={none} />)
    expect(screen.getByText('No lab papers yet')).toBeTruthy()
    expect(screen.getByText('A person checks every number.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scan a paper' })).toBeTruthy()
  })
  it('renders nothing until ready', () => {
    const { container } = render(<LabsList readings={[]} thresholds={[]} ready={false} sources={none} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('LabsList (mockup v8 health-labs)', () => {
  const readings = [
    rd('hba1c', 6.8, { unit: '%', labLow: 4, labHigh: 5.6, sourceFileId: 'f1' }),
    rd('hba1c', 7.1, { unit: '%', labLow: 4, labHigh: 5.6, takenAt: '2026-07-03T12:00:00' }),
    rd('ldl', 162),
    rd('creatinine', 0.9, { labLow: 0.6, labHigh: 1.3 }),
    rd('mystery', 5)
  ]
  it('a date on every result, and whose range each one uses', () => {
    const { container } = render(<LabsList readings={readings} thresholds={[]} ready sources={paper} />)
    const cards = Array.from(container.querySelectorAll('a.lr-card'))
    expect(cards).toHaveLength(4)
    expect(cards.every((c) => within(c as HTMLElement).getByTestId('lab-date').textContent === '2 Oct')).toBe(true)
    const by = (t: string) => container.querySelector(`[data-test="${t}"]`) as HTMLElement
    expect(within(by('hba1c')).getByTestId('lab-range').textContent).toBe('Lab range 4 to 5.6')
    expect(within(by('ldl')).getByTestId('lab-range').textContent).toMatch(/^General guide \(.+, \d{4}\): /)
    expect(within(by('mystery')).getByTestId('lab-range').textContent).toBe('No range printed on the paper')
    expect(within(by('hba1c')).getByText('Ask about it')).toBeTruthy()
    expect(within(by('creatinine')).queryByText('Ask about it')).toBeNull()
  })
  it('the source card names the lab and date and is the link to Papers; out of range tests come first', () => {
    const { container } = render(<LabsList readings={readings} thresholds={[]} ready sources={paper} />)
    const src = screen.getByTestId('lab-source')
    expect(src.textContent).toContain('GenSan Medical Lab · 2 Oct 2026')
    expect(src.textContent).toContain('general guide') // mixed with results that print no range, so the guide line shows instead of W-30
    expect(src.getAttribute('href')).toBe('#family/papers')
    expect(Array.from(container.querySelectorAll('a.lr-card')).map((c) => c.getAttribute('data-test'))).toEqual(['hba1c', 'ldl', 'creatinine', 'mystery'])
  })
  it('Show previous result: a hollow mark and the Before line, off hides both', () => {
    const { container } = render(<LabsList readings={readings} thresholds={[]} ready sources={paper} />)
    const sw = screen.getByRole('switch', { name: 'Show previous result' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(within(container.querySelector('[data-test="hba1c"]') as HTMLElement).getByTestId('lab-before').textContent).toBe('Before: 7.1 % on 3 Jul · down 0.3 · closer to the range')
    expect(container.querySelectorAll('[data-testid="lr-prev"]')).toHaveLength(1)
    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(container.querySelectorAll('[data-testid="lr-prev"]')).toHaveLength(0)
    expect(screen.queryByTestId('lab-before')).toBeNull()
  })
  it('chips filter to the ones to ask about and the ones in range', () => {
    const { container } = render(<LabsList readings={readings} thresholds={[]} ready sources={paper} />)
    fireEvent.click(screen.getByRole('button', { name: 'To ask about 2' }))
    expect(Array.from(container.querySelectorAll('a.lr-card')).map((c) => c.getAttribute('data-test'))).toEqual(['hba1c', 'ldl'])
    fireEvent.click(screen.getByRole('button', { name: 'In range 1' }))
    expect(Array.from(container.querySelectorAll('a.lr-card')).map((c) => c.getAttribute('data-test'))).toEqual(['creatinine'])
  })
  it('with no earlier result the switch stays but is off and says so; the source card is the link to Papers', () => {
    render(<LabsList readings={[rd('ldl', 162)]} thresholds={[]} ready sources={none} />)
    const sw = screen.getByRole('switch', { name: 'Show previous result' }) as HTMLButtonElement
    expect(sw.disabled).toBe(true)
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('No earlier result yet')).toBeTruthy()
    const src = screen.getByTestId('lab-source')
    expect(src.textContent).toContain('Lab paper · 2 Oct 2026')
    expect(src.getAttribute('href')).toBe('#family/papers')
  })

  it('empty: drop icon copy, "A person checks every number." and a Scan a paper button that opens #scan', () => {
    render(<LabsList readings={[]} thresholds={[]} ready sources={none} />)
    expect(screen.getByText('No lab papers yet')).toBeTruthy()
    expect(screen.getByText('A person checks every number.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scan a paper' }))
    expect(location.hash).toBe('#scan')
  })

  it('all-lab ranges: the source card says the ranges are the lab own, not Bantay (W-30)', () => {
    render(<LabsList readings={[rd('creatinine', 0.9, { labLow: 0.6, labHigh: 1.3 })]} thresholds={[]} ready sources={none} />)
    expect(screen.getByTestId('lab-source').textContent).toContain("Ranges are the lab's own printed ranges, not Bantay's.")
  })

  it('keeps the v9 footer sentence', () => {
    render(<LabsList readings={[rd('ldl', 162)]} thresholds={[]} ready sources={none} />)
    expect(screen.getByText('A result outside the range is a question for your doctor, not a diagnosis. Tap a test to see what it means and the last 3 results.')).toBeTruthy()
  })
})

describe('LabsRow', () => {
  it('is one row to the Lab results screen with the date of the last paper', () => {
    render(<LabsRow readings={[rd('ldl', 162), rd('bp_systolic', 130, { takenAt: '2026-10-20T00:00:00Z' })]} />)
    const row = screen.getByTestId('labs-row')
    expect(row.getAttribute('href')).toBe('#health/labs')
    expect(row.textContent).toBe('Lab resultsLast paper 2 Oct 2026')
  })
  it('says no papers yet without lab results', () => {
    render(<LabsRow readings={[]} />)
    expect(screen.getByTestId('labs-row').textContent).toBe('Lab resultsNo papers yet')
  })
})
