import { supabase } from '../auth/client'

// S6b (0034) RPCs, contract names: export_my_data() jsonb, request_erasure() timestamptz (= cancel_until), cancel_erasure() void.
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const OFFLINE = 'Could not reach the server. Try again when you have signal.'

async function call<T>(fn: 'export_my_data' | 'request_erasure' | 'cancel_erasure'): Promise<Result<T>> {
  if (!supabase) return { ok: false, error: OFFLINE }
  try {
    const { data, error } = await supabase.rpc(fn)
    return error ? { ok: false, error: OFFLINE } : { ok: true, value: data as T }
  } catch { return { ok: false, error: OFFLINE } }
}

export const exportMyData = () => call<unknown>('export_my_data')
/** value = cancel_until (ISO): the last moment the deletion can be undone. */
export const requestErasure = () => call<string>('request_erasure')
export const cancelErasure = () => call<null>('cancel_erasure')

export const ERASURE_KEY = 'privacy.erasure' // kv: cancel_until ISO while a deletion is pending on this phone
export const AI_KEY = 'privacy.ai' // kv: boolean, default true; false = Jack and photo reading are paused on this phone

/** Hands the export to the browser or WebView as a file download. */
export function saveJson(name: string, data: unknown): boolean {
  try {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch { return false }
}
