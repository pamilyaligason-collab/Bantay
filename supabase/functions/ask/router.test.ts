// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { buildPrompt, handleAsk, type Env, type Knowledge, type ModelReply, type OwnData, type Port } from './logic.ts'
import { CAPPED_TOKENS, FAST_TOKENS, route, spendOf, STRONG_TOKENS, type RouteIn } from './router.ts'

const base: RouteIn = { question: 'hello', turns: 1, records: false, lookups: 0, hits: 0, spendUsd: 0, capUsd: 10, fast: 'fast', strong: 'strong' }
const r = (o: Partial<RouteIn>) => route({ ...base, ...o })

describe('route', () => {
  it('quick chat goes to the fast model', () => {
    for (const q of ['hi', 'good morning po', 'open my health page', 'what is the weather today', 'salamat']) expect(r({ question: q })).toMatchObject({ tier: 'fast', model: 'fast', maxTokens: FAST_TOKENS })
  })
  it('health context in the prompt goes to the strong model', () => {
    expect(r({ question: 'is this ok', lookups: 1 })).toMatchObject({ tier: 'strong', model: 'strong', maxTokens: STRONG_TOKENS })
    expect(r({ question: 'is this ok', hits: 2 }).tier).toBe('strong')
    expect(r({ question: 'what does my result mean', records: true }).tier).toBe('strong')
  })
  it('records on file do not make a non-health question expensive', () => {
    expect(r({ question: 'good evening', records: true }).tier).toBe('fast')
  })
  it('health reasoning, long questions and long threads go strong', () => {
    expect(r({ question: 'why does my blood sugar go up in the morning' }).tier).toBe('strong')
    expect(r({ question: 'a'.repeat(300) }).tier).toBe('strong')
    expect(r({ question: 'ok and then', turns: 8 }).tier).toBe('strong')
    expect(r({ question: 'explain the difference between baking and frying for me please' }).tier).toBe('strong')
  })
  it('common Tagalog health words count as health: records in play goes strong', () => {
    for (const w of ['mataas ang presyon ko', 'asukal ko kanina', 'may dugo sa ihi', 'hilo ako', 'masakit ang sikmura', 'saan ang ospital', 'kailan ang check-up', 'resulta ng laboratoryo', 'reseta ni nars', 'kolesterol ko', 'paano gamutin']) {
      expect(r({ question: w, records: true }).why, w).toBe('records in play')
    }
  })
  it('under 70% of the cap routes by task; 70% and over is fast only', () => {
    expect(r({ question: 'is this ok', hits: 1, spendUsd: 6.99 }).tier).toBe('strong')
    expect(r({ question: 'is this ok', hits: 1, spendUsd: 7 })).toMatchObject({ tier: 'fast', maxTokens: FAST_TOKENS })
    expect(r({ question: 'is this ok', hits: 1, spendUsd: 8.99 })).toMatchObject({ tier: 'fast', maxTokens: FAST_TOKENS })
  })
  it('90% and over is fast with 300 tokens, also past the cap', () => {
    expect(r({ question: 'is this ok', hits: 1, spendUsd: 9 })).toMatchObject({ tier: 'fast', maxTokens: CAPPED_TOKENS })
    expect(r({ question: 'is this ok', hits: 1, spendUsd: 25 })).toMatchObject({ tier: 'fast', maxTokens: CAPPED_TOKENS })
  })
  it('the cap is a ratio of ASSISTANT_MONTHLY_CAP_USD', () => {
    expect(r({ hits: 1, spendUsd: 3.6, capUsd: 5 }).tier).toBe('fast')
    expect(r({ hits: 1, spendUsd: 3.6, capUsd: 50 }).tier).toBe('strong')
  })
  it('unknown or bad spend is cheap, never free', () => {
    expect(r({ hits: 1, spendUsd: null }).why).toBe('spend unknown')
    expect(r({ hits: 1, spendUsd: Number.NaN }).tier).toBe('fast')
    expect(r({ hits: 1, capUsd: 0 }).tier).toBe('fast')
  })
  it('no strong model configured, or the same one, means fast', () => {
    expect(r({ hits: 1, strong: '' }).model).toBe('fast')
    expect(r({ hits: 1, strong: 'fast' }).tier).toBe('fast')
  })
})

describe('spendOf', () => {
  it('uses the real cost, including 0', () => {
    expect(spendOf({ tokensIn: 1000, tokensOut: 100, cost: 0.0042 })).toBe(0.0042)
    expect(spendOf({ tokensIn: 1000, tokensOut: 100, cost: 0 })).toBe(0)
  })
  it('estimates high when the cost is missing: 1000 in + 100 out = 0.0045', () => {
    expect(spendOf({ tokensIn: 1000, tokensOut: 100, cost: null })).toBeCloseTo(0.0045, 10)
    expect(spendOf({ tokensIn: null, tokensOut: null, cost: null })).toBeCloseTo(0.0225, 10)
  })
})

const env: Env = { model: 'fast', strong: 'strong', fallback: 'fb', capUsd: 10 }
const none: OwnData = { meds: [], labs: [], allergies: [], tokens: [], lookups: [] }
const ok = (cost: number | null = 0.002): ModelReply => ({ reply: 'Drink water and rest.', tool_calls: [], usage: { tokensIn: 100, tokensOut: 20, cost } })
const body = (text: string) => JSON.stringify({ screen: 'health', messages: [{ role: 'user', content: text }] })
const know: Knowledge[] = [{ slug: 's', title_en: 'T', title_tl: 'T', summary: 'x', source_name: 'NHS', source_url: 'https://www.nhs.uk/x' }]
function port(over: Partial<Port> = {}) {
  return { user: async () => 'u1', takeSlot: vi.fn(async () => true), knowledge: async () => [], own: async () => none, medline: async () => null, chat: vi.fn(async () => ok()), spendUsd: vi.fn(async () => 1), addSpend: vi.fn(async () => {}), now: () => 1, ...over } as Port & { chat: ReturnType<typeof vi.fn>; addSpend: ReturnType<typeof vi.fn>; spendUsd: ReturnType<typeof vi.fn> }
}
const calls = (p: { chat: ReturnType<typeof vi.fn> }) => p.chat.mock.calls.map((c) => [c[0], (c[1] as { max_tokens: number }).max_tokens, c[2]])

describe('handleAsk with the router', () => {
  it('quick chat: fast model, 1500 tokens; the call cost is added to the month', async () => {
    const p = port()
    const out = await handleAsk(p, env, body('good morning'))
    expect(calls(p)).toEqual([['fast', 1500, 20_000]])
    expect(out.meta).toMatchObject({ model: 'fast', tier: 'fast', fallback: false })
    expect(p.addSpend).toHaveBeenCalledWith(0.002)
  })
  it('health question with reference hits: strong model, 2000 tokens, 25 s', async () => {
    const p = port({ knowledge: async () => know })
    const out = await handleAsk(p, env, body('what is metformin for'))
    expect(calls(p)).toEqual([['strong', 2000, 25_000]])
    expect(out.meta.tier).toBe('strong')
  })
  it('a failed strong call falls to fast at 1500 tokens, then to the fallback', async () => {
    const chat = vi.fn().mockRejectedValueOnce(new Error('t')).mockRejectedValueOnce(new Error('t')).mockResolvedValueOnce(ok())
    const p = port({ chat, knowledge: async () => know })
    const out = await handleAsk(p, env, body('is rest good for a fever'))
    expect(calls({ chat })).toEqual([['strong', 2000, 25_000], ['fast', 1500, 15_000], ['fb', 1500, 15_000]])
    expect(out.meta).toMatchObject({ model: 'fb', fallback: true })
  })
  it('over 90%: fast model, 300 tokens; at 80%: fast model, 600 tokens', async () => {
    const hi = port({ spendUsd: async () => 9.5, knowledge: async () => know })
    await handleAsk(hi, env, body('what is metformin for'))
    expect(calls(hi)).toEqual([['fast', 300, 20_000]])
    const mid = port({ spendUsd: async () => 8, knowledge: async () => know })
    await handleAsk(mid, env, body('what is metformin for'))
    expect(calls(mid)).toEqual([['fast', 1500, 20_000]])
  })
  it('spend unreadable or unwritable: the answer still comes, on the fast model', async () => {
    const p = port({ spendUsd: async () => { throw new Error('x') }, addSpend: vi.fn(async () => { throw new Error('x') }), knowledge: async () => know })
    const out = await handleAsk(p, env, body('what is metformin for'))
    expect(out.status).toBe(200)
    expect(calls(p)).toEqual([['fast', 1500, 20_000]])
  })
  it('a missing cost is counted by estimate, not as 0', async () => {
    const p = port({ chat: vi.fn(async () => ok(null)) })
    await handleAsk(p, env, body('good morning'))
    expect(p.addSpend.mock.calls[0]![0]).toBeCloseTo(0.0006, 10) // hand-computed: 100 in x $3/M = 0.0003, 20 out x $15/M = 0.0003
  })
  it('emergency replies never reach the router, the spend counter or a model, even at 100% of the cap', async () => {
    const p = port({ spendUsd: vi.fn(async () => 99) })
    const out = await handleAsk(p, env, body('I have chest pain'))
    expect((out.body as { emergency: { call: string[] } }).emergency.call).toEqual(['911'])
    expect(p.chat).not.toHaveBeenCalled()
    expect(p.addSpend).not.toHaveBeenCalled()
    expect(p.spendUsd).not.toHaveBeenCalled()
  })
  it('the request keeps zdr, no data collection, require_parameters, no reasoning, and asks for usage cost', async () => {
    const p = port()
    await handleAsk(p, env, body('good morning'))
    expect(p.chat.mock.calls[0]![1]).toMatchObject({ provider: { zdr: true, data_collection: 'deny', require_parameters: true }, usage: { include: true } })
    expect(p.chat.mock.calls[0]![1]).not.toHaveProperty('reasoning')
  })
})

describe('Jack prompt', () => {
  const sys = buildPrompt('health', 'en', [], [], none)
  it('answers directly and keeps the safety rules', () => {
    expect(sys).toContain('Answer the question first')
    expect(sys).toContain('do not open with a refusal')
    expect(sys).toContain('urgent signs are named first')
    expect(sys).toContain('grade 6')
    expect(sys).toContain('short sentences, everyday words')
    expect(sys).not.toContain('I am not sure. Please ask your doctor.')
    expect(sys).toContain('Never diagnose the person')
    expect(sys).toContain('never give a dose beyond what the family already logged')
    expect(sys).toContain('call 911 now')
  })
})
