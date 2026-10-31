import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Carousel, GroupedList, LargeTitle, MapCard, PreviewTile, Row, Section, Segmented } from './index'
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
describe('PreviewTile + Carousel', () => {
  it('a tile is one link with kicker, value, sub and action text', () => {
    render(<PreviewTile kicker="Blood pressure" tint="blue" value="--/--" sub="None this week" action="Log now" href="#health/readings" testId="bp" />)
    const a = screen.getByRole('link', { name: /Blood pressure.*Log now/ })
    expect(a.getAttribute('href')).toBe('#health/readings'); expect(a.getAttribute('data-tint')).toBe('blue')
  })
  it('a carousel is a named group that lists its items', () => {
    render(<Carousel label="First aid"><a href="#a">A</a><a href="#b">B</a></Carousel>)
    expect(within(screen.getByRole('group', { name: 'First aid' })).getAllByRole('link')).toHaveLength(2)
  })
})
describe('Segmented', () => {
  it('links carry aria-current, buttons aria-pressed and call onChange', () => {
    const on = vi.fn()
    const { rerender } = render(<Segmented label="Show" value="near" options={[{ id: 'near', label: 'Near me', href: '#safety' }, { id: 'world', label: 'World', href: '#safety/world' }]} />)
    expect(screen.getByRole('link', { name: 'Near me' }).getAttribute('aria-current')).toBe('page')
    rerender(<Segmented label="Range" value="week" onChange={on} options={[{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }]} />)
    screen.getByRole('button', { name: 'This month' }).click()
    expect(on).toHaveBeenCalledWith('month')
    expect(screen.getByRole('button', { name: 'This week' }).getAttribute('aria-pressed')).toBe('true')
  })
})
describe('MapCard', () => {
  it('static image with credit and a 44 px recentre button; live render mounts and cleans up', () => {
    const cleanup = vi.fn(); const render_ = vi.fn(() => cleanup); const re = vi.fn()
    const { unmount, rerender } = render(<MapCard image={{ src: '/maps/dampas.jpg', alt: 'Map around Dampas' }} credit="Map: OpenStreetMap" onRecentre={re} testId="map" />)
    expect(screen.getByRole('img', { name: 'Map around Dampas' })).not.toBeNull()
    expect(screen.getByText('Map: OpenStreetMap')).not.toBeNull()
    screen.getByRole('button', { name: 'Recentre' }).click(); expect(re).toHaveBeenCalled()
    rerender(<MapCard render={render_} credit="Windy" />)
    expect(render_).toHaveBeenCalledTimes(1)
    unmount(); expect(cleanup).toHaveBeenCalled()
  })
})
describe('Sheet', () => {
  it('dialog named by title, grabber, close button, Escape closes, focus returns, one at a time', async () => {
    const { Sheet } = await import('./Sheet')
    const a = vi.fn(), b = vi.fn()
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus()
    const { rerender } = render(<><Sheet title="Jack" onClose={a}><button type="button">one</button></Sheet></>)
    const dlg = screen.getByRole('dialog', { name: 'Jack' })
    expect(dlg.querySelector('.lk-grab')).not.toBeNull()
    expect(document.activeElement?.textContent).toBe('one')
    screen.getByRole('button', { name: 'Close' }).click(); expect(a).toHaveBeenCalledTimes(1) // jsdom has no matchMedia: reduced path, closes at once
    rerender(<><Sheet title="A" onClose={a}><button type="button">a</button></Sheet><Sheet title="B" onClose={b}><button type="button">b</button></Sheet></>)
    expect(a).toHaveBeenCalledTimes(2) // the second sheet closed the first
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'B' }), { key: 'Escape' }); expect(b).toHaveBeenCalled()
  })
})
describe('Row outside a list', () => {
  it('claims no listitem role without a GroupedList parent', () => {
    render(<Row title="Alone" testId="alone" />)
    expect(screen.getByTestId('alone').getAttribute('role')).toBeNull()
  })
})
