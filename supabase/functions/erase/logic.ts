// Erasure run (D-78, S6b): for each request past its 7-day undo window, remove the user's storage objects first, then every database row
// in one transaction (public.erase_user_data). audit_log is kept. Drive copies belong to the family folder owner (D-46).
// A failure on one user never stops the others; storage goes first so a failed removal leaves the paths in the database for the next run.
import { safeEqual } from '../_shared/pin.ts'

export interface ErasePort {
  due(): Promise<{ userId: string }[]>
  paths(userId: string): Promise<{ bucket: string; path: string }[]>
  removeObjects(bucket: string, paths: string[]): Promise<boolean>
  eraseUser(userId: string): Promise<boolean>
}
export interface EraseSummary { due: number; erased: number; failed: number }

/** Counts only (B-7): never a user id or a path. */
export async function runErase(port: ErasePort): Promise<EraseSummary> {
  const todo = await port.due()
  let erased = 0, failed = 0
  for (const { userId } of todo) {
    try {
      const byBucket = new Map<string, string[]>()
      for (const p of await port.paths(userId)) byBucket.set(p.bucket, [...(byBucket.get(p.bucket) ?? []), p.path])
      for (const [bucket, paths] of byBucket) if (!(await port.removeObjects(bucket, paths))) throw new Error('storage')
      if (!(await port.eraseUser(userId))) throw new Error('db')
      erased++
    } catch { failed++ }
  }
  return { due: todo.length, erased, failed }
}

/** The cron secret check (header x-erase-secret vs ERASE_CRON_SECRET); an unset or short secret refuses everything. */
export function secretOk(header: string | null, secret: string | undefined): boolean {
  return !!secret && secret.length >= 32 && !!header && safeEqual(header, secret)
}
