import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[][])
vi.mock('../admin/events', () => ({ track: async (k: string, n: string) => { calls.push([k, n]); return true } }))
import { nameMismatch, confirmClearLabel, showConfirmAll, confirmAllLabel, emitConfirmed, progressPct, progressText } from './papers'

beforeEach(() => { calls.length = 0 })

describe('papers progress and confirm-all', () => {
  it('words the confirm-all button with the number of rows on the paper', () => {
    expect(confirmAllLabel(12)).toBe('Confirm all 12 from this paper')
    expect(confirmAllLabel(1)).toBe('Confirm all 1 from this paper')
  })
  it('counts "180 of 229 papers checked" and never goes past the total or below zero', () => {
    expect(progressText(180, 229)).toBe('180 of 229 papers checked')
    expect(progressText(300, 229)).toBe('229 of 229 papers checked')
    expect(progressText(-3, 10)).toBe('0 of 10 papers checked')
    expect(progressPct(180, 229)).toBe(79)
    expect(progressPct(0, 0)).toBe(0)
    expect(progressPct(5, 4)).toBe(100)
  })
  it('sends one records_confirmed per document, not per row, and not twice for the same document', () => {
    const seen = new Set<string>()
    expect(emitConfirmed('d1', seen)).toBe(true)
    expect(emitConfirmed('d1', seen)).toBe(false)
    expect(emitConfirmed('d2', seen)).toBe(true)
    expect(calls).toEqual([['action', 'records_confirmed'], ['action', 'records_confirmed']])
  })
})

describe('second confirm button', () => {
  it('shows only when it differs from Confirm all checked', () => {
    expect(showConfirmAll(5, 5)).toBe(false)
    expect(showConfirmAll(5, 3)).toBe(true)
    expect(showConfirmAll(0, 0)).toBe(false)
  })
  it('says clear lines when unclear ones are skipped', () => {
    expect(confirmClearLabel(4, true)).toBe('Confirm 4 clear lines')
    expect(confirmClearLabel(1, true)).toBe('Confirm 1 clear line')
    expect(confirmClearLabel(4, false)).toBe('Confirm all 4 from this paper')
  })
})

describe('nameMismatch (S11)', () => {
  it('flags another person, accepts reordered, partial and alias names, and treats an unread name as unknown', () => {
    expect(nameMismatch('Rosa Dela Cruz', 'Me (Jun)')).toBe(true)
    expect(nameMismatch('Rosa Dela Cruz', 'Juan Dela Cruz')).toBe(true)
    expect(nameMismatch('CRUZ, JUAN DELA', 'Juan Dela Cruz')).toBe(false)
    expect(nameMismatch('Juan D. Cruz', 'Juan Dela Cruz')).toBe(false)
    expect(nameMismatch('Jun Reyes', 'Me (Jun)')).toBe(false)
    expect(nameMismatch('Rosa Dela Cruz', 'Me (Jun)', ['Rosa Dela Cruz'])).toBe(false)
    expect(nameMismatch(null, 'Me (Jun)')).toBe(false)
    expect(nameMismatch('  ', 'Me (Jun)')).toBe(false)
  })
})
