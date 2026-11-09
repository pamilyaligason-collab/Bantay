import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import { articleHref, connectUrl, loadTopic, parseKey, parseTopic, NONE_TTL_MS, summarise, TTL_MS, type Fetch } from './medline'

const BODY = { feed: { entry: [{ title: { _value: 'High Blood Pressure' }, link: [{ href: 'https://medlineplus.gov/highbloodpressure.html' }], summary: { _value: '<p>Blood pressure is the force of blood pushing against the walls of your arteries.</p><p>High blood pressure often has no signs.</p>' } }] } }
const ok = (body: unknown): Fetch => vi.fn().mockResolvedValue({ ok: true, json: async () => body })

beforeEach(async () => { await db.kv.clear() })

describe('MedlinePlus Connect', () => {
  it('builds the request by problem or medicine name', () => {
    expect(connectUrl('condition', 'High blood pressure')).toContain('mainSearchCriteria.v.cs=2.16.840.1.113883.6.90')
    expect(connectUrl('medicine', 'metformin')).toContain('mainSearchCriteria.v.cs=2.16.840.1.113883.6.88')
    expect(connectUrl('medicine', 'metformin')).toContain('mainSearchCriteria.v.dn=metformin')
    expect(connectUrl('condition', 'asthma')).toContain('knowledgeResponseType=application%2Fjson')
  })
  it('S26: conditions and labs go by CODE (Connect ignores display names); a condition with no code is not asked', () => {
    const c = connectUrl('condition', 'High blood pressure')!
    expect(c).toContain('mainSearchCriteria.v.c=I10')
    expect(c).not.toContain('v.dn')
    expect(connectUrl('condition', 'Type 2 diabetes')).toContain('mainSearchCriteria.v.c=E11.9')
    const l = connectUrl('lab', '1742-6')!
    expect(l).toContain('mainSearchCriteria.v.cs=2.16.840.1.113883.6.1')
    expect(l).toContain('mainSearchCriteria.v.c=1742-6')
    expect(connectUrl('condition', 'Sarcoidosis')).toBeNull()
    expect(parseKey('l:1742-6')).toEqual({ kinds: ['lab'], text: '1742-6' })
  })
  it('S26: "none" is kept for 1 day (was 30), a found topic still 30; old lib.v1 empties are not read', async () => {
    const empty = ok({ feed: { entry: [] } })
    await loadTopic('medicine', 'zzzz', { fetch: empty, now: 1000 })
    await loadTopic('medicine', 'zzzz', { fetch: empty, now: 1000 + NONE_TTL_MS - 1 })
    expect(empty).toHaveBeenCalledTimes(1)
    await loadTopic('medicine', 'zzzz', { fetch: empty, now: 1000 + NONE_TTL_MS + 1 })
    expect(empty).toHaveBeenCalledTimes(2)
    await db.kv.put({ key: 'lib.v1.condition.alt', value: { at: 5, topic: null } })
    const f = ok(BODY)
    expect(await loadTopic('lab', '1742-6', { fetch: f, now: 6 })).toMatchObject({ state: 'ok', from: 'network' })
    expect(await loadTopic('condition', 'Sarcoidosis', { fetch: f })).toEqual({ state: 'none' })
    expect(f).toHaveBeenCalledTimes(1) // no code, no request
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
    expect(href.startsWith('#health/library/')).toBe(true) // the canonical address, so a tap needs no redirect
    expect(parseKey(decodeURIComponent(href.split('/').pop()!))).toEqual({ kinds: ['condition'], text: 'Type 2 diabetes' })
    expect(parseKey('s:metformin')?.kinds).toEqual(['condition', 'medicine'])
    expect(parseKey('junk')).toBeNull()
  })
})
