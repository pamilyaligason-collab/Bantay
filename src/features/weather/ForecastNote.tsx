/** D-163: "Forecast for <place>" and the Open-Meteo credit, one wording for Today, Safety and the Weather screen. `place` is the plain name (placeNameOf), never coordinates. */
export const OPEN_METEO_CREDIT = 'Weather data by Open-Meteo.com'
export const forecastFor = (place: string) => `Forecast for ${place}`

export function ForecastNote({ place, className, link = false }: { place: string; className?: string; link?: boolean }) {
  return (
    <span className={className} data-testid="forecast-note">
      {forecastFor(place)} · {link ? <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">{OPEN_METEO_CREDIT}</a> : OPEN_METEO_CREDIT}
    </span>
  )
}
