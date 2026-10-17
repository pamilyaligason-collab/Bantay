// B-7: notifications never carry health values. Every notification is one of these fixed templates,
// picked by id. There is no free-text path: buildNotification rejects any payload but exactly {t: id}.
export type Cls = 'safety' | 'health'
export type Tab = 'today' | 'health' | 'records' | 'family' | 'safety'
type Tpl = { cls: Cls; title: string; body: string; tab: Tab }

export const TEMPLATES = {
  storm_warning: { cls: 'safety', title: 'Storm warning near you', body: 'Open Bantay to see what to do.', tab: 'safety' },
  flood_watch: { cls: 'safety', title: 'Flooding possible near you', body: 'Open Bantay to see what to do.', tab: 'safety' },
  heat_alert: { cls: 'safety', title: 'Dangerous heat today', body: 'Open Bantay for ways to stay safe.', tab: 'safety' },
  family_sos: { cls: 'safety', title: 'Someone in your family needs help', body: 'Open Bantay now.', tab: 'family' },
  dose_due: { cls: 'health', title: 'Medicine time', body: 'Open Bantay to log it.', tab: 'health' },
  dose_missed: { cls: 'health', title: 'A medicine was missed', body: 'Open Bantay to catch up.', tab: 'health' },
  bp_check: { cls: 'health', title: 'Time for a check', body: 'Open Bantay to add a reading.', tab: 'health' }
} as const satisfies Record<string, Tpl>

export type TemplateId = keyof typeof TEMPLATES
const ids = Object.keys(TEMPLATES) as TemplateId[]
export const HEALTH_IDS = ids.filter((i) => TEMPLATES[i].cls === 'health')
export const SAFETY_IDS = ids.filter((i) => TEMPLATES[i].cls === 'safety')

export interface Built {
  id: TemplateId | 'fallback'
  tag: string
  cls: Cls
  title: string
  body: string
  data: { tab: Tab }
}

export function buildNotification(payload: unknown): Built | null {
  if (typeof payload !== 'object' || payload === null) return null
  const t = (payload as { t?: unknown }).t
  if (Object.keys(payload).length !== 1 || typeof t !== 'string' || !Object.hasOwn(TEMPLATES, t)) return null
  const tpl: Tpl = TEMPLATES[t as TemplateId]
  return { id: t as TemplateId, tag: t, cls: tpl.cls, title: tpl.title, body: tpl.body, data: { tab: tpl.tab } }
}

/** Shown when a push arrives that is not a known template. Neutral, uncapped, no data. */
export const FALLBACK: Built = { id: 'fallback', tag: 'bantay', cls: 'safety', title: 'Bantay', body: 'Open Bantay to see what is new.', data: { tab: 'today' } }
