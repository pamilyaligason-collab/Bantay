import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const acting = vi.hoisted(() => ({ ids: null as Set<string> | null }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: !!acting.ids, personId: 'p9', name: 'Mama' }), useViewedVisibleIds: () => acting.ids }))
import { hdb } from '../records/store'
import FacesRow, { faceName, faceStatus } from './FacesRow'
import NeedYouNow from './NeedYouNow'

afterEach(() => { cleanup(); acting.ids = null })

describe('faceStatus', () => {
  it('a flag beats a check-in; no news is not OK; before the first read nobody is OK', () => {
    expect(faceStatus({ known: true, checkedIn: true, flag: '2 to check' })).toEqual({ kind: 'look', word: 'Needs a look' })
    expect(faceStatus({ known: true, checkedIn: true, flag: 'All up to date' })).toEqual({ kind: 'ok', word: 'OK today' })
    expect(faceStatus({ known: true, checkedIn: false, flag: null })).toEqual({ kind: 'none', word: 'No news' })
    expect(faceStatus({ known: false, checkedIn: true, flag: null }).kind).toBe('none')
  })
})

describe('faceName', () => {
  it('first word, but a kinship title keeps the next word', () => {
    expect(faceName('Papa Ben')).toBe('Papa')
    expect(faceName('Ate Joy')).toBe('Ate Joy')
    expect(faceName('kuya Ben Reyes')).toBe('kuya Ben')
    expect(faceName('Ate')).toBe('Ate')
    expect(faceName('Lloyd Roc')).toBe('Lloyd')
  })
})

describe('FacesRow while acting', () => {
  it('lists only the viewed person\'s visible ids, says so once, and turns I\'m OK into View only', async () => {
    await hdb.people.bulkPut([{ id: 'p1', name: 'Lloyd Roc' }, { id: 'p2', name: 'Kuya Ben' }])
    acting.ids = new Set(['p2'])
    render(<FacesRow />)
    const list = await screen.findByRole('list', { name: 'Family roll call' })
    await waitFor(() => expect(list.querySelectorAll('li').length).toBe(1))
    expect(list.textContent).toContain('Kuya')
    expect(list.textContent).not.toContain('Lloyd')
    expect(screen.getByText('Showing only who Mama can see.')).toBeTruthy()
    expect((screen.getByRole('button', { name: /I'm OK/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('NeedYouNow', () => {
  it('draws nothing at all when nothing needs you', () => {
    const { container } = render(<NeedYouNow />)
    expect(container.textContent).toBe('')
  })
})
