import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NewsPic } from './Cards'
import { IMAGE_HOSTS } from './hosts'
import type { NewsRow } from './model'

const row = (image_url: string | null | undefined): NewsRow => ({ id: '1', title: 'Headline', url: 'https://news.test/1', source: 'PNA', kind: 'article', published_at: '2026-10-28T09:20:00Z', zone: null, image_url })
const pic = (u: string | null | undefined) => render(<NewsPic n={row(u)} w={84} h={84} className="nw-thumb" />).container
afterEach(cleanup)

describe('NewsPic', () => {
  it('loads an https image lazily, with no referrer', () => {
    const img = pic('https://img.news.test/a.jpg').querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://img.news.test/a.jpg')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(img.getAttribute('loading')).toBe('lazy'); expect(img.getAttribute('decoding')).toBe('async')
  })
  it('never loads http, protocol-relative, data or javascript images: the tile shows instead', () => {
    for (const u of ['http://img.news.test/a.jpg', '//img.news.test/a.jpg', 'data:image/png;base64,AAAA', 'javascript:alert(1)', '', null, undefined]) {
      const c = pic(u)
      expect(c.querySelector('img')).toBeNull()
      expect(c.querySelector('[data-fallback="true"] .nw-mark')!.textContent).toBe('P')
      cleanup()
    }
  })
  it('falls back to the tile when the image fails to load', () => {
    const c = pic('https://img.news.test/broken.jpg')
    fireEvent.error(c.querySelector('img')!)
    expect(c.querySelector('img')).toBeNull()
    expect(c.querySelector('[data-fallback="true"] .nw-mark')!.textContent).toBe('P')
  })
})

describe('IMAGE_HOSTS', () => {
  it('lists the Commons thumbnail host and the news site images', () => { expect([...IMAGE_HOSTS]).toEqual(['thumb.wikimedia.org', 'news site images']) })
})
