import type { ComponentType } from 'react'
import { registerSub } from '../registry'
import type { DiscoverSub } from '..'

/** Registers at import time. The registry lives in its own file with no import cycle (S26), so this is synchronous: a cold deep link into a sub never draws "Coming in this update". */
export function registerWhenReady(sub: DiscoverSub, Screen: ComponentType): void { registerSub(sub, Screen) }
