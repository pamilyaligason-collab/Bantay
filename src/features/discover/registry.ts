import type { ComponentType } from 'react'
import type { DiscoverSub } from './index'

// Own file so a sub's `import './learn'` line in index.ts cannot reach the map before it exists (an import cycle through index.ts left it uninitialised).
const subs = new Map<DiscoverSub, ComponentType>()

/** A batch 2 lane calls this once at import time with its screen; Discover draws it under that sub-tab. A second call for the same sub replaces the first. */
export function registerSub(sub: DiscoverSub, Screen: ComponentType): void { subs.set(sub, Screen) }
export const subScreen = (sub: DiscoverSub): ComponentType | undefined => subs.get(sub)
