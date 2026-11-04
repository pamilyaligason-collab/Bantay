import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newsIsOld, parseNews, useWorldNews, type Loader } from './useWorldNews'

const row = (o: Record<string, unknown> = {}) => ({ id: 'g1', title: ' Example headline ', url: 'https://news.example/a', source_domain: 'news.example', seen_at: '2026-11-05T00:00:00Z', ...o })

describe('parseNews', () => {
  it('trims titles, newest first, and keeps the source domain', () => {
    const r = parseNews([row({ id: 'old', seen_at: '2026-11-04T00:00:00Z' }), row()])
    expect(r.map((x) => x.id)).toEqual(['g1', 'old'])
    expect(r[0]).toEqual({ id: 'g1', title: 'Example headline', url: 'https://news.example/a', source: 'news.example', seenAt: '2026-11-05T00:00:00Z' })
  })
  it('drops rows without a title, a date, an id or an http(s) link', () => {
    const bad = [row({ title: '  ' }), row({ seen_at: 'soon' }), row({ id: 3 }), row({ url: 'javascript:alert(1)' }), row({ url: 'data:text/html,x' }), null, 'x']
    expect(parseNews(bad)).toEqual([])
    expect(parseNews('nope')).toEqual([])
  })
  it('caps the list at six', () => {
    expect(parseNews(Array.from({ length: 12 }, (_, i) => row({ id: `n${i}` }))).length).toBe(6)
  })
  it('flags a list older than a day', () => {
    const n = parseNews([row()])
    expect(newsIsOld(n, Date.parse('2026-11-05T23:59:00Z'))).toBe(false)
    expect(newsIsOld(n, Date.parse('2026-11-06T00:01:00Z'))).toBe(true)
    expect(newsIsOld([], 0)).toBe(false)
  })
})

describe('useWorldNews', () => {
  it('flags off: no read, state off', () => {
    const load = vi.fn<Loader>()
    const { result } = renderHook(() => useWorldNews({ news: false, digest: false }, load))
    expect(result.current).toEqual({ state: 'off', news: [], digest: null })
    expect(load).not.toHaveBeenCalled()
  })
  it('reads and parses what the flags ask for', async () => {
    const load = vi.fn<Loader>(async () => ({ news: [row()], digest: { day: '2026-11-05', body: { counts: { quake: 1 }, top: [] } } }))
    const { result } = renderHook(() => useWorldNews({ news: true, digest: true }, load))
    expect(result.current.state).toBe('loading')
    await waitFor(() => expect(result.current.state).toBe('ok'))
    expect(load).toHaveBeenCalledWith({ news: true, digest: true })
    expect(result.current.news.length).toBe(1)
    expect(result.current.digest?.total).toBe(1)
  })
  it('a failed digest read leaves the headlines alone; a failed news read says error', async () => {
    const a = renderHook(() => useWorldNews({ news: true, digest: true }, async () => ({ news: [row()], digest: null })))
    await waitFor(() => expect(a.result.current.state).toBe('ok'))
    const b = renderHook(() => useWorldNews({ news: true, digest: true }, async () => ({ news: null, digest: null })))
    await waitFor(() => expect(b.result.current.state).toBe('error'))
  })
  it('a failed read gives error and no rows', async () => {
    const { result } = renderHook(() => useWorldNews({ news: true, digest: false }, async () => { throw new Error('read') }))
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.news).toEqual([])
  })
})
