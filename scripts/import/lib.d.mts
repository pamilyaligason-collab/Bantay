export const SKIP_RE: RegExp
export function isSkipped(segments: string[]): boolean
export function classifyType(text: string): 'laboratory' | 'consultation' | 'ultrasound' | 'urinalysis' | 'other'
export function dateFrom(text: string): string
export function csvRow(r: Record<string, string>): string
export function walk(
  list: (id: string) => Promise<{ id: string; name: string; mime: string; size?: string | null; modified?: string | null; md5?: string | null }[]>,
  rootId: string,
  people: string[],
  onSkip?: () => void
): Promise<Record<string, string>[]>
export function assertAllowed(argv: string[], env: Record<string, string | undefined>): void
export const PROMPT_IDENTITY: string
export function buildRequest(o: { model: string; fallbackModel: string; mime: string; base64?: string; filename?: string; text?: string; prompt?: string }): {
  model: string
  models: string[]
  provider: { zdr: boolean; data_collection: string }
  max_tokens: number
  reasoning: { effort: string }
  response_format: unknown
  messages: { content: { type: string }[] }[]
}
export function sendToOpenRouter(fetchImpl: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>, body: unknown, key: string, log?: (m: string) => void, onUsage?: (u: Usage) => void): Promise<any>
export interface Usage { model: string | null; prompt_tokens: number | null; completion_tokens: number | null; reasoning_tokens: number | null; cost: number | null }
export function usageCounts(j: unknown): Usage
export const MAX_TOKENS: number
export const fileKey: (id: string | number) => string
