export const SKIP_RE: RegExp
export function isSkipped(segments: string[]): boolean
export function classifyType(text: string): 'laboratory' | 'consultation' | 'ultrasound' | 'urinalysis' | 'other'
export function dateFrom(text: string): string
export function csvRow(r: Record<string, string>): string
export function walk(
  list: (id: string) => Promise<{ id: string; name: string; mime: string }[]>,
  rootId: string,
  people: string[]
): Promise<Record<string, string>[]>
export function assertAllowed(argv: string[], env: Record<string, string | undefined>): void
export function buildRequest(o: { model: string; fallbackModel: string; mime: string; base64: string; filename?: string }): {
  model: string
  models: string[]
  provider: { zdr: boolean; data_collection: string }
  response_format: unknown
  messages: { content: { type: string }[] }[]
}
export function esc(s: unknown): string
export function reviewHtml(person: string, items: Record<string, unknown>[]): string
export function sendToOpenRouter(fetchImpl: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>, body: unknown, key: string, log?: (m: string) => void): Promise<any>
