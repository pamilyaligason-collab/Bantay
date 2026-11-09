import { track, WATCH_CH_NAMES } from '../admin/events'

/** "Ask This Old House" -> "ask_this_old_house": letters and single underscores, at most 31 characters, so watch_ch_<key> fits the 40-character event name. */
export const channelKey = (label: string): string =>
  label.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31).replace(/_+$/, '')

/** The allowlisted event name for a channel, or null when the channel is not on the list (never a made-up name). */
export const watchName = (label: string | null | undefined): string | null => {
  if (!label) return null
  const n = `watch_ch_${channelKey(label)}`
  return (WATCH_CH_NAMES as readonly string[]).includes(n) ? n : null
}

/** One tap on a video counts once for its channel. Known channels only; nothing else about the tap is recorded (B-7). */
export function trackWatch(label: string | null | undefined): void {
  const n = watchName(label)
  if (n) void track('action', n)
}
