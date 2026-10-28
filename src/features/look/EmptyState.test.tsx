import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'
import { JACK_ALT } from './JackArt'

describe('EmptyState art (D-91)', () => {
  it('shows Jack peeking out of a box when no icon is given, one picture only', () => {
    const { container } = render(<EmptyState title="Nothing yet" />)
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]!.alt).toBe(JACK_ALT['empty-list'])
    expect(imgs[0]!.getAttribute('width')).toBe('88')
  })

  it('keeps the icon, and no Jack, when an icon is given', () => {
    const { container } = render(<EmptyState icon="check" title="All done" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
