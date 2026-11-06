import type { AlertRow } from './store'
import { TEMPLATES, type NotifyKind, type TemplateId } from './templates'

/** SOS first, then a storm call for help, then a dangerous reading, a hazard (a missed dose is a My day row, v13 T2); the other urgent kinds after those. */
export const PRIORITY: NotifyKind[] = ['sos', 'rollcall', 'reading_high', 'hazard', 'mood_unwell', 'pin_approve', 'pin_changed', 'system']

export const toneOf = (r: AlertRow) => (Object.hasOwn(TEMPLATES, r.template) ? TEMPLATES[r.template as TemplateId].tone : 'normal')

/** The family alert rows Today's red notice can show: unseen, urgent tone, a kind in PRIORITY. One filter for AlertCardToday and Archive all (ML-34). */
export const todayRed = (rows: AlertRow[]): AlertRow[] => rows.filter((r) => r.seenAt == null && toneOf(r) === 'urgent' && PRIORITY.includes(r.kind))
