import { useCallback } from 'react'
import { track } from '../admin/events'
import { alertRef } from '../location/place'
import { usePlace } from '../location/useLocation'
import { AlertCard } from '../look'
import { ALERTS_KEY, type Alert, affectsUs, checkedOf, freshness, freshText, kmTail, newestChecked, outdatedLine, placeOnly, plainWhat } from '../safety/alerts'
import { useNow } from '../safety/AlertCard'
import { StormBlock } from '../safety/StormCard'
import { liveSignals, signalOf, stormTitle } from '../safety/stormMode'
import { putKv, useKv } from '../safety/store'
import { Icon, type IconName } from '../shell/Icon'
import { quakeRow } from './alertRow'
import { zoneAlert } from './heroCards'
import NofabSos from './NofabSos'
import { ACK_KEY, ackWarning, isAcked, type AckMap } from './warnAck'
import './today.css'

const NONE: Alert[] = []
const NO_ACK: AckMap = {}
const ICON: Record<string, IconName> = { tcws: 'typhoon', quake: 'quake', rainfall: 'flood', thunderstorm: 'storm', heat: 'therm', tsunami: 'flood' }
export const HIDDEN_TOAST = 'Hidden here. Still in Safety.'

/** The warnings that may fill Today's one hazard slot: a closed warning must not hold it (the next one shows), and a live storm signal is drawn by the storm card, so tcws never takes the slot twice. */
export const slotPool = (alerts: Alert[], acks: AckMap, storm: boolean): Alert[] => alerts.filter((a) => !isAcked(acks, a) && !(storm && a.kind === 'tcws'))

/** What Today shows for warnings right now: the hazard and the storm signal, and whether any warning card is on screen (the weather hero goes compact then). */
export function useWarnings(now?: number) {
  const place = usePlace()
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const acks = useKv<AckMap>(ACK_KEY, NO_ACK)
  const ref = place ? alertRef(place) : null
  const storm = liveSignals(alerts, now)[0] ?? null
  const hazard = zoneAlert(slotPool(alerts, acks, !!storm), ref)
  const onScreen = !!hazard || !!storm
  return { alerts, acks, ref, storm, hazard, onScreen }
}

/** Today's red warning card (N-8, N-11, S16 L1): the official warning for the area, or the storm variant with the roll call. Replaces AlertBand and StormCard on Today (they stay for Simple mode and tests).
 *  Close writes kv `warn.ack` (warnAck.ts): the card is hidden on Today only and stays in Safety > Warnings; a newer issue or a higher level shows it again. In a storm the roll-call row stays while a signal is live. */
export default function WarningCard({ notify, now }: { notify?: (msg: string) => void; now?: number }) {
  const { alerts, acks, ref, storm, hazard } = useWarnings(now)
  const clock = useNow()
  const close = useCallback((a: Alert) => {
    void putKv(ACK_KEY, ackWarning(acks, a, alerts)).catch(() => undefined)
    void track('action', 'warn_ack') // C-4 usage kind (name only); dropped until admin/events.ts lists it (needs)
    notify?.(HIDDEN_TOAST)
  }, [acks, alerts, notify])
  const at = hazard ? checkedOf(hazard, alerts) : newestChecked(alerts) // the hazard's own check: a row the feed stopped refreshing must read old here as in Warnings
  const f = freshness(at, clock)
  const red = !!hazard && !isAcked(acks, hazard) && !quakeRow(hazard, affectsUs(hazard, ref), clock) && (hazard.kind === 'quake' || hazard.kind === 'tcws')
  const nofab = red || (!!storm && !isAcked(acks, storm)) // the cards that carry data-nofab hide Jack

  return (
    <>
      {/* above the cards: a storm card is taller than the screen, and Jack is hidden while it shows */}
      {nofab && <NofabSos />}
      {hazard && !isAcked(acks, hazard) && (() => {
        const who = affectsUs(hazard, ref)
        const row = quakeRow(hazard, who, clock)
        if (row) return (
          <section role="region" aria-label="Nearby report" data-testid="warning-card" className="card td-arow" data-tint="amber">
            <span className="td-arow-ic"><Icon name="quake" size={18} /></span>
            <span className="td-grow"><b>{row.title}</b><span>{row.sub}</span>{f.tone !== 'ok' && <span role="status">{outdatedLine(at)}</span>}</span> {/* a stale feed must still say so on a compact row, as the red card does */}
            <a className="btn2 td-arow-go" href="#safety/warnings">Details</a>
          </section>
        )
        return (
          <section role="region" aria-label="Active warning" data-testid="warning-card" data-nofab={hazard.kind === 'quake' || hazard.kind === 'tcws' ? '' : undefined}>
            <AlertCard
              tone="red"
              icon={ICON[hazard.kind] ?? 'warn'}
              title={hazard.title}
              onClose={() => close(hazard)}
              closeLabel="Hide this warning. It stays in Safety."
              action={{ label: who.affects ? 'What to do' : 'See details', href: '#safety/warnings' }}
              body={(
                <>
                  <p className="td-wc-k">{who.affects ? 'Warning' : 'Nearby report'} · {placeOnly(hazard.where)} · {hazard.source}</p>
                  {hazard.kind === 'gdacs' && plainWhat(hazard) && <p>{plainWhat(hazard)}</p>}
                  <p><b>{who.line}</b>{kmTail(who)}</p>
                  {who.steps && <p>{hazard.doNow}</p>}
                  <p className="td-wc-meta">{freshText(f)}{f.tone === 'ok' ? ' · Hide: still in Safety.' : ''}</p>
                  {f.tone !== 'ok' && <p className="td-wc-meta" role="status">{outdatedLine(at)}</p>}
                </>
              )}
            />
          </section>
        )
      })()}
      {storm && (isAcked(acks, storm) ? (
        <StormBlock now={now} compact />
      ) : (
        <section role="region" aria-label="Storm mode" data-testid="warning-card-storm" data-nofab="">
          <AlertCard
            tone="red"
            icon="typhoon"
            title={`Signal No. ${signalOf(storm)} over ${stormWhere(storm)}`}
            onClose={() => close(storm)}
            closeLabel="Hide this warning. It stays in Safety."
            action={{ label: 'What to do', href: '#safety/warnings' }}
            body={(
              <>
                <p className="td-wc-k">{stormTitle(storm)}</p>
                <p>{storm.what}</p>
                <StormBlock now={now} />
              </>
            )}
          />
        </section>
      ))}
    </>
  )
}

/** "Bohol (near Dampas, Tagbilaran City)" -> "Bohol". */
const stormWhere = (a: Pick<Alert, 'where'>) => a.where.split(' (')[0] || a.where
