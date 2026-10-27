/** Pure maths for the sheet drag-to-dismiss (Apple WWDC "Designing Fluid Interfaces"): momentum projection, rubber band, release decision. Distances px, velocity px/ms. */

/** Where a release at velocity v (px/ms) would come to rest, as a distance from the release point: v * d / (1 - d). d=0.99 is the normal scroll deceleration. */
export const projectRelease = (v: number, d = 0.99): number => (v * d) / (1 - d)

/** The pull-up resistance: the finger moved `over` px past the edge, the sheet moves less, and never more than `dim` (the sheet height). iOS curve, c=0.55. */
export const rubberband = (over: number, dim: number): number => (over <= 0 || dim <= 0 ? 0 : (1 - 1 / ((over * 0.55) / dim + 1)) * dim)

/** The sheet offset for a finger offset dy: 1:1 downward, rubber-banded upward (negative). */
export const dragOffset = (dy: number, height: number): number => (dy >= 0 ? dy : -rubberband(-dy, height))

export type Sample = { y: number; t: number }
/** Vertical velocity (px/ms, positive = down) over the last 100 ms of samples; 0 when there is not enough to tell. */
export function velocityOf(samples: Sample[]): number {
  const last = samples[samples.length - 1]
  if (!last) return 0
  const first = samples.find((s) => last.t - s.t <= 100) ?? last
  const dt = last.t - first.t
  return dt > 0 ? (last.y - first.y) / dt : 0
}

/** Dismiss when the sheet, carried on by its release velocity, ends past 40% of its height, or is flicked down faster than 0.5 px/ms. */
export const shouldDismiss = (offset: number, velocity: number, height: number): boolean =>
  velocity > 0.5 || offset + projectRelease(velocity) > 0.4 * height
