import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabsList } from './LabsList'
import type { Reading } from './ranges'

afterEach(cleanup)
const rd = (test: string, value: number, extra: Partial<Reading> = {}): Reading => ({ personId: 'p1', takenAt: '2026-10-20T00:00:00Z', test, value, unit: 'mg/dL', ...extra })

describe('LabsList empty state', () => {
  it('says so when ready with no lab rows', () => {
    render(<LabsList readings={[]} thresholds={[]} ready />)
    expect(screen.getByText('No lab results yet. Scan a paper with Ask.')).toBeTruthy()
  })
  it('renders nothing until ready', () => {
    const { container } = render(<LabsList readings={[]} thresholds={[]} ready={false} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('LabsList (S7)', () => {
  const readings = [rd('ldl', 226.74), rd('hdl', 55.04), rd('creatinine', 0.9, { labLow: 0.6, labHigh: 1.3 }), rd('mystery', 5)]
  it('shows one decimal, an open Ask about card, and every other result folded by panel', () => {
    const { container } = render(<LabsList readings={readings} thresholds={[]} ready />)
    const ask = container.querySelector('[data-group="ask"]') as HTMLElement
    expect(within(ask).getByText('226.7')).toBeTruthy() // 226.74 -> 226.7
    expect(container.textContent).not.toContain('226.74')
    const folds = Array.from(container.querySelectorAll('details.lr-fold'))
    expect(folds.map((d) => d.getAttribute('data-panel'))).toEqual(['Cholesterol', 'Kidney', 'Other'])
    expect(folds.every((d) => !(d as HTMLDetailsElement).open)).toBe(true) // collapsed until tapped
    expect(within(folds[0] as HTMLElement).getByText('1 result')).toBeTruthy() // hdl (ldl is in Ask about)
    expect(container.querySelectorAll('a.lr-line')).toHaveLength(3) // hdl, creatinine, mystery as one-line rows
  })
})
