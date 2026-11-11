import { alertHash } from '../sharing/alertHash'
import { renderTemplate, TEMPLATES, type TemplateId } from './templates'

/** The System health labels (admin/desk/systemApi.ts JOBS) plus every other scheduled job; a test keeps every JOBS row and every cron job labelled. Not imported from there so Today does not load the admin desk. */
export const JOB_LABELS: Record<string, string> = { 'dose-watch': 'Missed-dose watch', 'alerts-ingest': 'Official alerts feed', 'alerts-digest': 'Daily safety digest', 'records-extract': 'Records reader', 'world-news': 'World news feed', 'lotto-pcso': 'Lotto results feed', 'yt-feed': 'Regional news videos', 'watch-feed': 'Watch shelves feed', 'watch-backfill': 'Watch back catalogue','pagasa-drought': 'PAGASA climate outlook', 'integrity-check': 'Data integrity check', 'da-prices': 'Market prices feed', 'pagasa-warnings': 'PAGASA warnings feed' }

/** What the row says inside the app. The push copy ("Open Bantay to see what happened") is wrong here: the reader is already in Bantay.
 *  A `system` row (heartbeat.ts) holds `<job>:<6h window>` in `ref`, so name the job by its System health label (an unknown job keeps its saved name) and say where an admin looks. The row cannot know whether later runs passed, so it says only that a run failed. Everything else is the push copy. */
export function inAppText(row: { template: string; ref: string | null; personId?: string | null }, o: { name?: string | null } = {}): { title: string; body: string; href: string } {
  const t = renderTemplate(row.template, o)
  const tab = Object.hasOwn(TEMPLATES, row.template) ? TEMPLATES[row.template as TemplateId].tab : 'today'
  if (row.template !== 'system') return { ...t, href: alertHash(row.template, tab, row.personId) }
  const job = /^[a-z0-9_-]{1,64}(?=:)/.exec(row.ref ?? '')?.[0]
  return {
    title: job ? `${JOB_LABELS[job] ?? job} had a failed run` : 'A Bantay job had a failed run',
    body: job ? 'Open System health to see if it is still failing.' : 'No job name was saved. Open System health to see which one.',
    href: '/admin#/system' // straight to the web admin: no old-link redirect, no second page load
  }
}
