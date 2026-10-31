import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupedList, LargeTitle, Row, Section } from './index'
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
describe('GroupedList + Row', () => {
  it('a list of rows: icon box with tint, title, sub, value, chevron on links, badge text', () => {
    render(<GroupedList icons label="Right now" testId="now">
      <Row icon="bolt" tint="amber" title="Earthquake M4.6" sub="Near Tago · 272 km · USGS" badge="Minor, far away" badgeTint="amber" href="#safety/warnings" />
      <Row icon="cloud" tint="blue" title="Rain tomorrow" value="100%" href="#weather" />
      <Row icon="heart" title="Toggle" control={<button type="button">on</button>} />
    </GroupedList>)
    const list = screen.getByRole('list', { name: 'Right now' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    const quake = screen.getByRole('link', { name: /Earthquake M4\.6/ })
    expect(quake.getAttribute('href')).toBe('#safety/warnings')
    expect(quake.querySelector('.rw-ic')?.getAttribute('data-tint')).toBe('amber')
    expect(screen.getByText('Minor, far away').className).toContain('rw-badge')
    expect(screen.getByText('100%').className).toContain('rw-value')
    expect(screen.getByRole('button', { name: 'on' }).closest('.rw-main')).toBeNull() // control outside the link
  })
})
