import Sheet from '../family/Sheet'
import type { FeedCategory } from '../sharing/api'

// Wording of D-127 section 3 (agreement text version 'feed-2026-11', stored by the server). No em-dashes.
export const FEED_LABEL: Record<FeedCategory, string> = { bp: 'Blood pressure', lab: 'Lab results', photo: 'Photos', status: 'Check-ins' }
const NOUN: Record<FeedCategory, string> = { bp: 'blood pressure', lab: 'lab results', photo: 'photos', status: 'check-ins' }
// [what the person does themself, what is done for a person with no login]
const WHAT: Record<FeedCategory, [string, (n: string) => string]> = {
  bp: ['Every blood pressure reading you save will show in the family feed, with the number and whether it is high.', (n) => `Every blood pressure reading saved for ${n} will show in the family feed, with the number and whether it is high.`],
  lab: ['Every lab result you confirm will show in the family feed, with its name, the number and whether it is high or low.', (n) => `Every lab result confirmed for ${n} will show in the family feed, with its name, the number and whether it is high or low.`],
  photo: ['Every photo you add to the family photos will show in the family feed, with its caption.', (n) => `Every photo added for ${n} will show in the family feed, with its caption.`],
  status: ['Every check-in you make will show in the family feed as a short "I\'m OK".', (n) => `Every check-in made for ${n} will show in the family feed as a short "I'm OK".`]
}

/** name is set only when the owner switches a category on for a person with no login. */
export const feedSheetTitle = (c: FeedCategory, name?: string) => `Share ${name ? `${name}'s` : 'my'} ${NOUN[c]} with the family?`
export const feedSheetBody = (c: FeedCategory, name?: string) =>
  `${name ? WHAT[c][1](name) : WHAT[c][0]} Everyone in the family sees it, not only the people who can see ${name ? 'their' : 'your'} records. You can turn it off any time; older posts leave their phones at the next sync.`

/** Opens when a switch is turned ON. Turning off needs no sheet. */
export default function FeedShareSheet({ category, name, busy, onShare, onClose }: { category: FeedCategory; name?: string; busy: boolean; onShare: () => void; onClose: () => void }) {
  return (
    <Sheet title={feedSheetTitle(category, name)} onClose={onClose}>
      <p className="sh-sub" data-testid="feed-sheet-body">{feedSheetBody(category, name)}</p>
      <button type="button" className="sh-pill sh-primary sh-block" disabled={busy} onClick={onShare}>Share</button>
      <button type="button" className="sh-pill sh-ghost sh-block" disabled={busy} onClick={onClose}>Not now</button>
    </Sheet>
  )
}
