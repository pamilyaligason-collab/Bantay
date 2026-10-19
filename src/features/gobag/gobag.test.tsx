import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import GoBag from './GoBag'
import { ALL_IDS } from './items'
import { dueAgain, EMPTY, KEY, readState, toggle } from './state'

const DAY = 86_400_000

describe('go-bag state', () => {
  it('toggles an item and stamps the check date', () => {
    const a = toggle(EMPTY, 'water', 1000)
    expect(a).toEqual({ done: ['water'], checkedAt: 1000 })
    expect(toggle(a, 'water', 2000)).toEqual({ done: [], checkedAt: 2000 })
  })
  it('reads bad or old stored shapes safely', () => {
    expect(readState(null)).toEqual(EMPTY)
    expect(readState({ done: ['water', 'gone-item'], checkedAt: 'x' })).toEqual({ done: ['water'], checkedAt: null })
    expect(readState({ done: 'water', checkedAt: 0 })).toEqual(EMPTY)
  })
  it('is due when never checked or 90 days old', () => {
    expect(dueAgain(EMPTY, 1e12)).toBe(true)
    expect(dueAgain({ done: [], checkedAt: 1e12 - 89 * DAY }, 1e12)).toBe(false)
    expect(dueAgain({ done: [], checkedAt: 1e12 - 90 * DAY }, 1e12)).toBe(true)
  })
  it('has unique ids', () => { expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length) })
})

describe('GoBag screen', () => {
  beforeEach(async () => { await db.kv.clear() })
  afterEach(cleanup)

  it('saves a tick on this phone and restores it on the next open', async () => {
    const { unmount } = render(<GoBag />)
    const water = await screen.findByRole('checkbox', { name: /Drinking water/ })
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Not checked yet/))
    fireEvent.click(water)
    await waitFor(async () => expect(readState((await db.kv.get(KEY))?.value).done).toEqual(['water']))
    unmount()
    render(<GoBag />)
    const again = await screen.findByRole('checkbox', { name: /Drinking water/ })
    await waitFor(() => expect(again.getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByRole('status').textContent).toMatch(/Last checked .*Check again every 3 months/)
    expect(screen.getByText(`1 of ${ALL_IDS.length} packed`)).toBeTruthy()
  })
})
