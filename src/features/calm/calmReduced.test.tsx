// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../shell/useKv', () => ({ useKv: () => [[], () => undefined, true] }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: false, personId: null, name: '' }) }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p1' }))
import BreathSheet from '../today/BreathSheet'
import CalmCard from '../today/CalmCard'
import CalmHero from './CalmHero'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

const scale = (root: ParentNode) => (root.querySelector('.bo-orb') as HTMLElement).style.transform
const word = (root: ParentNode) => root.querySelector('.bo-word')?.textContent

describe('S22-C reduced motion: the sphere holds one scale, only the cues change', () => {
  it('CalmHero: the idle sphere does not move over two phases', () => {
    const { container } = render(<CalmHero />)
    const first = scale(container)
    expect(first).toBe('scale(0.78)')
    act(() => { vi.advanceTimersByTime(5000) })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(scale(container)).toBe(first)
  })
  it('CalmCard: the 84 px sphere does not move over two phases', () => {
    const { container } = render(<CalmCard />)
    const first = scale(container)
    expect(first).toBe('scale(0.78)')
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(scale(container)).toBe(first)
  })
  it('BreathSheet run: the scale is the same through two phases while the word changes', () => {
    render(<BreathSheet onClose={() => undefined} initial={{ pattern: 'calm', minutes: 1 }} />)
    const root = document.querySelector('[data-testid="sc-run"]') as HTMLElement
    const first = scale(root)
    const w0 = word(root)
    expect(first).toBe('scale(0.78)')
    act(() => { vi.advanceTimersByTime(4500) }) // calm box: 4 s per phase, so this is phase two
    expect(scale(root)).toBe(first)
    expect(word(root)).not.toBe(w0)
    act(() => { vi.advanceTimersByTime(4000) }) // phase three
    expect(scale(root)).toBe(first)
  })
})
