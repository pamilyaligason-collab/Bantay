import { renderTemplate, TEMPLATES, type TemplateId } from './templates'

/** What the row says inside the app. The push copy ("Open Bantay to see what happened") is wrong here: the reader is already in Bantay.
 *  A `system` row (heartbeat.ts) holds `<job>:<6h window>` in `ref`, so name the job (the raw job name is fine: only admins get this row) and say where an admin looks. Everything else is the push copy. */
export function inAppText(row: { template: string; ref: string | null }, o: { name?: string | null } = {}): { title: string; body: string; href: string } {
  const t = renderTemplate(row.template, o)
  const tab = Object.hasOwn(TEMPLATES, row.template) ? TEMPLATES[row.template as TemplateId].tab : 'today'
  if (row.template !== 'system') return { ...t, href: `#${tab}` }
  const job = /^[a-z0-9_-]{1,64}(?=:)/.exec(row.ref ?? '')?.[0]
  return {
    title: job ? `The ${job} job failed` : 'A Bantay job failed',
    body: job ? 'Its last run failed. Open System health to see when.' : 'No job name was saved. Open System health to see which one.',
    href: '/admin#/system' // straight to the web admin: no old-link redirect, no second page load
  }
}
