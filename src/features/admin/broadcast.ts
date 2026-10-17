import { getAccessToken } from '../auth/session'
import { SAFETY_IDS, TEMPLATES, type TemplateId } from '../notify/templates'

// B-7: a broadcast is one fixed safety template id. The body is exactly {t}. There is no free-text path.
export const BROADCAST_IDS: readonly TemplateId[] = SAFETY_IDS
export const broadcastUrl = (): string | undefined => import.meta.env.VITE_BROADCAST_URL || undefined
export const templateLabel = (id: TemplateId) => TEMPLATES[id].title

export type BroadcastResult = { ok: true } | { ok: false; error: string }

export async function sendBroadcast(id: string, f: typeof fetch = fetch): Promise<BroadcastResult> {
  if (!(BROADCAST_IDS as readonly string[]).includes(id)) return { ok: false, error: 'Pick one of the safety messages.' }
  const url = broadcastUrl()
  if (!url) return { ok: false, error: 'Not connected yet. The broadcast address is not set.' }
  const token = await getAccessToken()
  if (!token) return { ok: false, error: 'Sign in again to send.' }
  try {
    const res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ t: id }) })
    return res.ok ? { ok: true } : { ok: false, error: res.status === 401 || res.status === 403 ? 'Only an admin can send this.' : 'The broadcast did not go out. Try again.' }
  } catch {
    return { ok: false, error: 'No connection. The broadcast did not go out.' }
  }
}
