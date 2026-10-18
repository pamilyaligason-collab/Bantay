import { App } from '@capacitor/app'
import { useSyncExternalStore } from 'react'
import type { Latest } from './check'
import type { AppUpdaterPlugin } from './plugin'

export type JobApi = Pick<AppUpdaterPlugin, 'download' | 'install'> & Partial<Pick<AppUpdaterPlugin, 'addListener' | 'info'>>
type Phase = 'idle' | 'waiting_wifi' | 'downloading' | 'pending' | 'success' | { error: string }
export type Job = { phase: Phase; done: number; total: number }

type Conn = { type?: string; addEventListener?: (e: string, f: () => void) => void; removeEventListener?: (e: string, f: () => void) => void }
export const connection = () => (navigator as unknown as { connection?: Conn }).connection
export const onCellular = () => connection()?.type === 'cellular'
/** How long after coming back to Bantay a 'pending' install may still report before we stop waiting for it. */
export const PENDING_GRACE = 2000

/** The download lives here, outside any component, so hiding the sheet never loses it and reopening shows the running job instead of starting another (native would answer 'busy'). */
let job: Job = { phase: 'idle', done: 0, total: 0 }
let path: string | null = null // verified APK of cur.latest
let cur: { latest: Latest; api: JobApi } | null = null
let handles: Array<Promise<{ remove: () => void | Promise<void> }> | undefined> = []
let stopWatch: (() => void) | null = null
const subs = new Set<() => void>()
const set = (p: Partial<Job>) => {
  const was = job.phase
  job = { ...job, ...p }
  if (job.phase !== was) { stopWatch?.(); stopWatch = job.phase === 'waiting_wifi' ? watchWifi() : job.phase === 'pending' ? watchPending() : null }
  subs.forEach((f) => f())
}
export const getJob = () => job
export const useJob = (): Job => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => job)
const unlisten = () => { handles.forEach((h) => void h?.then((x) => x.remove(), () => undefined)); handles = [] }
export function resetJob() { unlisten(); path = null; cur = null; set({ phase: 'idle', done: 0, total: 0 }) }
const codeOf = (e: unknown) => { const x = e as { code?: unknown; message?: unknown } | null; return String(x?.code ?? x?.message ?? '') }

/** Waiting for Wi-Fi: start by itself once the connection is not mobile data, even with the sheet hidden. Polls too, because not every WebView fires connection events. */
function watchWifi() {
  const f = () => { if (!onCellular() && cur) void runJob(cur.latest, cur.api) }
  const c = connection()
  c?.addEventListener?.('change', f)
  const t = setInterval(f, 3000)
  return () => { c?.removeEventListener?.('change', f); clearInterval(t) }
}

/** Android's box can close without an installResult (Back, swipe away). On return, give the result a moment, then check the installed version: newer means done, else go back to idle with the verified file kept. */
function watchPending() {
  let t: ReturnType<typeof setTimeout> | undefined
  const check = async () => {
    const want = cur?.latest.versionCode ?? Infinity
    const now = await cur?.api.info?.().catch(() => null)
    if (job.phase !== 'pending') return
    if (now && now.versionCode >= want) { unlisten(); set({ phase: 'success' }) }
    else { unlisten(); set({ phase: 'idle' }) }
  }
  const back = () => { if (document.visibilityState !== 'visible') return; clearTimeout(t); t = setTimeout(() => void check(), PENDING_GRACE) }
  document.addEventListener('visibilitychange', back)
  const resume = Promise.resolve(App.addListener('resume', back)).catch(() => undefined)
  return () => { clearTimeout(t); document.removeEventListener('visibilitychange', back); void resume.then((h) => h?.remove(), () => undefined) }
}

async function install(api: JobApi) {
  try {
    const r = await api.install({ path: path! })
    if (r.status === 'success') { unlisten(); set({ phase: 'success' }) }
    else if (r.status === 'pending_user') set({ phase: 'pending' })
    else { unlisten(); set({ phase: { error: 'install' } }) } // file stays: Try again re-runs only the install
  } catch (e) { unlisten(); path = null; set({ phase: { error: codeOf(e) || 'install' } }) } // unknown state: download again
}

/** Pending view "Try again": open Android's box again for the verified file. */
export async function retryInstall(api: JobApi) {
  if (job.phase === 'pending' && path) await install(api)
}

/** A newer latest.json arrived: the file of the older version is useless; a waiting job waits for the newer one. */
export function forgetOlder(latest: Latest) {
  if (!cur || cur.latest.versionCode >= latest.versionCode || job.phase === 'downloading' || job.phase === 'pending') return
  path = null
  cur = { ...cur, latest }
}

/** Update now: on mobile data with Wi-Fi only on, queue the job until the connection changes. */
export function startJob(latest: Latest, api: JobApi, wifiOnly: boolean) {
  if (job.phase === 'downloading' || job.phase === 'pending') return
  const have = path && cur?.latest.versionCode === latest.versionCode // a verified file needs no data
  if (wifiOnly && onCellular() && !have) { cur = { latest, api }; set({ phase: 'waiting_wifi' }); return }
  void runJob(latest, api)
}

export async function runJob(latest: Latest, api: JobApi) {
  if (job.phase === 'downloading' || job.phase === 'pending') return
  if (cur && cur.latest.versionCode !== latest.versionCode) path = null
  cur = { latest, api }
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
