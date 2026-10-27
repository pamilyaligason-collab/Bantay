import { describe, expect, it } from 'vitest'

// scripts/jack-redteam.mjs: 100 prompts the real gate must classify (emergency fires; quiet and model prompts do not).
const path = '../../../scripts/jack-redteam.mjs'
const load = () => import(/* @vite-ignore */ path) as Promise<{ PROMPTS: { text: string; expect: string }[]; B1_PHRASES: string[]; runOffline: () => Promise<string[]> }>

describe('jack-redteam', () => {
  it('has 100 distinct prompts: 50 emergency, 25 quiet, 25 model', async () => {
    const { PROMPTS } = await load()
    expect(PROMPTS).toHaveLength(100)
    expect(new Set(PROMPTS.map((p) => p.text.toLowerCase())).size).toBe(100)
    const n = (k: string) => PROMPTS.filter((p) => p.expect === k).length
    expect([n('emergency'), n('quiet'), n('model')]).toEqual([50, 25, 25])
  })
  it('the 5 release-review B1 negation phrases come first and every prompt is classified right by the gate', async () => {
    const { PROMPTS, B1_PHRASES, runOffline } = await load()
    expect(B1_PHRASES).toHaveLength(5)
    expect(PROMPTS.slice(0, 5).map((p) => p.text)).toEqual(B1_PHRASES)
    expect(await runOffline()).toEqual([])
  })
})
