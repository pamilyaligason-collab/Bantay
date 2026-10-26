import { getAccessToken } from '../auth/session'
import { buildRequest, parseReply, type Msg } from './tools'

export type AskResult = ReturnType<typeof parseReply> | { error: 'unconfigured' | 'signin' | 'limit' | 'failed' }

type Env = { VITE_ASSISTANT_PROVIDER?: string; VITE_ASSISTANT_URL?: string; VITE_SUPABASE_URL?: string }

/** VITE_ASSISTANT_PROVIDER='edge' sends Ask to the Supabase function `ask`; anything else (default) keeps the n8n webhook in VITE_ASSISTANT_URL. Same request and reply shape. */
export function assistantUrl(env: Env = import.meta.env as Env): string | undefined {
  if (env.VITE_ASSISTANT_PROVIDER === 'edge') return env.VITE_SUPABASE_URL ? `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/ask` : undefined
  return env.VITE_ASSISTANT_URL || undefined
}

export async function ask(messages: Msg[], screen: string, url = assistantUrl(), f: typeof fetch = fetch): Promise<AskResult> {
  if (!url) return { error: 'unconfigured' }
  const token = await getAccessToken()
  try {
    const res = await f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(buildRequest(messages, screen))
    })
    if (res.status === 401) return { error: 'signin' }
    if (res.status === 429) return { error: 'limit' }
    if (!res.ok) return { error: 'failed' }
    return parseReply(await res.json())
  } catch {
    return { error: 'failed' }
  }
}
