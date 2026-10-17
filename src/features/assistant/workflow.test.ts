import { describe, expect, it } from 'vitest'
import wf from '../../../ops/n8n/assistant.json'

const text = JSON.stringify(wf)
type Node = { name: string; type: string; credentials?: Record<string, { name: string }>; parameters: Record<string, unknown> }
const nodes = wf.nodes as Node[]

describe('ops/n8n/assistant.json', () => {
  it('is inactive and keeps no execution data', () => {
    expect(wf.active).toBe(false)
    expect(wf.settings).toMatchObject({ saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', saveManualExecutions: false })
  })
  it('forces zero data retention and never uses a free model', () => {
    expect(text).toMatch(/zdr\W+true/)
    expect(text).toMatch(/data_collection\W+deny/)
    expect(text).not.toContain(':free')
    expect(text).toContain('google/gemini-3.5-flash-lite')
    expect(text).toContain('anthropic/claude-haiku-5.5')
  })
  it('declares the six tools and verifies the JWT', () => {
    for (const t of ['log_reading', 'log_med_taken', 'log_activity', 'open_screen', 'explain_term', 'whats_the_weather']) expect(text).toContain(t)
    expect(text).toContain('/auth/v1/user')
    expect(nodes.some((n) => n.type === 'n8n-nodes-base.webhook')).toBe(true)
  })
  it('sends no temperature (no ZDR endpoint supports it) and reads no env vars', () => {
    expect(text).not.toContain('temperature')
    expect(text).toMatch(/require_parameters\W+true/)
    expect(text).not.toContain('$env')
    expect(text).toContain('https://wuakimpssycbtnmoexuc.supabase.co/auth/v1/user')
  })
  it('answers 503 (not 429) when the cap RPC gives no answer', () => {
    const r = nodes.find((n) => n.name === 'Respond 503')!
    expect(JSON.stringify(r.parameters)).toMatch(/unavailable/)
    expect(JSON.stringify(r.parameters)).toContain('503')
    expect((wf.connections as Record<string, { main: { node: string }[][] }>)['RPC answered?']!.main[1]![0]!.node).toBe('Respond 503')
    expect((wf.connections as Record<string, { main: { node: string }[][] }>)['Take daily slot']!.main[0]![0]!.node).toBe('RPC answered?')
  })
  it('references credentials by name only and holds no secrets', () => {
    const creds = nodes.flatMap((n) => Object.values(n.credentials ?? {}).map((c) => c.name)).sort()
    expect(creds).toEqual(['Bantay OpenRouter ZDR', 'Bantay Supabase publishable', 'Bantay Supabase publishable'])
    expect(text).not.toMatch(/sk-or-|eyJhbGci/)
  })
})
