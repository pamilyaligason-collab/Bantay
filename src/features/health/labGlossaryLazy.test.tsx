import 'fake-indexeddb/auto'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../records/useRecordsServer', () => ({ useConfirmedDocs: () => [] }))
vi.mock('./useVisits', () => ({ useVisits: () => ({ next: null }) }))
vi.mock('./useHealthPerson', () => ({ useHealthPerson: () => ({ personId: 'p1' }) }))
vi.mock('./useProfile', () => ({ useProfile: () => null }))
vi.mock('./useMedications', () => ({ useMedications: () => [] }))
vi.mock('../shell/WhoLine', () => ({ WhoLine: () => null }))

/** The lab glossary is its own lazy chunk. These tests hold the import open (gate) or make it fail, using fresh modules each time. */
let release: () => void
let calls = 0
let failFirst = false
beforeEach(() => {
  vi.resetModules()
  calls = 0
  failFirst = false
  const gate = new Promise<void>((r) => { release = r })
  vi.doMock('./labGlossary', async () => {
    calls++
    if (failFirst && calls === 1) throw new Error('chunk failed')
    await gate
    return await vi.importActual<typeof import('./labGlossary')>('./labGlossary')
  })
})
afterEach(() => { cleanup(); vi.doUnmock('./labGlossary') })

const ldl = { personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'ldl', value: 162, unit: 'mg/dL' }

describe('lab glossary before the chunk arrives', () => {
  it('Article t:alt shows Loading... until it lands, then the entry', async () => {
    const { default: Article } = await import('./library/Article')
    render(<Article rawKey="t:alt" />)
    expect(screen.getByRole('status').textContent).toBe('Loading...')
    expect(screen.queryByTestId('lab-measures')).toBeNull()
    await act(async () => { release() })
    expect((await screen.findByTestId('lab-measures')).textContent).toContain('ALT is an enzyme found mostly in the liver')
  })

  it('Library shows Loading... with an empty lab list, then the tests', async () => {
    const { default: Library } = await import('./library/Library')
    render(<Library />)
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Loading...')).toBe(true) // other cards may add their own live region
    expect(screen.getByTestId('library-labs').children.length).toBe(0)
    await act(async () => { release() })
    await vi.waitFor(() => expect(screen.getByTestId('library-labs').children.length).toBeGreaterThan(10))
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it('loadLabGlossary retries after a failed import', async () => {
    failFirst = true
    const { loadLabGlossary } = await import('./labsLogic')
    await vi.waitFor(() => expect(calls).toBe(1)) // the idle prefetch took the failure
    await new Promise((r) => setTimeout(r, 0)) // let it clear the failed promise
    release()
    const m = await loadLabGlossary()
    expect(calls).toBe(2)
    expect(m.labEntry('alt')?.code).toBe('alt')
  })

  it('LabsList: Add to visit questions is disabled until the glossary is in, so the neutral question is never saved', async () => {
    const { LabsList } = await import('./LabsList')
    render(<LabsList readings={[ldl]} thresholds={[]} ready sources={new Map()} personId="p1" canMark />)
    const adds = screen.getAllByRole('button', { name: /^Add to visit questions/ }) as HTMLButtonElement[]
    expect(adds.length).toBe(3)
    expect(adds.every((b) => b.disabled)).toBe(true)
    expect(document.body.textContent).toContain('What does this result mean for me?')
    await act(async () => { release() })
    await vi.waitFor(() => expect((screen.getAllByRole('button', { name: /^Add to visit questions/ }) as HTMLButtonElement[]).every((b) => !b.disabled)).toBe(true))
    expect(document.body.textContent).not.toContain('What does this result mean for me?')
  })

  it('LabDetail: Add to visit list is disabled until the glossary is in', async () => {
    const { LabDetail } = await import('./LabDetail')
    render(<LabDetail code="ldl" readings={[ldl]} personId="p1" />)
    const adds = screen.getAllByRole('button', { name: /^Add to visit list/ }) as HTMLButtonElement[]
    expect(adds.every((b) => b.disabled)).toBe(true)
    await act(async () => { release() })
    await vi.waitFor(() => expect((screen.getAllByRole('button', { name: /^Add to visit list/ }) as HTMLButtonElement[]).every((b) => !b.disabled)).toBe(true))
  })
})
