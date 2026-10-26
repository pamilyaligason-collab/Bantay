import { describe, expect, it, vi } from 'vitest'
import { assertAllowed, buildRequest, classifyType, csvRow, dateFrom, isSkipped, MAX_TOKENS, sendToOpenRouter, usageCounts, walk } from '../../../scripts/import/lib.mjs'

describe('request builder', () => {
  const o = { model: 'vendor/paid-model', fallbackModel: 'vendor/other-paid', mime: 'image/jpeg', base64: 'AAAA' }
  it('forces zero data retention and no data collection', () => {
    const b = buildRequest(o)
    expect(b.provider.zdr).toBe(true)
    expect(b.provider.data_collection).toBe('deny')
    expect(b.models).toEqual(['vendor/paid-model', 'vendor/other-paid'])
  })
  it('posts to OpenRouter with the right url, headers and provider fields', async () => {
    let seen: { url: string; init: { headers: Record<string, string>; body: string } } | undefined
    const f = vi.fn(async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      seen = { url, init }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"tests":[],"confidence":1}' } }] }) }
    })
    const out = await sendToOpenRouter(f, buildRequest({ ...o, mime: 'application/pdf' }), 'test-key')
    expect(out.confidence).toBe(1)
    expect(seen!.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(seen!.init.headers.Authorization).toBe('Bearer test-key')
    const sent = JSON.parse(seen!.init.body)
    expect(sent.provider).toEqual({ zdr: true, data_collection: 'deny' })
    expect(sent.messages[0].content[1].type).toBe('file')
  })
  it('error path logs the status only, never the body', async () => {
    const f = async () => ({ ok: false, status: 500, json: async () => ({}) })
    const log = vi.fn()
    await expect(sendToOpenRouter(f, buildRequest({ ...o, base64: 'SECRETDOC' }), 'k', log)).rejects.toThrow('500')
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRETDOC')
    expect(log).toHaveBeenCalledWith('OpenRouter failed: 500')
  })
  it('caps output and turns reasoning down', () => {
    const b = buildRequest(o)
    expect(b.max_tokens).toBe(MAX_TOKENS)
    expect(b.reasoning).toEqual({ enabled: false })
  })
  it('reports usage counts only, nulls stay null', async () => {
    const j = { model: 'vendor/paid-model', usage: { prompt_tokens: 900, completion_tokens: 120, cost: 0.0004, completion_tokens_details: { reasoning_tokens: 0 } }, choices: [{ message: { content: '{"patient":"SECRET NAME"}' } }] }
    const onUsage = vi.fn()
    await sendToOpenRouter(async () => ({ ok: true, status: 200, json: async () => j }), buildRequest(o), 'k', () => {}, onUsage)
    expect(onUsage).toHaveBeenCalledWith({ model: 'vendor/paid-model', prompt_tokens: 900, completion_tokens: 120, reasoning_tokens: 0, cost: 0.0004 })
    expect(JSON.stringify(onUsage.mock.calls)).not.toContain('SECRET')
    expect(usageCounts({ choices: [] })).toEqual({ model: null, prompt_tokens: null, completion_tokens: null, reasoning_tokens: null, cost: null })
  })
  it('a cut-off answer is named, not reported as non-JSON', async () => {
    const f = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"tests":[{"name":"Chol' } }] }) })
    await expect(sendToOpenRouter(f, buildRequest(o), 'k', () => {})).rejects.toThrow(/cut off/)
  })
  it('refuses free models', () => {
    expect(() => buildRequest({ ...o, model: 'vendor/model:free' })).toThrow(/paid/)
    expect(() => buildRequest({ ...o, fallbackModel: '' })).toThrow(/paid/)
  })
  it('refuses to run without key or flag', () => {
    const env = { OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'm' }
    expect(() => assertAllowed(['x'], env)).toThrow(/i-am-lloyd/)
    expect(() => assertAllowed(['--i-am-lloyd'], { OPENROUTER_MODEL: 'm' })).toThrow(/OPENROUTER_API_KEY/)
    expect(() => assertAllowed(['--i-am-lloyd'], env)).not.toThrow()
  })
})

describe('inventory helpers', () => {
  it('classifies and dates from names', () => {
    expect(classifyType('2024.06.11 Laboratory')).toBe('laboratory')
    expect(classifyType('Consultation - DR TEST')).toBe('consultation')
    expect(classifyType('2024.04.04 Ultrasound, Urinalysis')).toBe('ultrasound')
    expect(classifyType('notes')).toBe('other')
    expect(dateFrom('2024.06.11 Laboratory')).toBe('2024-06-11')
    expect(dateFrom('20260728 Test Person.pdf')).toBe('2026-07-28')
    expect(dateFrom('11 Nov 2023')).toBe('')
  })
  it('skips only picasa folders (D-68: the other folders get a lane instead)', () => {
    expect(isSkipped(['Test Person', '.picasaoriginals'])).toBe(true)
    for (const s of ['Birth Cert - X.pdf', '- HMO', '- IDs and Documents', '- Insurance', '- Home Lot Documents', 'Visa', '2024.01.01 Laboratory']) expect(isSkipped(['Test Person', s])).toBe(false)
  })
  it('walks a fake tree, skipping and quoting', async () => {
    const tree: Record<string, { id: string; name: string; mime: string }[]> = {
      root: [{ id: 'p', name: 'Test Person', mime: 'application/vnd.google-apps.folder' }],
      p: [
        { id: 'l', name: '2024.01.02 Laboratory', mime: 'application/vnd.google-apps.folder' },
        { id: 'h', name: '- HMO', mime: 'application/vnd.google-apps.folder' }
      ],
      l: [{ id: 'f1', name: 'a, b.jpg', mime: 'image/jpeg' }],
      h: [{ id: 'f2', name: 'card.jpg', mime: 'image/jpeg' }]
    }
    const rows = await walk(async (id: string) => tree[id], 'root', ['Test Person'])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ person: 'Test Person', date: '2024-01-02', type: 'laboratory', file_id: 'f1', lane: 'health' })
    expect(rows[1]).toMatchObject({ file_id: 'f2', lane: 'insurance' })
    expect(csvRow(rows[0])).toContain('"Test Person/2024.01.02 Laboratory/a, b.jpg"')
  })
})
