// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { assembleOwn, connectUrl, makeMedline, medsQuery, parseTopic, type Reader } from './context.ts'
import { detectLanguage, emergencyGate } from './gate.ts'
import { DAILY_CAP, handleAsk, parseBody, parseCompletion, postCheck, tokensOf, type Env, type ModelReply, type OwnData, type Port } from './logic.ts'

const env: Env = { model: 'm1', fallback: 'm2' }
const body = (text: string, extra: Record<string, unknown> = {}) => JSON.stringify({ screen: 'health', messages: [{ role: 'user', content: text }], ...extra })
const none: OwnData = { meds: [], labs: [], allergies: [], tokens: [], lookups: [] }
const ok = (reply: string, tool_calls: ModelReply['tool_calls'] = []): ModelReply => ({ reply, tool_calls, usage: { tokensIn: 100, tokensOut: 20, cost: 0.0001 } })

function port(over: Partial<Port> = {}): Port & { chat: ReturnType<typeof vi.fn>; takeSlot: ReturnType<typeof vi.fn> } {
  return {
    user: async () => 'u1',
    takeSlot: vi.fn(async () => true),
    knowledge: async () => [],
    own: async () => none,
    medline: async () => null,
    chat: vi.fn(async () => ok('Drink water and rest.')),
    now: () => 1000,
    ...over
  } as never
}

describe('emergency gate', () => {
  const yes: [string, string][] = [
    ['I have chest pain', 'chest'], ['my husband has chest pain since morning', 'chest'], ['there is pressure in my chest, chest pressure', 'chest'],
    ['masakit ang dibdib ko', 'chest'], ['sakit sa dibdib po', 'chest'], ['masikip ang dibdib ko ngayon', 'chest'], ['masakit chest ko', 'chest'], ['inatake sa puso si tatay', 'chest'],
    ['sakit sa dughan', 'chest'],
    ["I can't breathe", 'breathing'], ['hindi makahinga si nanay', 'breathing'], ['di ako makahinga', 'breathing'], ['hirap huminga ang lola ko', 'breathing'], ['trouble breathing and blue lips', 'breathing'],
    ['kapos ang hininga niya', 'breathing'], ['nabulunan ang bata', 'breathing'], ['lisod ug ginhawa', 'breathing'],
    ['her face is drooping on one side', 'stroke'], ['slurred speech suddenly', 'stroke'], ['biglang bulol si tatay', 'stroke'], ['ngiwi ang mukha ni lola', 'stroke'], ['my father may have had a stroke', 'stroke'],
    ['sudden weakness in my left arm', 'stroke'], ['worst headache of my life', 'stroke'],
    ['he is unconscious', 'unconscious'], ['nahimatay si lolo', 'unconscious'], ['nawalan ng malay ang asawa ko', 'unconscious'], ['she fainted just now', 'unconscious'], ['hindi magising si nanay', 'unconscious'],
    ['vomiting blood', 'bleeding'], ['hindi tumitigil ang dugo sa sugat', 'bleeding'], ['the bleeding wont stop', 'bleeding'], ['sumuka ng dugo si tatay', 'bleeding'],
    ['she is having a seizure', 'seizure'], ['nagkaroon ng kombulsyon ang anak ko', 'seizure'],
    ['I want to die', 'selfharm'], ['magpakamatay na lang ako', 'selfharm'], ['ayaw ko nang mabuhay', 'selfharm'], ['thinking of suicide', 'selfharm'],
    ['nakainom ng lason ang bata', 'poison'], ['I took too many pills', 'poison'],
    ['my throat is closing after the shrimp', 'allergy'], ['namamaga ang lalamunan ni ate', 'allergy'],
    ['BP is 190/110 and I have a bad headache', 'bp'], ['presyon 185/100 at malabo ang mata', 'bp'], ['bp 150/125 dizzy', 'bp'], ['presyon 180 sa 120 nahihilo', 'bp'], ['blood pressure 185 over 100 and headache', 'bp'],
    ['180/120', 'bp'], ['presyon 190/110', 'bp'], ['over 200 by 120', 'bp'], ['185 over 125 and severe headache', 'bp'], ['my bp reading this morning was 185 over 125 and I am dizzy', 'bp'], ['presyon ni lola kanina 190 sa 120, nahihilo', 'bp'], ['BP 190/110 but I feel fine', 'bp'], ['I feel dizzy and my pressure was 150/125', 'bp'],
    // fix round 3 ruling: 180/120+ alone with any separator ('/', '-', space, over, sa, by, x); lower needs a symptom or a label
    ['si lola 200 sa 130 nahihilo', 'bp'], ['tatay 210 sa 130 hilo', 'bp'], ['lola 190 sa 125, masakit ang ulo', 'bp'], ['190 sa 120', 'bp'], ['200 by 130', 'bp'],
    ['reading 190 sa 120', 'bp'], ['BP: 180-120 dizzy', 'bp'], ['bp 180-120', 'bp'], ['presyon 180 120 nahihilo', 'bp'], ['200x130', 'bp'], ['200 x 130', 'bp'], ['180-120', 'bp'],
    ['my sugar is 190 sa 120 and I feel dizzy', 'bp'], ['bp 185 110', 'bp'], ['150 125 nahihilo', 'bp'], ['times 100 200 130', 'bp'],
    ['my sugar is 55 and I am shaking', 'sugar'], ['asukal 350, nauuhaw at nanghihina', 'sugar'], ['glucose 62 sweating', 'sugar']
  ]
  it.each(yes)('flags: %s', (text, kind) => {
    expect(emergencyGate(text)?.kind).toBe(kind)
  })
  it('every phrase in scripts/jack-gate-live.mjs (30: en, tl, taglish/ceb) trips the gate', async () => {
    const path = '../../../scripts/jack-gate-live.mjs'
    const { PHRASES } = (await import(/* @vite-ignore */ path)) as { PHRASES: string[] }
    expect(PHRASES).toHaveLength(30)
    expect(PHRASES.filter((p) => !emergencyGate(p))).toEqual([])
  })
  it('has at least 40 positive phrases in English, Tagalog and Taglish', () => expect(yes.length).toBeGreaterThanOrEqual(40))

  const no = [
    'what is a normal blood pressure', 'I took my amlodipine this morning', 'my sugar is 110 after breakfast', 'my sugar is 55', // no symptom
    'no chest pain today', 'walang sakit sa dibdib', 'without chest pain or shortness of breath', 'ano ang stroke', 'what is a heart attack', 'how to prevent stroke',
    'paano maiwasan ang atake sa puso', 'how do I relax and breathe slowly', 'ilang beses uminom ng gamot sa isang araw', 'masakit ang ulo ko', 'can I eat bagoong',
    'sugar 120, feeling weak', 'BP 130/85 headache', 'what time should I take metformin', 'salamat po',
    'my appointment is on 12/20 and I feel dizzy', 'the rice costs 150 by 120 pesos', 'I paid 200/100 for the room', 'petsa 18/12', 'my room is 190 sa 110 cm', 'BP 170/110', 'bp 120/80 and a headache',
    '179/119', '180/119', '150/125', '185 sa 100', 'on 10/26', 'October 10/26 2026', '150 sa 200 pesos', '190 by 110 cm', 'meet at 10 30', 'bp 179/119 dizzy', 'presyon 170 110 nahihilo'
  ]
  it.each(no)('lets through: %s', (text) => {
    expect(emergencyGate(text)).toBeNull()
  })
  it('a negation does not hide a different symptom after but', () => {
    expect(emergencyGate('no chest pain but I cant breathe')?.kind).toBe('breathing')
  })
  it('still flags a bare disease name when something is happening now', () => {
    expect(emergencyGate('what is happening, I think he is having a stroke now')?.kind).toBe('stroke')
  })
  it('detects language', () => {
    expect(detectLanguage('What should I eat for my blood pressure?')).toBe('en')
    expect(detectLanguage('Ano po ang dapat kong kainin para sa presyon?')).toBe('tl')
    expect(detectLanguage('Pwede ba akong mag take ng ibuprofen if masakit ang ulo ko?')).toBe('taglish')
    expect(detectLanguage('我的血压很高')).toBe('other')
  })
})

describe('request checks', () => {
  it('keeps the last 10 messages at 1000 characters and refuses a last message that is not the person\'s', () => {
    const msgs = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(1500) }))
    msgs.push({ role: 'user', content: 'hi' })
    const p = parseBody(JSON.stringify({ messages: msgs, screen: 'nope' }))!
    expect(p.messages).toHaveLength(10)
    expect(p.messages[0]!.content).toHaveLength(1000)
    expect(p.screen).toBe('today')
    expect(parseBody(JSON.stringify({ messages: [{ role: 'assistant', content: 'a' }] }))).toBeNull()
    expect(parseBody('nope')).toBeNull()
    expect(parseBody(JSON.stringify({ messages: [{ role: 'user', content: '   ' }] }))).toBeNull()
  })
})

describe('handleAsk', () => {
  it('401 when not signed in, and nothing else runs', async () => {
    const p = port({ user: async () => null })
    expect((await handleAsk(p, env, body('hi'))).status).toBe(401)
    expect(p.takeSlot).not.toHaveBeenCalled()
  })
  it('400 on a bad body before a slot is taken', async () => {
    const p = port()
    expect((await handleAsk(p, env, 'x')).status).toBe(400)
    expect(p.takeSlot).not.toHaveBeenCalled()
  })
  it('emergency: fixed card, no model call, no cap slot, even at the daily limit', async () => {
    const p = port({ takeSlot: vi.fn(async () => false) })
    const out = await handleAsk(p, env, body('I have chest pain'))
    expect(out.status).toBe(200)
    expect((out.body as { reply: string }).reply).toContain('911')
    expect((out.body as { emergency: { call: string[] } }).emergency.call).toEqual(['911'])
    expect(p.chat).not.toHaveBeenCalled()
    expect(p.takeSlot).not.toHaveBeenCalled()
  })
  it('self-harm card carries NCMH 1553, in Tagalog when asked in Tagalog', async () => {
    const out = await handleAsk(port(), env, body('ayaw ko nang mabuhay'))
    const b = out.body as { reply: string; emergency: { call: string[] } }
    expect(b.emergency.call).toEqual(['1553', '911'])
    expect(b.reply).toContain('1553')
    expect(b.reply).toContain('Hindi ka nag-iisa')
  })
  it('429 over the cap, 503 when the RPC gives no answer; the model is not called', async () => {
    const a = port({ takeSlot: vi.fn(async () => false) })
    expect((await handleAsk(a, env, body('hello there'))).status).toBe(429)
    const b = port({ takeSlot: vi.fn(async () => null) })
    expect((await handleAsk(b, env, body('hello there'))).status).toBe(503)
    expect(a.chat).not.toHaveBeenCalled()
    expect(b.chat).not.toHaveBeenCalled()
    expect(a.takeSlot).toHaveBeenCalledWith(DAILY_CAP)
  })
  it('a language we cannot read gets a fixed reply, no model call', async () => {
    const p = port()
    const out = await handleAsk(p, env, body('我的血压很高'))
    expect((out.body as { reply: string }).reply).toContain('English or Tagalog')
    expect(p.chat).not.toHaveBeenCalled()
  })
  it('asks the primary model with zdr, no reasoning, 600 tokens, the 6 tools, and adds the disclaimer', async () => {
    const p = port()
    const out = await handleAsk(p, env, body('How much water should I drink?'))
    const [model, req, ms] = p.chat.mock.calls[0] as [string, Record<string, unknown>, number]
    expect(model).toBe('m1')
    expect(ms).toBe(20_000)
    expect(req).toMatchObject({ max_tokens: 600, provider: { zdr: true, data_collection: 'deny' }, reasoning: { effort: 'none' } })
    expect((req.tools as unknown[]).length).toBe(6)
    expect((out.body as { reply: string }).reply).toMatch(/Not medical advice; ask your doctor\.$/)
    expect(out.meta.model).toBe('m1')
    expect(out.meta.fallback).toBe(false)
  })
  it('falls back once at 15 s, then 503', async () => {
    const chat = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(ok('Rest well.'))
    const out = await handleAsk(port({ chat }), env, body('Is rest good?'))
    expect(chat.mock.calls.map((c) => [c[0], c[2]])).toEqual([['m1', 20_000], ['m2', 15_000]])
    expect(out.meta).toMatchObject({ model: 'm2', fallback: true })
    const dead = vi.fn().mockRejectedValue(new Error('down'))
    const out2 = await handleAsk(port({ chat: dead }), env, body('Is rest good?'))
    expect(out2.status).toBe(503)
    expect(dead).toHaveBeenCalledTimes(2)
  })
  it('context: top 3 knowledge rows, own records and MedlinePlus reach the prompt, with sources, and nothing else is logged in meta', async () => {
    const k = (n: number) => ({ slug: 's' + n, title_en: 'Topic ' + n, title_tl: 'Paksa ' + n, summary: 'Summary text ' + n, source_name: 'NHS', source_url: 'https://www.nhs.uk/' + n })
    const p = port({
      knowledge: async () => [k(1), k(2), k(3), k(4)],
      own: async () => ({ ...none, meds: ['Metformin (500 mg)'], lookups: [{ kind: 'rxnorm', code: 'metformin' }] }),
      medline: async () => ({ title: 'Metformin', summary: 'A diabetes pill.', url: 'https://medlineplus.gov/druginfo/meds/a696005.html' })
    })
    const out = await handleAsk(p, env, body('What is metformin for?'))
    const sys = ((p.chat.mock.calls[0] as unknown[])[1] as { messages: { content: string }[] }).messages[0]!.content
    expect(sys).toContain('Topic 3')
    expect(sys).not.toContain('Topic 4')
    expect(sys).toContain('Metformin (500 mg)')
    expect(sys).toContain('A diabetes pill.')
    expect((out.body as { sources: unknown[] }).sources).toHaveLength(4)
    expect(out.meta.hits).toBe(4)
    expect(JSON.stringify(out.meta)).not.toContain('metformin')
  })
  it('a failing knowledge read does not stop the answer', async () => {
    const out = await handleAsk(port({ knowledge: async () => { throw new Error('x') } }), env, body('Is rest good?'))
    expect(out.status).toBe(200)
  })
  it('keeps only whitelisted tool calls and cleans explain_term text', async () => {
    const calls = [
      { name: 'log_reading', arguments: { person: 'Ana', test: 'bp', value: 120 } },
      { name: 'delete_everything', arguments: {} },
      { name: 'explain_term', arguments: { term: 'x', answer: 'Take 500 mg now. It is a word.', source: 'medlineplus' } }
    ]
    const out = await handleAsk(port({ chat: vi.fn(async () => ok('', calls)) }), env, body('explain x'))
    const b = out.body as { reply: string; tool_calls: { name: string; arguments: { answer?: string } }[] }
    expect(b.tool_calls.map((c) => c.name)).toEqual(['log_reading', 'explain_term'])
    expect(b.tool_calls[1]!.arguments.answer).toContain('ask your doctor or pharmacist')
    expect(b.reply).toBe('') // cards only: no disclaimer text
  })
})

describe('post-check', () => {
  const run = (t: string, allowed: string[] = [], lang: 'en' | 'tl' | 'taglish' = 'en') => postCheck(t, allowed, lang)
  it('replaces a sentence with a dose the person never logged', () => {
    const r = run('Metformin helps with sugar. Take 1000 mg twice a day. Ask your doctor.')
    expect(r.text).toBe('Metformin helps with sugar. Please ask your doctor or pharmacist about the dose. Ask your doctor.')
    expect(r.changed).toBe(1)
  })
  it('keeps a dose that is in the records or in what the person wrote', () => {
    expect(run('Your metformin is 500 mg.', tokensOf('Metformin (500 mg)')).changed).toBe(0)
    expect(run('You wrote 250 mg.', tokensOf('I take 250 mg')).changed).toBe(0)
  })
  it('does not touch salt grams or other non-dose numbers', () => {
    expect(run('Keep salt under 5 g a day. Walk for 30 minutes.').changed).toBe(0)
  })
  it('replaces diagnosis-like claims, English and Tagalog', () => {
    expect(run('You have diabetes.').text).toBe('I cannot say what condition this is. Please ask your doctor.')
    expect(run("You've probably got high blood pressure.").changed).toBe(1)
    expect(run('This sounds like a stroke.').changed).toBe(1)
    expect(run('May diabetes ka.', [], 'tl').text).toContain('Hindi ko masasabi')
    expect(run('You have a doctor you can ask.').changed).toBe(0)
  })
  it('strips emdashes', () => {
    expect(run('Rest — then drink water.').text).toBe('Rest, then drink water.')
  })
})

describe('meds reader', () => {
  it('filters out tombstoned medicines (deleted_at is null) as well as inactive ones', async () => {
    const rows = [{ name: 'Metformin', deleted_at: null, med_status: 'active' }, { name: 'Gone', deleted_at: '2026-10-01', med_status: 'active' }]
    const calls: string[] = []
    let kept = rows
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (c: string, v: string) => { calls.push(`eq ${c}=${v}`); return q }
    q.is = (c: string, v: null) => { calls.push(`is ${c}=${v}`); kept = kept.filter((r) => (r as Record<string, unknown>)[c] === v); return q }
    q.limit = () => Promise.resolve({ data: kept, error: null })
    const out = await medsQuery({ from: () => q }, 'p1')
    expect(calls).toContain('is deleted_at=null')
    expect(calls).toContain('eq med_status=active')
    expect(out.data.map((r: { name: string }) => r.name)).toEqual(['Metformin'])
  })
})

describe('context assembly', () => {
  const reader = (over: Partial<Reader> = {}): Reader => ({
    person: async () => 'p1',
    meds: async () => [{ name: 'Metformin', generic_name: 'metformin', strength: '500 mg', dose: '1 tablet', }],
    labs: async () => [
      { test_code: 'hba1c', name_raw: 'HBA1C', value_num: 7.2, value_text: null, unit_raw: '%', flag: 'H', ref_low: 4, ref_high: 5.6, collected_at: '2026-09-01T00:00:00Z' },
      { test_code: null, name_raw: 'Mystery', value_num: null, value_text: null, unit_raw: null, flag: null, ref_low: null, ref_high: null, collected_at: null }
    ],
    catalog: async () => [{ code: 'hba1c', name: 'HbA1c', loinc: '4548-4', aliases: ['hba1c'] }],
    allergies: async () => ['penicillin'],
    ...over
  })
  it('builds short lines, finds lookups the question touches, skips values that are unknown', async () => {
    const o = await assembleOwn(reader(), 'what does my hba1c mean? and metformin?')
    expect(o.meds).toEqual(['Metformin (500 mg, 1 tablet)'])
    expect(o.labs).toEqual(['HbA1c 7.2 %, marked high by the lab, lab range 4 to 5.6 on 2026-09-01'])
    expect(o.allergies).toEqual(['penicillin'])
    expect(o.lookups).toEqual([{ kind: 'rxnorm', code: 'metformin' }, { kind: 'loinc', code: '4548-4' }])
    expect(o.tokens).toContain('500')
  })
  it('no lookup when the question is about something else', async () => {
    expect((await assembleOwn(reader(), 'is rice ok?')).lookups).toEqual([])
  })
  it('a person with no row, or failing reads, gives empty context and never throws', async () => {
    expect((await assembleOwn(reader({ person: async () => null }), 'x')).meds).toEqual([])
    const bad = await assembleOwn(reader({ meds: async () => { throw new Error('rls') }, labs: async () => { throw new Error('rls') } }), 'x')
    expect(bad.meds).toEqual([])
    expect(bad.allergies).toEqual(['penicillin'])
  })
})

describe('MedlinePlus Connect', () => {
  const feed = { feed: { entry: [{ title: { _value: 'Metformin' }, summary: { _value: '<p>Metformin treats type 2 diabetes.</p>' }, link: [{ href: 'https://medlineplus.gov/druginfo/meds/a696005.html' }] }] } }
  it('builds the url from a code or a name only', () => {
    expect(connectUrl({ kind: 'loinc', code: '4548-4' })).toContain('mainSearchCriteria.v.c=4548-4')
    expect(connectUrl({ kind: 'rxnorm', code: 'metformin' })).toContain('mainSearchCriteria.v.dn=metformin')
  })
  it('parses, caches for 12 h, and caches a miss too', async () => {
    let t = 0
    const f = vi.fn(async () => new Response(JSON.stringify(feed)))
    const m = makeMedline(f as never, () => t)
    const a = await m({ kind: 'rxnorm', code: 'Metformin' })
    expect(a?.summary).toBe('Metformin treats type 2 diabetes.')
    await m({ kind: 'rxnorm', code: 'metformin' })
    expect(f).toHaveBeenCalledTimes(1)
    t = 13 * 3_600_000
    await m({ kind: 'rxnorm', code: 'metformin' })
    expect(f).toHaveBeenCalledTimes(2)
    expect(parseTopic({ feed: { entry: [] } })).toBeNull()
  })
  it('a failed fetch gives null and is not cached', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(new Response(JSON.stringify(feed)))
    const m = makeMedline(f as never)
    expect(await m({ kind: 'loinc', code: '1-1' })).toBeNull()
    expect(await m({ kind: 'loinc', code: '1-1' })).not.toBeNull()
  })
})

describe('parseCompletion', () => {
  it('reads text, whitelisted tools and usage; empty answers throw so the fallback runs', () => {
    const r = parseCompletion({ choices: [{ message: { content: 'Hi', tool_calls: [{ function: { name: 'open_screen', arguments: '{"tab":"health"}' } }, { function: { name: 'evil', arguments: '{}' } }, { function: { name: 'log_activity', arguments: '{bad' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 } })
    expect(r.tool_calls).toEqual([{ name: 'open_screen', arguments: { tab: 'health' } }])
    expect(r.usage).toEqual({ tokensIn: 10, tokensOut: 5, cost: 0.001 })
    expect(() => parseCompletion({ choices: [{ message: { content: '' } }] })).toThrow()
    expect(parseCompletion({ choices: [{ message: { content: 'x' } }] }).usage.cost).toBeNull()
  })
})

// index.ts wiring, no network: Deno.serve, supabase-js and fetch are stubbed, so the real handler sets x-bantay-model-called.
vi.mock('npm:@supabase/supabase-js@2.118.0', () => {
  const rows = { data: [], error: null }
  const chain: unknown = new Proxy(() => chain, { get: (_t, k) => (k === 'then' ? (r: (v: unknown) => unknown) => r(rows) : k === 'maybeSingle' ? async () => ({ data: { id: 'p1' }, error: null }) : chain), apply: () => chain })
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      rpc: async (fn: string) => (fn === 'assistant_take' ? { data: [{ allowed: true }], error: null } : rows),
      from: () => chain
    })
  }
})

describe('index.ts x-bantay-model-called header', () => {
  it('is 0 for the emergency card (no model fetch) and 1 once the model answered', async () => {
    let handler: ((r: Request) => Promise<Response>) | null = null
    const secrets: Record<string, string> = { OPENROUTER_CHAT_KEY: 'test', SUPABASE_URL: 'http://stub.test', SUPABASE_ANON_KEY: 'anon' }
    vi.stubGlobal('Deno', { env: { get: (k: string) => secrets[k] }, serve: (h: typeof handler) => { handler = h } })
    const f = vi.fn(async (url: string) => (String(url).includes('openrouter') ? new Response(JSON.stringify({ choices: [{ message: { content: 'Drink water and rest.' } }] })) : new Response('{}', { status: 404 })))
    vi.stubGlobal('fetch', f)
    try {
      await import('./index.ts')
      const post = (text: string) => handler!(new Request('http://stub.test/ask', { method: 'POST', body: body(text) }))
      const openrouter = () => f.mock.calls.filter(([u]) => String(u).includes('openrouter')).length
      const sos = await post('BP: 180-120 dizzy')
      expect(sos.headers.get('x-bantay-model-called')).toBe('0')
      expect(((await sos.json()) as { emergency: { kind: string } }).emergency.kind).toBe('bp')
      expect(openrouter()).toBe(0)
      const ans = await post('what should I eat for breakfast')
      expect(ans.status).toBe(200)
      expect(ans.headers.get('x-bantay-model-called')).toBe('1')
      expect(openrouter()).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
