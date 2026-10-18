import { useSyncExternalStore } from 'react'
import type { Latest } from './check'
import type { AppUpdaterPlugin } from './plugin'

export type JobApi = Pick<AppUpdaterPlugin, 'download' | 'install'> & Partial<Pick<AppUpdaterPlugin, 'addListener'>>
export type Job = { phase: 'idle' | 'downloading' | 'pending' | 'success' | { error: string }; done: number; total: number }

/** The download lives here, outside any component, so hiding the sheet never loses it and reopening shows the running job instead of starting another (native would answer 'busy'). */
let job: Job = { phase: 'idle', done: 0, total: 0 }
let path: string | null = null
let handles: Array<Promise<{ remove: () => void | Promise<void> }> | undefined> = []
const subs = new Set<() => void>()
const set = (p: Partial<Job>) => { job = { ...job, ...p }; subs.forEach((f) => f()) }
export const useJob = (): Job => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => job)
const unlisten = () => { handles.forEach((h) => void h?.then((x) => x.remove(), () => undefined)); handles = [] }
export function resetJob() { unlisten(); path = null; set({ phase: 'idle', done: 0, total: 0 }) }
const codeOf = (e: unknown) => { const x = e as { code?: unknown; message?: unknown } | null; return String(x?.code ?? x?.message ?? '') }

async function install(api: JobApi) {
  try {
    const r = await api.install({ path: path! })
    if (r.status === 'success') { unlisten(); set({ phase: 'success' }) }
    else if (r.status === 'pending_user') set({ phase: 'pending' })
    else { unlisten(); set({ phase: { error: 'install' } }) } // file stays: Try again re-runs only the install
  } catch (e) { unlisten(); path = null; set({ phase: { error: codeOf(e) || 'install' } }) } // unknown state: download again
}

export async function runJob(latest: Latest, api: JobApi) {
  if (job.phase === 'downloading' || job.phase === 'pending') return
  unlisten()
  handles = [
    api.addListener?.('progress', (p) => { if (job.phase === 'downloading') set({ done: p.done, total: p.total }) }),
    api.addListener?.('installResult', (r) => {
      unlisten()
      if (r.status === 'success') set({ phase: 'success' })
      else set({ phase: { error: 'install' } }) // failure or cancel: file stays for a retry
    })
  ] as typeof handles
  if (path) { set({ phase: 'pending' }); await install(api); return }
  set({ phase: 'downloading', done: 0, total: latest.size })
  try {
    path = (await api.download({ url: latest.url, sha256: latest.sha256, size: latest.size })).path
  } catch (e) { unlisten(); set({ phase: { error: codeOf(e) } }); return }
  await install(api)
}
