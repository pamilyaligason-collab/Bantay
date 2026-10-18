export function uuid5(name: string, ns?: string): string
export function lit(v: unknown): string
export function buildLoadSql(o: {
  manifest: { files: Record<string, any>[] }
  drafts: Record<string, Record<string, any>>
  peopleMap: Record<string, string>
  catalog?: unknown[]
}): { sql: string; summary: Record<string, any> }
