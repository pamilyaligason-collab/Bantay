import { supabase } from '../auth/client'
import { SAFETY_IDS, TEMPLATES, type TemplateId } from '../notify/templates'

// B-7: a broadcast is one fixed safety template id. The body is exactly {t}. There is no free-text path.
// The send itself runs in the Supabase Edge Function supabase/functions/broadcast (admin check, web push).
export const BROADCAST_IDS: readonly TemplateId[] = SAFETY_IDS
export const templateLabel = (id: TemplateId) => TEMPLATES[id].title

export type BroadcastResult = { ok: true } | { ok: false; error: string }

export async function sendBroadcast(id: string): Promise<BroadcastResult> {
  if (!(BROADCAST_IDS as readonly string[]).includes(id)) return { ok: false, error: 'Pick one of the safety messages.' }
  if (!supabase) return { ok: false, error: 'Not connected yet. Admin tools need the internet and the Bantay server.' }
  try {
    const { error } = await supabase.functions.invoke('broadcast', { body: { t: id } })
    if (!error) return { ok: true }
    const status = (error as { context?: { status?: number } }).context?.status
    return { ok: false, error: status === 401 || status === 403 ? 'Only an admin can send this.' : 'The broadcast did not go out. Try again.' }
  } catch {
    return { ok: false, error: 'No connection. The broadcast did not go out.' }
  }
}
