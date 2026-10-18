import { useEffect, useSyncExternalStore } from 'react'
import { db } from '../../db'
import { checkDue, decide, parseLatest, type Decision, type Latest } from './check'
import { forgetOlder } from './job'
import { AppUpdater } from './plugin'

export interface UpdateState {
  shell: { versionCode: number; versionName: string } | null
  decision: Decision
  latest: Latest | null
  checkedAt: number | null
  checking: boolean
  failed: boolean
}
let state: UpdateState = { shell: null, decision: { kind: 'none' }, latest: null, checkedAt: null, checking: false, failed: false }
const subs = new Set<() => void>()
const set = (p: Partial<UpdateState>) => { state = { ...state, ...p }; subs.forEach((f) => f()) }
const kvGet = async <T,>(k: string) => (await db.kv.get(k).catch(() => undefined))?.value as T | undefined
const kvPut = (key: string, value: unknown) => db.kv.put({ key, value }).catch(() => undefined)

/** Same-origin /latest.json (Pages serves it; the release script commits public/latest.json). At most once per 6 h unless forced; between checks the cached copy still drives the card. */
export async function checkForUpdate(force = false, fetcher: typeof fetch = fetch): Promise<UpdateState> {
  if (state.checking) return state
  set({ checking: true, failed: false })
  try {
    const shell = await AppUpdater.info().catch(() => ({ versionCode: 0, versionName: 'web', canInstall: false }))
    let latest = parseLatest(await kvGet('update.latest')) ?? null
    let checkedAt = (await kvGet<number>('update.checkedAt')) ?? null
    let failed = false
    if (shell.versionCode !== 0 && checkDue(checkedAt, Date.now(), force)) {
      try {
        const res = await fetcher('/latest.json', { cache: 'no-store' })
        const got = res.ok ? parseLatest(await res.json()) : null
        if (!got) throw new Error('bad latest.json')
        latest = got
        forgetOlder(got)
        checkedAt = Date.now()
        await kvPut('update.latest', got)
        await kvPut('update.checkedAt', checkedAt)
      } catch { failed = true }
    }
    set({ shell, latest, checkedAt, failed, decision: latest ? decide(shell, latest) : { kind: 'none' } })
  } finally { set({ checking: false }) }
  return state
}

export function useUpdate(): UpdateState {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state)
}

/** Check once on mount of the app shell. */
export function useUpdateCheckOnOpen() {
  useEffect(() => { void checkForUpdate() }, [])
}
