import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(cleanup)
import { MoreGrid } from './MoreGrid'

const cards = (n: number) => Array.from({ length: n }, (_, i) => <a key={i} href={`#c${i}`}>Card {i}</a>)

describe('MoreGrid', () => {
  it('shows 4, adds 4 per tap, then folds back', () => {
    render(<MoreGrid label="Videos">{cards(10)}</MoreGrid>)
    expect(screen.getAllByRole('link')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }))
    expect(screen.getAllByRole('link')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(screen.getAllByRole('link')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })
  it('has no button when 4 or fewer', () => {
    render(<MoreGrid label="Videos">{cards(3)}</MoreGrid>)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
