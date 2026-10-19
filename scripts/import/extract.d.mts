import type { Entry } from './sync.mjs'
export function hasRealText(t: unknown): boolean
export function withRetry<T>(fn: () => Promise<T>, o?: { tries?: number; baseMs?: number; sleepFn?: (ms: number) => Promise<void> }): Promise<T>
export function normalizeDraft(p: unknown): Record<string, any>
export function normalizeIdentity(p: unknown): Record<string, any>
export function pending(manifest: { files: Entry[] }, hasDraft: (id: string) => boolean, hasFile: (id: string) => boolean, isAssigned?: (e: Entry) => boolean): Entry[]
export function assignedTo(matcher: unknown): (e: Entry) => boolean
export function extractPdfText(buf: Uint8Array): Promise<string>
