import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { CAUTION, CHAT_IDLE_MS, chatIsStale, HISTORY_MAX, keyboardInset, loadHistory, loadHistoryAt, saveHistory, trimHistory } from './history'

beforeEach(async () => { await db.kv.clear() })

describe('Ask history', () => {
  const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }))
  it('keeps 20 messages at most, newest last', () => {
    expect(HISTORY_MAX).toBe(20)
    const t = trimHistory(msgs(30))
    expect(t).toHaveLength(20)
    expect(t[0]!.content).toBe('m10')
    expect(t[19]!.content).toBe('m29')
  })
  it('drops card-only replies and strips cards', () => {
    const t = trimHistory([{ role: 'user', content: 'hi' }, { role: 'assistant', content: '', cards: [{ kind: 'weather' }] }, { role: 'assistant', content: 'ok', cards: [{ kind: 'weather' }] }] as never)
    expect(t).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'ok' }])
  })
  it('saves and loads through kv, and ignores junk', async () => {
    await saveHistory(msgs(25))
    expect(await loadHistory()).toHaveLength(20)
    await db.kv.put({ key: 'assistant.history', value: [{ role: 'x', content: 'bad' }, null, { role: 'user', content: 'good' }] })
    expect(await loadHistory()).toEqual([{ role: 'user', content: 'good' }])
    await db.kv.put({ key: 'assistant.history', value: 'nope' })
    expect(await loadHistory()).toEqual([])
  })
  it('a saved chat clears itself 30 minutes after its last message, and is deleted from the phone', async () => {
    const t0 = Date.parse('2026-11-10T10:00:00Z')
    await saveHistory(msgs(3), t0)
    expect(await loadHistory(t0 + CHAT_IDLE_MS - 1)).toHaveLength(3)
    expect(await loadHistory(t0 + CHAT_IDLE_MS)).toEqual([])
    expect((await db.kv.get('assistant.history'))?.value).toBeUndefined()
    expect(chatIsStale(t0, t0 + CHAT_IDLE_MS - 1)).toBe(false)
    expect(chatIsStale(t0, t0 + CHAT_IDLE_MS)).toBe(true)
  })
  it('a restored chat reports the time of its last message, so its 30-minute clock does not restart on reload', async () => {
    const t0 = Date.parse('2026-11-10T10:00:00Z')
    await saveHistory(msgs(2), t0)
    expect(await loadHistoryAt(t0 + 60_000)).toEqual({ items: expect.any(Array), at: t0 })
  })
  it('has the new caution line', () => {
    expect(CAUTION).toBe('I can be wrong. Check with your doctor for medical decisions.')
  })
})

describe('keyboardInset', () => {
  it('is the height the keyboard covers, and 0 for a closed keyboard or a small browser-bar change', () => {
    expect(keyboardInset(844, 544, 0)).toBe(300)
    expect(keyboardInset(844, 844, 0)).toBe(0)
    expect(keyboardInset(844, 800, 0)).toBe(0)
    expect(keyboardInset(844, 500, 40)).toBe(304)
  })
})
