import { getAccessToken } from '../auth/session'
import { aiOn } from '../privacy/ai'
import { viewerRegion } from '../location/region'
import { buildRequest, parseReply, type Msg } from './tools'

export type AskResult = ReturnType<typeof parseReply> | { error: 'off' | 'unconfigured' | 'signin' | 'limit' | 'failed' }

type Env = { VITE_ASSISTANT_PROVIDER?: string; VITE_ASSISTANT_URL?: string; VITE_SUPABASE_URL?: string }

/** Ask goes to the Supabase function `ask` (gate, router, monthly spend cap; default since Lloyd's 2026-11-10 switch). VITE_ASSISTANT_PROVIDER='n8n' keeps the old n8n webhook in VITE_ASSISTANT_URL as a rollback. Same request and reply shape. */
export function assistantUrl(env: Env = import.meta.env as Env): string | undefined {
  if (env.VITE_ASSISTANT_PROVIDER === 'n8n') return env.VITE_ASSISTANT_URL || undefined
  return env.VITE_SUPABASE_URL ? `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/ask` : undefined
}

export async function ask(messages: Msg[], screen: string, url = assistantUrl(), f: typeof fetch = fetch): Promise<AskResult> {
  if (!(await aiOn())) return { error: 'off' } // privacy.ai: no request leaves the phone
  if (!url) return { error: 'unconfigured' }
  const token = await getAccessToken()
  const region = (await viewerRegion()) ?? 'unknown'
  try {
    const res = await f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(buildRequest(messages, screen, region)),
      signal: AbortSignal.timeout(65_000) // the function may try up to three models in turn (about 60 s worst case); never wait forever
    })
    if (res.status === 401) return { error: 'signin' }
    if (res.status === 429) return { error: 'limit' }
    if (!res.ok) return { error: 'failed' }
    return parseReply(await res.json())
  } catch {
    return { error: 'failed' }
  }
}
