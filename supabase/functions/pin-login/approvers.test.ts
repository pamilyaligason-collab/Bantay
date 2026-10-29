// SEC-1 guard: the pin_approve alert goes to admins only, the same people approve_pin_reset (0043) lets approve. Source grep: index.ts cannot be imported outside Deno.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('pin-login notifyApprovers', () => {
  it('selects only active admins, never the requester', () => {
    const src = readFileSync('supabase/functions/pin-login/index.ts', 'utf8')
    const line = src.split('\n').find((l) => l.includes("from('app_roles')") && l.includes('members')) ?? ''
    expect(line).toContain(".eq('disabled', false)")
    expect(line).toContain(".eq('role', 'admin')")
    expect(line).toContain(".neq('user_id', userId)")
  })
})
