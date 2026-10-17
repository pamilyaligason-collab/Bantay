import { buildRequest, parseReply, type Msg } from './tools'

/** Supabase JS keeps the session in localStorage as sb-<ref>-auth-token. No session means no header. */
export function accessToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? ''
      if (/^sb-.+-auth-token$/.test(k)) return (JSON.parse(localStorage.getItem(k) ?? '{}') as { access_token?: string }).access_token ?? null
    }
  } catch { /* storage blocked */ }
  return null
}

export type AskResult = ReturnType<typeof parseReply> | { error: 'unconfigured' | 'signin' | 'limit' | 'failed' }

export async function ask(messages: Msg[], screen: string, url = import.meta.env.VITE_ASSISTANT_URL as string | undefined, f: typeof fetch = fetch): Promise<AskResult> {
  if (!url) return { error: 'unconfigured' }
  const token = accessToken()
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
