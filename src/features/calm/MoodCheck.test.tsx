// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const logFeeling = vi.hoisted(() => vi.fn().mockResolvedValue('told'))
vi.mock('../today/actions', async (orig) => ({ ...(await orig<object>()), logFeeling }))
afterEach(cleanup)

import { feelingToast } from '../today/actions'
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
    expect(logFeeling).toHaveBeenCalledWith('unwell')
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(feelingToast('told')))
  })
  it('explains the once-a-day family alert', () => {
    render(<MoodCheck />)
    expect(screen.getByText('Choosing Unwell tells your family once a day.')).toBeTruthy()
  })
})
