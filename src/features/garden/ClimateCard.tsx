import { Section } from '../look'
import { Icon } from '../shell/Icon'
import { useClimate } from './climate'
import { chipMonths, isStale, levelLabel, manilaYm, OUTLOOK_URL, outlookSentence, shortMonth, useDrought, type Drought } from './drought'
import './climate-card.css'

export const CLIMATE_NONE = 'Climate outlook not available yet.'
const issuedOn = (iso: string) => `${Number(iso.slice(8, 10))} ${shortMonth(iso.slice(0, 7))}` // "3 Nov": the issue day is already the Manila day

/** PAGASA's drought outlook for one province: month chips, one sentence, a link. Climate only, never weather. `d` null (or too old) = the "not available yet" card. */
export function ClimateView({ province, d, nowYm = manilaYm() }: { province: string | null; d: Drought | null; nowYm?: string }) {
  const ok = d && !isStale(d.issued_at)
  const chips = ok ? chipMonths(d.months, nowYm) : []
  const first = chips.find((m) => m.kind === 'outlook')
  const found = chips.find((m) => m.kind === 'assessment')
  const now = found && found.level !== first?.level ? found : undefined // equal to the first month: "Now" would only repeat it
  return (
    <Section title="Climate outlook" testId="today-climate">
      <div className="card clm" data-testid="climate-card">
        {ok && chips.length > 0 ? (
          <>
            <p className="clm-sub">{province} · PAGASA, {issuedOn(d.issued_at)}{d.saved ? ' (saved copy)' : ''}</p>
            {now && <div className="clm-chip" data-level={now.level} data-now><b>{shortMonth(now.month)} (latest)</b><span>{levelLabel(now.level)}</span></div>}
            <ul className="clm-chips" aria-label="Month by month">
              {chips.filter((m) => m.kind === 'outlook').map((m) => (
                <li key={m.month} className="clm-chip" data-level={m.level}>
                  <b>{shortMonth(m.month)}</b>
                  <span>{levelLabel(m.level)}</span>
                </li>
              ))}
            </ul>
            <p className="clm-line">{outlookSentence(d.months, nowYm)}</p>
          </>
        ) : (
          <p className="clm-line">{CLIMATE_NONE}</p>
        )}
        <a className="clm-link" href={OUTLOOK_URL} target="_blank" rel="noopener noreferrer">PAGASA Drought Monitor<Icon name="out" size={18} /><span className="clm-vh"> (opens in browser)</span></a>
      </div>
    </Section>
  )
}

/** S29: on Today, directly above Plant this month (one group). Waits for the place before it shows, so it never flashes the empty card first. */
export default function ClimateCard() {
  const c = useClimate()
  const d = useDrought(c.ready ? c.province : null)
  if (!c.ready || (c.province && d === undefined)) return null
  return <ClimateView province={c.province} d={d ?? null} />
}
