import { useEffect, useRef, useState } from 'react'
import type { Reading } from '../health/ranges'
import { onDay } from '../nutrition/logic'
import { bpRow, checkInRow } from '../today/dayRows'
import './nudgeDue.css'

// D-125 nudges: which items are Due, and which one of them moves. Pure rules first, then the once-per-open claim.

const DAY = 86_400_000
const WATER_FROM_HOUR = 14 // 2 PM local

/** Blood pressure is due when no reading landed in the last 7 days: the My day row's own rule, not a second one. */
export const bpDue = (readings: Pick<Reading, 'test' | 'value' | 'takenAt'>[], now: Date): boolean => !bpRow(readings, now).done

/** The check-in is due until one is saved today. */
export const checkInDue = (activity: { kind: string; startedAt: string }[], now: Date): boolean => !checkInRow(activity, now).done

/** Water is due from 2 PM local (2:00 itself counts) while today's total is under half the goal (exactly half is not due). */
export const waterDue = (rows: { drunkAt: string; ml: number }[], goalMl: number | null, now: Date): boolean =>
  goalMl != null && now.getHours() >= WATER_FROM_HOUR && onDay(rows, now).reduce((s, r) => s + r.ml, 0) * 2 < goalMl

/** A pinned sugar, pulse or weight is due when none was logged in the last 7 days (exactly 7 days old still counts), but only for someone who has an earlier reading of it. */
export function metricDue(readings: Pick<Reading, 'test' | 'takenAt'>[], code: string, now: Date): boolean {
  const mine = readings.filter((r) => r.test === code)
  return mine.length > 0 && !mine.some((r) => now.getTime() - Date.parse(r.takenAt) <= 7 * DAY)
}

/** The one item that may move: the first due one in the given priority order, nothing on a quiet screen. */
export const pickMover = (order: { key: string; due: boolean }[], quiet: boolean): string | null => (quiet ? null : order.find((o) => o.due)?.key ?? null)

const moved = new Set<string>() // per app open, per screen and item; no storage
/** Tests only. */
export const resetNudges = (): void => moved.clear()
/** Data must hold still this long before anything moves, so an item that looks Due only while its rows load never moves. */
export const NUDGE_SETTLE_MS = 700
/** The move is over after this long (the animation is 1.2 s): the state is cleared then, so nothing replays when a button is disabled and enabled again. A screen that unmounts sooner gives the claim back, so its next mount plays the move instead of nothing. */
export const NUDGE_PLAY_MS = 1_200

/** `pick` is the item pickMover chose on this screen. Returns it once, after it has stayed the pick for NUDGE_SETTLE_MS, for NUDGE_PLAY_MS, and only if it has not moved in this app open and motion is allowed. At most one item per mounted screen. */
export function useNudgeMover(screen: string, pick: string | null): string | null {
  const [mover, setMover] = useState<string | null>(null)
  const started = useRef(false)
  const claim = useRef<string | null>(null)
  useEffect(() => {
    const id = `${screen}.${pick}`
    if (!pick || started.current || moved.has(id) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => { started.current = true; moved.add(id); claim.current = id; setMover(pick) }, NUDGE_SETTLE_MS)
    return () => clearTimeout(t)
  }, [screen, pick])
  useEffect(() => {
    if (!mover) return
    const t = setTimeout(() => { claim.current = null; setMover(null) }, NUDGE_PLAY_MS)
    return () => clearTimeout(t)
  }, [mover])
  useEffect(() => () => { if (claim.current) moved.delete(claim.current) }, [])
  return mover
}
