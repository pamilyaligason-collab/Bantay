import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { playable, VIDEOS, VIDEO_ID } from '../../health/library/videosLogic'
import ReadyTopic from './ReadyTopic'
import { DISCOVER_VIDEOS, READY_READS, READY_SHELVES, READY_TOPICS, READY_VIDEOS } from './ready'

afterEach(cleanup)

describe('D-117 list', () => {
  it('every video is real, playable, unique, in a known topic, and apart from the health list', () => {
    expect(READY_VIDEOS).toHaveLength(55) // 35 + 22 added in S25, less 2 removed in fix round 1
    expect(READY_VIDEOS.every((v) => playable(v) && VIDEO_ID.test(v.id) && v.minutes === null)).toBe(true)
    expect(new Set(DISCOVER_VIDEOS.map((v) => v.id)).size).toBe(DISCOVER_VIDEOS.length)
    expect(VIDEOS.some((v) => READY_VIDEOS.some((r) => r.id === v.id))).toBe(false)
    expect(new Set(READY_VIDEOS.map((v) => v.topic))).toEqual(new Set(READY_SHELVES.map((t) => t.video)))
  })
  it('every read is an https link with a source and a check date, in a known topic', () => {
    expect(READY_READS).toHaveLength(11)
    for (const r of READY_READS) {
      expect(r.url.startsWith('https://')).toBe(true)
      expect(r.source && /^\d{4}-\d{2}-\d{2}$/.test(r.checked)).toBeTruthy()
      expect(READY_TOPICS.some((t) => t.id === r.topic)).toBe(true)
    }
  })
  it('no fear words or weapons in any title', () => {
    const text = [...READY_VIDEOS.map((v) => v.title), ...READY_READS.map((r) => r.title)].join(' ').replaceAll('In case of crisis or war', '') // the Swedish agency's own brochure title, a household guide
    expect(text).not.toMatch(/(war|weapon|gun|bomb|attack|panic|doomsday|survival)/i)
  })
})

describe('Learn topic page', () => {
  it('lists the topic videos as media cards (4, then Show more; 23 in all) that open a click-to-load player, and its reads as outside links', () => {
    const { container } = render(<ReadyTopic id="farm-diy" />)
    expect(screen.getByTestId('ready-farm-diy')).toBeTruthy()
    const list = screen.getByTestId('ready-videos')
    expect(list.querySelectorAll('button.md-row')).toHaveLength(4)
    for (let i = 0; i < 6 && within(list).queryByRole('button', { name: /Show \d+ more/ }); i++) fireEvent.click(within(list).getByRole('button', { name: /Show \d+ more/ }))
    expect(list.querySelectorAll('button.md-row')).toHaveLength(23) // 9 + 14 added in S25, counted by hand
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.queryByTestId('ready-player')).toBeNull()
    fireEvent.click(list.querySelector('button.md-row')!)
    expect(within(screen.getByTestId('ready-player')).getByRole('button', { name: /^Play / })).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull() // still nothing from YouTube until the second tap
    const links = Array.from(container.querySelectorAll('a.lr-tile'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual(READY_READS.filter((r) => r.topic === 'farm-diy').map((r) => r.url))
  })
  it('going to the other topic starts again with 4 cards and no chosen video', () => {
    const { rerender } = render(<ReadyTopic id="prepping" />)
    const list = () => screen.getByTestId('ready-videos')
    fireEvent.click(within(list()).getByRole('button', { name: 'Show 4 more' }))
    fireEvent.click(list().querySelector('button.md-row')!)
    expect(screen.getByTestId('ready-player')).toBeTruthy()
    rerender(<ReadyTopic id="farm-diy" />)
    expect(list().querySelectorAll('button.md-row')).toHaveLength(4)
    expect(screen.queryByTestId('ready-player')).toBeNull()
  })
  it('an unknown topic draws nothing', () => {
    expect(render(<ReadyTopic id="nope" />).container.textContent).toBe('')
  })
})
