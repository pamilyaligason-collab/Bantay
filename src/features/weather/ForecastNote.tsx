/** D-163: "Forecast for <place>" and the data credit, one wording for Today, Safety and the Weather screen. `place` is the plain name (placeNameOf), never coordinates. */
export const OPEN_METEO_CREDIT = 'Weather data by Open-Meteo.com'
export const forecastFor = (place: string) => `Forecast for ${place}`

const NAMES: Record<string, string> = { 'open-meteo': 'Open-Meteo.com', 'met-norway': 'MET Norway', openweather: 'OpenWeather' }
/** The providers that answered, only when the forecast on screen is the blend (else undefined: Open-Meteo alone). */
export const creditIds = (b: { blended: boolean; sources: { id: string; ok: boolean }[] }): string[] | undefined => (b.blended ? b.sources.filter((s) => s.ok).map((s) => s.id) : undefined)
/** The credit follows the data: unblended = Open-Meteo; blended = each provider that answered. */
export const creditText = (sources?: string[]) => {
  const names = sources?.map((id) => NAMES[id]).filter(Boolean)
  return names?.length ? `Weather data by ${names.join(', ')}` : OPEN_METEO_CREDIT
}

export function ForecastNote({ place, className, link = false, sources }: { place?: string; className?: string; link?: boolean; sources?: string[] }) {
  const credit = creditText(sources)
  return (
    <span className={className} data-testid="forecast-note">
      {place ? `${forecastFor(place)} · ` : ''}{link && credit === OPEN_METEO_CREDIT ? <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">{credit}</a> : credit}
    </span>
  )
}
