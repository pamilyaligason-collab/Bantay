import { pickLocalSet } from '../location/geo'
import { usePlace } from '../location/useLocation'
import { Icon } from '../shell/Icon'
import { ABROAD_SOURCE } from './dial'

/** 911 only works in the Philippines and Texas. Elsewhere abroad, point at the official list rather than a number we would have to guess. */
export function useAbroad(): boolean {
  const place = usePlace()
  return !!place && pickLocalSet(place.weather).where === 'abroad'
}

/** The red emergency-number button used on the first-aid pages. */
export function Call911({ className = 'btn fa-call' }: { className?: string }) {
  const abroad = useAbroad()
  return abroad
    ? <a href={ABROAD_SOURCE.url} target="_blank" rel="noopener noreferrer" className={className}><Icon name="phone" size={22} />Local emergency number</a>
    : <a href="tel:911" className={className}><Icon name="phone" size={22} />Call 911</a>
}
