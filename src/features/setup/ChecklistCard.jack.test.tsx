import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// D-91: the "things left to set up" card wears the get-help Jack (decorative; the heading says the words).
vi.mock('./steps', async (orig) => ({
  ...(await orig<object>()),
  currentPlatform: () => 'web',
  onResume: () => () => undefined,
  probe: vi.fn(async () => ({ photo: false, about: false, medicines: false, notifications: false, location: false, health: false, warnings: false, sos: false, sharing: false })),
}))
import ChecklistCard from './ChecklistCard'

afterEach(cleanup)

describe('ChecklistCard Jack', () => {
  it('shows one decorative get-help Jack beside the heading', async () => {
    render(<ChecklistCard />)
    await screen.findByRole('heading', { name: /left to set up/ })
    const imgs = document.querySelectorAll('img.jack')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]!.getAttribute('alt')).toBe('')
    expect((imgs[0] as HTMLImageElement).src).toContain('jack-get-help')
  })
})
