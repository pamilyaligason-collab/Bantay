/** Where a tap on a family alert lands (D-109). share_added ("Someone new can see your records") opens my own list; share_added_carer, sent to the writer carers of a person with no login, opens that person's list; every other template opens its tab.
 *  A push tap carries only the template, so it lands on Today (tab "today"); that person's list then opens from the alert in the bell. */
export const alertHash = (template: string | null | undefined, tab: string, personId?: string | null): string =>
  template === 'share_added' ? '#sharing' : template === 'share_added_carer' && personId ? `#sharing/${encodeURIComponent(personId)}` : `#${tab}`
