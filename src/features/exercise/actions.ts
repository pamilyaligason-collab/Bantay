import { logActivity } from '../log/store'
import { selfIdOrCached } from '../sync/profile'
import type { LogResult } from '../today/actions'
import { EX_PREFIX, minutesOf } from './weekly'
import type { Move } from './recommend'

/** Done on a move: one activity row of kind 'ex:<moveId>' with its minutes (no new table). Signed out: nothing is written and the person is told.
 *  `minutes` is the person's own count (1 to 180 whole minutes); anything else falls back to the move's usual time. */
export async function logMove(move: Pick<Move, 'id' | 'durationSec'>, now = new Date(), minutes?: number): Promise<LogResult> {
  try {
    const personId = await selfIdOrCached()
    if (!personId) return 'signedout'
    const mins = typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 1 && minutes <= 180 ? minutes : minutesOf(move)
    await logActivity({ personId, kind: `${EX_PREFIX}${move.id}`, minutes: mins, steps: null, startedAt: new Date(now.getTime() - mins * 60_000).toISOString(), source: 'manual' })
    return 'ok'
  } catch {
    return 'failed'
  }
}
