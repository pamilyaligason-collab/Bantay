import type { ComponentType } from 'react'
import { registerSub, type DiscoverSub } from '..'

/** discover/index.ts imports the sub files before its own body runs (imports are hoisted), so its registry can still be in the temporal dead zone
 *  (bundler and test runner alike). Try now; if that throws, try again until the registry is ready. shortcut: polls up to 5 s, remove when the registry is a `var`. */
export function registerWhenReady(sub: DiscoverSub, Screen: ComponentType, tries = 0): void {
  try { registerSub(sub, Screen) } catch { if (tries < 200) setTimeout(() => registerWhenReady(sub, Screen, tries + 1), 25) }
}
