import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import Me from './Me'

const FAMILY = ['Mama', 'Papa', 'Ate Joy', 'Lolo'].map((displayName, i) => ({ personId: `p${i}`, displayName, handle: null, provider: 'pin' }))

beforeEach(async () => {
  await db.kv.clear()
  localStorage.setItem('bantay.family', JSON.stringify(FAMILY))
})
afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.theme })

describe('Me', () => {
  it('sharing toggles start off (D-34)', async () => {
    render(<Me />)
    for (const n of ['Share readings', 'Share medicines', 'Share records', 'Share mood', 'Share live location'])
      expect((await screen.findByRole('switch', { name: n })).getAttribute('aria-checked')).toBe('false')
  })
  it('a sharing toggle is stored under share.<key>', async () => {
    render(<Me />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Share mood' }))
    expect(screen.getByRole('switch', { name: 'Share mood' }).getAttribute('aria-checked')).toBe('true')
    expect((await db.kv.get('share.mood'))?.value).toBe(true)
  })
  it('SOS text contacts allow at most two', async () => {
    render(<Me />)
    await userEvent.click(await screen.findByRole('button', { name: /Who gets your SOS text/ }))
    const boxes = await screen.findAllByRole('checkbox')
    await userEvent.click(boxes[0]); await userEvent.click(boxes[1]); await userEvent.click(boxes[2])
    expect(boxes.filter((b) => b.getAttribute('aria-checked') === 'true')).toHaveLength(2)
    expect(((await db.kv.get('sos.contacts'))?.value as string[]).length).toBe(2)
  })
  it('theme picker sets data-theme and system clears it', async () => {
    render(<Me />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect((await db.kv.get('look.theme'))?.value).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})
