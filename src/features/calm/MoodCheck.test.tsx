// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logFeeling = vi.hoisted(() => vi.fn())
const writer = vi.hoisted(() => ({ v: undefined as boolean | undefined }))
const acting = vi.hoisted(() => ({ id: 'me' as string | null, can: null as null | { mood: boolean; log: boolean; reason: string } }))
vi.mock('../today/actions', async (orig) => ({ ...(await orig<object>()), logFeeling, useHasWriterCarer: () => writer.v }))
vi.mock('../viewas/viewAs', async (orig) => ({ ...(await orig<object>()), useActingPersonId: () => acting.id, useActingCan: () => acting.can }))
beforeEach(() => { logFeeling.mockReset().mockResolvedValue('told'); writer.v = undefined; acting.id = 'me'; acting.can = null })
afterEach(cleanup)

import { feelingToast, moodLine } from '../today/actions'
import MoodCheck from './MoodCheck'

describe('MoodCheck', () => {
  it('four faces in the app order', () => {
    render(<MoodCheck />)
    const g = screen.getByRole('group', { name: 'How are you?' })
    expect(within(g).getAllByRole('button').map((b) => b.textContent)).toEqual(['Great', 'OK', 'Not great', 'Unwell'])
  })
  it('a face logs the feeling and says so', async () => {
    render(<MoodCheck />)
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    expect(logFeeling).toHaveBeenCalledWith('unwell', 'me')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(feelingToast('told')))
  })
  it('only promises the family alert when a writer carer exists (the repo moodLine rule)', () => {
    writer.v = true
    render(<MoodCheck />)
    expect(screen.getByText(moodLine(true))).toBeTruthy()
    cleanup(); writer.v = undefined; render(<MoodCheck />)
    expect(screen.getByText(moodLine(undefined))).toBeTruthy()
    expect(screen.queryByText(/tells your family/)).toBeNull()
  })
  it('never says the family will see it when no writer carer exists, and shows one line after the tap', async () => {
    render(<MoodCheck />)
    fireEvent.click(screen.getByRole('button', { name: 'Great' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(moodLine(undefined)))
    expect(screen.getByTestId('calm-mood').textContent).not.toMatch(/will see it/)
    expect(screen.getAllByText(moodLine(undefined))).toHaveLength(1)
  })
  it('with a writer carer the told toast stands', async () => {
    writer.v = true
    render(<MoodCheck />)
    fireEvent.click(screen.getByRole('button', { name: 'Great' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(feelingToast('told')))
  })
  it('viewing as someone writes for the viewed person', async () => {
    acting.id = 'rel-1'
    render(<MoodCheck />)
    fireEvent.click(screen.getByRole('button', { name: 'Great' }))
    expect(logFeeling).toHaveBeenCalledWith('great', 'rel-1')
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
  })
  it('view only (no mood) disables every face and writes nothing', () => {
    acting.can = { mood: false, log: false, reason: 'ask' }
    render(<MoodCheck />)
    const faces = within(screen.getByRole('group', { name: 'How are you?' })).getAllByRole('button')
    expect(faces.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    fireEvent.click(faces[0]!)
    expect(logFeeling).not.toHaveBeenCalled()
  })
  it('a double tap writes once', async () => {
    let done!: (v: string) => void
    logFeeling.mockReturnValue(new Promise((r) => { done = r }))
    render(<MoodCheck />)
    const f = screen.getByRole('button', { name: 'Unwell' })
    fireEvent.click(f); fireEvent.click(f)
    expect(logFeeling).toHaveBeenCalledTimes(1)
    expect((f as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { done('told') })
    expect((f as HTMLButtonElement).disabled).toBe(false)
  })
})
