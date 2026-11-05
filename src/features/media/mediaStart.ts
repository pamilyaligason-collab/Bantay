/** Fired when a video or the radio starts, with the starter's own token: every other player stops (two sounds never play together). The starter ignores its own event. */
export const MEDIA_START_EVENT = 'bantay:media-start'
export const announceMedia = (starter: unknown) => window.dispatchEvent(new CustomEvent(MEDIA_START_EVENT, { detail: starter }))
/** Runs `stop` for a start by anyone but `self`; returns the unsubscribe. */
export function onOtherMedia(self: unknown, stop: () => void): () => void {
  const f = (e: Event) => { if ((e as CustomEvent).detail !== self) stop() }
  window.addEventListener(MEDIA_START_EVENT, f)
  return () => window.removeEventListener(MEDIA_START_EVENT, f)
}
