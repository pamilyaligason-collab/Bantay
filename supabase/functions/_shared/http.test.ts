// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { corsHeaders } from './http.ts'

const A = 'https://bantay.pages.dev'
const P = 'https://abc123.bantay.pages.dev'
const allow = (a: string | undefined, o: string | null) => corsHeaders(a, o)['Access-Control-Allow-Origin']

describe('corsHeaders ALLOWED_ORIGIN (C1)', () => {
  it('one origin works as before', () => {
    expect(allow(A, A)).toBe(A)
    expect(allow(A, P)).toBeUndefined()
  })
  it('a comma list (app origin plus an APK test preview) echoes only the matching origin', () => {
    expect(allow(`${A}, ${P}`, P)).toBe(P)
    expect(allow(`${A},${P}`, A)).toBe(A)
    expect(allow(`${A},${P}`, 'https://evil.test')).toBeUndefined()
    expect(corsHeaders(`${A},${P}`, P).Vary).toBe('Origin')
  })
  it('no origin, empty, undefined or a partial match gets no CORS headers', () => {
    expect(allow(`${A},${P}`, null)).toBeUndefined()
    expect(allow('', A)).toBeUndefined()
    expect(allow(undefined, A)).toBeUndefined()
    expect(allow(`${A},${P}`, 'https://bantay.pages')).toBeUndefined()
    expect(allow(`${A},${P}`, `${A}.evil.test`)).toBeUndefined()
    expect(Object.keys(corsHeaders(undefined, A))).toEqual(['Vary'])
  })
})
