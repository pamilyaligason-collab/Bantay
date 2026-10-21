import { logActivity } from '../log/store'
import { selfIdOrCached } from '../sync/profile'
import type { LogResult } from '../today/actions'
import { EX_PREFIX, minutesOf } from './weekly'
import type { Move } from './recommend'

/** Done on a move: one activity row of kind 'ex:<moveId>' with its minutes (no new table). Signed out: nothing is written and the person is told. */
export async function logMove(move: Pick<Move, 'id' | 'durationSec'>, now = new Date()): Promise<LogResult> {
  try {
    const personId = await selfIdOrCached()
    if (!personId) return 'signedout'
    const minutes = minutesOf(move)
    await logActivity({ personId, kind: `${EX_PREFIX}${move.id}`, minutes, steps: null, startedAt: new Date(now.getTime() - minutes * 60_000).toISOString(), source: 'manual' })
    return 'ok'
  } catch {
    return 'failed'
  }
}
