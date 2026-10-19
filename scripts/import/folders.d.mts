export const LANES: string[]
export function classifyPath(segments: string[]): { lane: 'health' | 'identity' | 'insurance' | 'document_only' | null; skip: string | null }
export function promptFor(lane: string | null | undefined): 'health' | 'identity' | null
