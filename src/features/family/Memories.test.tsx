import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../shell/useKv', () => ({ useKv: () => [false, vi.fn(), true] }))
const { default: Memories } = await import('./Memories')

describe('Memories (F8)', () => {
  it('off: one honest empty state, no second title, no "Off for now"', () => {
    const { container } = render(<Memories />)
    expect(container.querySelectorAll('h1,h2').length).toBe(0) // the page title is the one h1, in Family.tsx
    expect(screen.getByText('Memories is off')).toBeTruthy()
    expect(screen.queryByText(/Off for now/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Turn on Memories' })).toBeTruthy()
  })
})
