import { getAccessToken } from '../auth/session'
import { buildRequest, parseReply, type Msg } from './tools'

export type AskResult = ReturnType<typeof parseReply> | { error: 'unconfigured' | 'signin' | 'limit' | 'failed' }

export async function ask(messages: Msg[], screen: string, url = import.meta.env.VITE_ASSISTANT_URL as string | undefined, f: typeof fetch = fetch): Promise<AskResult> {
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
