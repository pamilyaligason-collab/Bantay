import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LargeTitle, Section } from './index'
afterEach(cleanup)

describe('LargeTitle', () => {
  it('kicker, 34 px h1 and right actions', () => {
    render(<LargeTitle kicker="Saturday, Oct 31" title="Good evening, Loyd" actions={<a href="#me" aria-label="You and settings">L</a>} testId="head" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Good evening, Loyd' }).className).toContain('lt-title')
    expect(screen.getByTestId('head').textContent).toContain('Saturday, Oct 31')
    expect(screen.getByRole('link', { name: 'You and settings' })).not.toBeNull()
  })
  it('a pushed page draws Back with the parent name and no kicker', () => {
    render(<LargeTitle title="Labs" back={{ href: '#health', label: 'Health' }} />)
    const back = screen.getByRole('link', { name: 'Back to Health' })
    expect(back.getAttribute('href')).toBe('#health'); expect(back.textContent).toContain('Health')
  })
})
describe('Section', () => {
  it('h2 names the region; the link is a real anchor; meta is plain text', () => {
    const { rerender } = render(<Section title="My day" link={{ href: '#family', label: 'All' }}><p>x</p></Section>)
    expect(screen.getByRole('region', { name: 'My day' })).not.toBeNull()
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe('#family')
    rerender(<Section title="My day" meta="0 of 5 done"><p>x</p></Section>)
    expect(screen.queryByRole('link')).toBeNull(); expect(screen.getByText('0 of 5 done')).not.toBeNull()
  })
  it('an onClick link is a button', () => {
    const on = vi.fn()
    render(<Section title="Meds" link={{ onClick: on, label: 'Edit' }}><p>x</p></Section>)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' })); expect(on).toHaveBeenCalledTimes(1)
  })
})
