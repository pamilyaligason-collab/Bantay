import { useNewsZone } from './Screen'
import NewsView from './View'

/** Discover > News (the pill-row page): the chips, lead card and lists (View.tsx). NewsList in Screen.tsx stays as the plain official-advisory list. */
export default function NewsScreen() {
  const zone = useNewsZone()
  return zone === undefined ? null : <NewsView zone={zone} />
}
