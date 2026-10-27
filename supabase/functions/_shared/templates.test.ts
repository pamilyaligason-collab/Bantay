// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Edge Functions bundle supabase/functions/_shared/templates.ts; the app and the service worker use src/features/notify/templates.ts. One source, two copies.
describe('templates copy', () => {
  it('the Edge Function copy is byte-identical to the client file', () => {
    const a = readFileSync(new URL('../../../src/features/notify/templates.ts', import.meta.url), 'utf8')
    const b = readFileSync(new URL('./templates.ts', import.meta.url), 'utf8')
    expect(b).toBe(a)
  })
})
