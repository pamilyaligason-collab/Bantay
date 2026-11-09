import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import Article from './Article'

vi.mock('../../auth/client', () => ({ supabase: null }))
vi.mock('../../auth/session', () => ({ getAccessToken: async () => null, getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('./fullLibrary', () => ({ searchFullLibrary: async () => [], readArticle: async () => null, FULL_LIBRARY_HOSTED: true }))

beforeEach(async () => { await db.kv.clear(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ feed: { entry: [] } }) })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Article (S26)', () => {
  it('s:ALT shows the glossary note with no network request', async () => {
    render(<Article rawKey="s:ALT" />)
    expect(await screen.findByRole('heading', { name: 'ALT (SGPT)' })).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('a test with nothing anywhere says so in plain words', async () => {
    render(<Article rawKey="s:Zzzqx" />)
    expect((await screen.findByTestId('article-none')).textContent).toBe('No plain-words note for this yet. Ask your doctor or pharmacist what it means.')
  })
})
