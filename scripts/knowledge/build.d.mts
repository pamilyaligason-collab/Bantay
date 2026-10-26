export const BEGIN: string
export const END: string
export const HOSTS: string[]
export interface Topic {
  slug: string
  title_en: string
  title_tl: string
  summary: string
  source_name: string
  source_url: string
  reviewed_at: string
  synonyms: string[]
}
export function validate(topics: unknown): string[]
export function seedSql(topics: Topic[]): string
export function spliceSeed(migration: string, seed: string): string
