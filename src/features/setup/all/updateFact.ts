import type { Job } from '../../update/job'
import type { UpdateState } from '../../update/useUpdate'
import type { UpdateFact } from './rows'

const MB = 1048576

/** The update row's input: the installed shell, the newest build, and the download the app is running (it lives outside the screen). Null on the web, where updates arrive by themselves. */
export function updateFact(u: UpdateState, job: Job, canInstall: boolean | null): UpdateFact | null {
  if (!u.shell || u.shell.versionCode === 0) return null
  const latest = u.decision.kind === 'none' ? null : u.decision.latest
  const total = job.total || latest?.size || 0
  return {
    kind: u.decision.kind, versionName: latest?.versionName ?? u.shell.versionName, sizeMB: latest ? Math.round((latest.size / MB) * 10) / 10 : 0, canInstall,
    phase: typeof job.phase === 'object' ? 'error' : job.phase === 'success' ? 'idle' : job.phase,
    pct: total ? Math.min(100, Math.round((job.done / total) * 100)) : 0
  }
}
