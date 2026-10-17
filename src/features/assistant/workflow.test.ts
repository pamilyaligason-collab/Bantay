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
  it('references the credential by name only and holds no secrets', () => {
    const creds = nodes.flatMap((n) => Object.values(n.credentials ?? {}).map((c) => c.name))
    expect(creds).toEqual(['Bantay OpenRouter ZDR'])
    expect(text).not.toMatch(/sk-or-|eyJhbGci/)
  })
})
