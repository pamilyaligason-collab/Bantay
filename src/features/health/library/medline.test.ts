import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import { articleHref, connectUrl, loadTopic, parseKey, parseTopic, summarise, TTL_MS, type Fetch } from './medline'

const BODY = { feed: { entry: [{ title: { _value: 'High Blood Pressure' }, link: [{ href: 'https://medlineplus.gov/highbloodpressure.html' }], summary: { _value: '<p>Blood pressure is the force of blood pushing against the walls of your arteries.</p><p>High blood pressure often has no signs.</p>' } }] } }
const ok = (body: unknown): Fetch => vi.fn().mockResolvedValue({ ok: true, json: async () => body })

beforeEach(async () => { await db.kv.clear() })

describe('MedlinePlus Connect', () => {
  it('builds the request by problem or medicine name', () => {
    expect(connectUrl('condition', 'High blood pressure')).toContain('mainSearchCriteria.v.cs=2.16.840.1.113883.6.90')
    expect(connectUrl('medicine', 'metformin')).toContain('mainSearchCriteria.v.cs=2.16.840.1.113883.6.88')
    expect(connectUrl('medicine', 'metformin')).toContain('mainSearchCriteria.v.dn=metformin')
    expect(connectUrl('condition', 'x')).toContain('knowledgeResponseType=application%2Fjson')
  })
  it('parses the first topic, strips markup, keeps only MedlinePlus links', () => {
    expect(parseTopic(BODY)).toEqual({ title: 'High Blood Pressure', summary: 'Blood pressure is the force of blood pushing against the walls of your arteries. High blood pressure often has no signs.', url: 'https://medlineplus.gov/highbloodpressure.html' })
    expect(parseTopic({ feed: { entry: [] } })).toBeNull()
    expect(parseTopic({ feed: { entry: [{ title: 'x', summary: 'y', link: [{ href: 'https://evil.example/x' }] }] } })).toBeNull()
    expect(parseTopic(null)).toBeNull()
  })
  it('summarises long text at a sentence', () => {
    const long = `${'Blood moves around the body. '.repeat(40)}`
    expect(summarise(long).length).toBeLessThanOrEqual(600)
    expect(summarise(long).endsWith('.')).toBe(true)
  })
  it('one request, then the answer comes from the 30-day cache', async () => {
    const f = ok(BODY)
    const a = await loadTopic('condition', 'High blood pressure', { fetch: f, now: 1000 })
    expect(a).toMatchObject({ state: 'ok', from: 'network' })
    const b = await loadTopic('condition', 'high  blood pressure', { fetch: f, now: 1000 + TTL_MS - 1 })
    expect(b).toMatchObject({ state: 'ok', from: 'cache' })
    expect(f).toHaveBeenCalledTimes(1)
    await loadTopic('condition', 'High blood pressure', { fetch: f, now: 1000 + TTL_MS + 1 })
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('offline: an old copy is used, else the offline state; nothing found is not offline', async () => {
    const down: Fetch = vi.fn().mockRejectedValue(new Error('net'))
    expect(await loadTopic('medicine', 'metformin', { fetch: down })).toEqual({ state: 'offline' })
    await loadTopic('condition', 'Asthma', { fetch: ok(BODY), now: 1 })
    expect(await loadTopic('condition', 'Asthma', { fetch: down, now: 1 + TTL_MS * 2 })).toMatchObject({ state: 'ok', from: 'old-cache' })
    expect(await loadTopic('medicine', 'zzzz', { fetch: ok({ feed: { entry: [] } }) })).toEqual({ state: 'none' })
    expect(await loadTopic('medicine', 'bad', { fetch: vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) })).toEqual({ state: 'offline' })
  })
  it('article keys round-trip through the address', () => {
    const href = articleHref('c', 'Type 2 diabetes')
    expect(parseKey(decodeURIComponent(href.split('/').pop()!))).toEqual({ kinds: ['condition'], text: 'Type 2 diabetes' })
    expect(parseKey('s:metformin')?.kinds).toEqual(['condition', 'medicine'])
    expect(parseKey('junk')).toBeNull()
  })
})
