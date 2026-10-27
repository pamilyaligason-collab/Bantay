import type { ComponentType } from 'react'

export type DiscoverSub = 'learn' | 'listen' | 'play' | 'watch' | 'news'
export const DISCOVER_SUBS: { id: DiscoverSub; label: string; soon: string }[] = [
  { id: 'learn', label: 'Learn', soon: 'Short health reads, recipes and a medicine guide.' },
  { id: 'listen', label: 'Listen', soon: 'Articles read out loud, and calm sounds.' },
  { id: 'play', label: 'Play', soon: 'Easy games with no timer.' },
  { id: 'watch', label: 'Watch', soon: 'Videos and live TV that open outside the app.' },
  { id: 'news', label: 'News', soon: 'Good news and fun facts.' }
]

const subs = new Map<DiscoverSub, ComponentType>()

/** A batch 2 lane calls this once at import time with its screen; Discover draws it under that sub-tab. A second call for the same sub replaces the first. */
export function registerSub(sub: DiscoverSub, Screen: ComponentType): void { subs.set(sub, Screen) }
export const subScreen = (sub: DiscoverSub): ComponentType | undefined => subs.get(sub)

/** `#discover/<sub>` with nothing after it. These are tab pages (top bar and Jack button stay); anything deeper draws its own header. */
const SUB_ROOT = /^#?discover\/(learn|listen|play|watch|news)$/
export const isDiscoverSubRoot = (hash: string): boolean => SUB_ROOT.test(hash)
export const subOf = (hash: string): DiscoverSub => (SUB_ROOT.exec(hash)?.[1] as DiscoverSub | undefined) ?? (/^#?discover\/(learn|listen|play|watch|news)\//.exec(hash)?.[1] as DiscoverSub | undefined) ?? 'learn'

// Batch 2 lanes add one side-effect import per sub below, e.g. `import './learn'` (F2), `import './play'` (F3), `import './listen'` and `import './watch'` (F4).
