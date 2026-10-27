// B-7: notifications never carry health values. Every notification is one of these fixed templates,
// picked by id. There is no free-text path: buildNotification rejects any payload but exactly {t: id}.
// Dependency-free on purpose: the service worker bundles this file, and supabase/functions/_shared/templates.ts is a byte-identical
// copy for the Edge Functions (templates.test.ts keeps the two equal).
export type Cls = 'safety' | 'health' | 'carer' // carer: a family member's alert (missed dose, SOS, reading...), own rules in push.ts
export type Tab = 'today' | 'health' | 'records' | 'family' | 'safety'
export type Tone = 'urgent' | 'normal'
type Tpl = { cls: Cls; title: string; body: string; tab: Tab; tone: Tone }

export const TEMPLATES = {
  storm_warning: { cls: 'safety', title: 'Storm warning near you', body: 'Open Bantay to see what to do.', tab: 'safety', tone: 'urgent' },
  flood_watch: { cls: 'safety', title: 'Flooding possible near you', body: 'Open Bantay to see what to do.', tab: 'safety', tone: 'urgent' },
  heat_alert: { cls: 'safety', title: 'Dangerous heat today', body: 'Open Bantay for ways to stay safe.', tab: 'safety', tone: 'urgent' },
  family_sos: { cls: 'safety', title: 'Someone in your family needs help', body: 'Open Bantay now.', tab: 'family', tone: 'urgent' },
  dose_due: { cls: 'health', title: 'Medicine time', body: 'Open Bantay to log it.', tab: 'health', tone: 'normal' },
  dose_missed: { cls: 'health', title: 'A medicine was missed', body: 'Open Bantay to catch up.', tab: 'health', tone: 'urgent' },
  bp_check: { cls: 'health', title: 'Time for a check', body: 'Open Bantay to add a reading.', tab: 'health', tone: 'normal' },
  // Phase 2 (D-78): family alert rows. `<name>` is filled by the in-app renderer from the local people table; a push says "Someone".
  sos_cancel: { cls: 'safety', title: 'The SOS was cancelled', body: '<name> said they are fine; open Bantay to see.', tab: 'family', tone: 'normal' },
  review_open: { cls: 'carer', title: 'A medicine needs an answer', body: 'Open Bantay to answer.', tab: 'health', tone: 'normal' },
  phone_health: { cls: 'carer', title: 'A phone may miss alarms', body: 'Open Bantay to see which phone.', tab: 'family', tone: 'normal' },
  reading_high: { cls: 'carer', title: 'Please check on <name>', body: 'Open Bantay to see more.', tab: 'health', tone: 'urgent' },
  mood_unwell: { cls: 'carer', title: '<name> is not feeling well', body: 'Open Bantay to see more.', tab: 'family', tone: 'urgent' },
  digest: { cls: 'carer', title: "Today's family summary is ready", body: 'Open Bantay to read it.', tab: 'family', tone: 'normal' },
  pin_approve: { cls: 'carer', title: 'Someone asks you to approve a PIN reset', body: 'Open Bantay to approve or ignore it.', tab: 'family', tone: 'urgent' },
  pin_changed: { cls: 'safety', title: 'Your PIN was changed', body: 'If this was not you, tell your family.', tab: 'today', tone: 'urgent' },
  sos_late: { cls: 'safety', title: '<name> used SOS at HH:MM; it reached Bantay later', body: 'Open Bantay to see.', tab: 'family', tone: 'normal' },
  system: { cls: 'carer', title: 'Bantay needs your attention (admin)', body: 'Open Bantay to see what happened.', tab: 'today', tone: 'urgent' }
} as const satisfies Record<string, Tpl>

export type TemplateId = keyof typeof TEMPLATES
const ids = Object.keys(TEMPLATES) as TemplateId[]
export const HEALTH_IDS = ids.filter((i) => TEMPLATES[i].cls === 'health')
/** The ids an admin may broadcast to everyone (supabase/functions/broadcast/logic.ts keeps its own copy, a test keeps them equal). */
export const SAFETY_IDS: TemplateId[] = ['storm_warning', 'flood_watch', 'heat_alert', 'family_sos']

/** The single enum of carer_alerts.kind. Whitelists that must stay equal (ML-28): the 0030 CHECK, this list, ALERT_KIND below, the S8 System health list. */
export const NOTIFY_KINDS = ['dose_missed', 'review_open', 'phone_health', 'reading_high', 'mood_unwell', 'hazard', 'sos', 'sos_cancel', 'digest', 'pin_approve', 'pin_changed', 'system'] as const
export type NotifyKind = (typeof NOTIFY_KINDS)[number]
/** Template id to the alert kind of its carer_alerts row. dose_due and bp_check are local reminders, never rows. */
export const ALERT_KIND = {
  storm_warning: 'hazard', flood_watch: 'hazard', heat_alert: 'hazard', family_sos: 'sos', sos_late: 'sos', sos_cancel: 'sos_cancel',
  dose_missed: 'dose_missed', review_open: 'review_open', phone_health: 'phone_health', reading_high: 'reading_high', mood_unwell: 'mood_unwell',
  digest: 'digest', pin_approve: 'pin_approve', pin_changed: 'pin_changed', system: 'system'
} as const satisfies Partial<Record<TemplateId, NotifyKind>>

/** Title and body with `<name>` filled (or "Someone" / "someone" when the name is unknown) and the SOS time ("at HH:MM") filled or dropped. Never throws on an unknown id. */
export function renderTemplate(id: string, o: { name?: string | null; time?: string | null } = {}): { title: string; body: string; tone: Tone } {
  const t: Tpl | undefined = Object.hasOwn(TEMPLATES, id) ? TEMPLATES[id as TemplateId] : undefined
  if (!t) return { title: 'Bantay', body: 'Open Bantay to see what is new.', tone: 'normal' }
  const name = o.name?.trim()
  const fill = (s: string) => s
    .replace(/^<name>/, name || 'Someone').replace(/<name>/g, name || 'someone')
    .replace(/ at HH:MM/, o.time ? ` at ${o.time}` : '')
  return { title: fill(t.title), body: fill(t.body), tone: t.tone }
}

export interface Built {
  id: TemplateId | 'fallback'
  tag: string
  cls: Cls
  title: string
  body: string
  data: { tab: Tab }
  /** Show without sound or vibration (set by handlePush in quiet hours). */
  silent?: boolean
}

/** The carer-class missed-dose push (D-78, B-7): {t:'dose_watch'} or {t:'dose_watch', n: count}. n is a COUNT of missed doses (integer 1 to 99), never a name or a medicine.
 *  One tag, so a second alert replaces the first instead of stacking. Sent by the dose-watch function to the people who look after someone, never to that person. */
function doseWatch(payload: object): Built | null {
  const keys = Object.keys(payload).sort().join()
  const n = (payload as { n?: unknown }).n
  if (keys !== 't' && !(keys === 'n,t' && Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 99)) return null
  const many = keys === 'n,t' && (n as number) > 1
  return { id: 'dose_missed', tag: 'dose_watch', cls: 'carer', title: many ? 'Medicines were missed' : 'A medicine was missed', body: many ? `${n} medicines were missed by someone you look after.` : 'A medicine was missed by someone you look after.', data: { tab: 'health' } }
}

export function buildNotification(payload: unknown): Built | null {
  if (typeof payload !== 'object' || payload === null) return null
  const t = (payload as { t?: unknown }).t
  if (t === 'dose_watch') return doseWatch(payload)
  if (Object.keys(payload).length !== 1 || typeof t !== 'string' || !Object.hasOwn(TEMPLATES, t)) return null
  const tpl: Tpl = TEMPLATES[t as TemplateId]
  const r = renderTemplate(t)
  return { id: t as TemplateId, tag: t, cls: tpl.cls, title: r.title, body: r.body, data: { tab: tpl.tab } }
}

/** Shown when a push arrives that is not a known template. Neutral, uncapped, no data. */
export const FALLBACK: Built = { id: 'fallback', tag: 'bantay', cls: 'safety', title: 'Bantay', body: 'Open Bantay to see what is new.', data: { tab: 'today' } }
