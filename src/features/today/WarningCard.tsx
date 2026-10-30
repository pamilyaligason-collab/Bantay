import { useCallback } from 'react'
import { alertRef } from '../location/place'
import { usePlace } from '../location/useLocation'
import { AlertCard } from '../look'
import { ALERTS_KEY, type Alert, affectsUs, freshness, freshText, newestChecked, outdatedLine, plainWhat } from '../safety/alerts'
import { useNow } from '../safety/AlertCard'
import { StormBlock } from '../safety/StormCard'
import { liveSignals, signalOf, stormTitle } from '../safety/stormMode'
import { putKv, useKv } from '../safety/store'
import type { IconName } from '../shell/Icon'
import { zoneAlert } from './heroCards'
import { ACK_KEY, ackWarning, isAcked, type AckMap } from './warnAck'
import './today.css'

const NONE: Alert[] = []
const NO_ACK: AckMap = {}
const ICON: Record<string, IconName> = { tcws: 'typhoon', quake: 'quake', rainfall: 'flood', thunderstorm: 'storm', heat: 'therm', tsunami: 'flood' }
export const HIDDEN_TOAST = 'Hidden here. Still in Safety.'

/** What Today shows for warnings right now: the hazard and the storm signal, and whether any warning card is on screen (the weather hero goes compact then). */
export function useWarnings(now?: number) {
  const place = usePlace()
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const acks = useKv<AckMap>(ACK_KEY, NO_ACK)
  const ref = place ? alertRef(place) : null
  const storm = liveSignals(alerts, now)[0] ?? null
  const zone = zoneAlert(alerts, ref)
  const hazard = zone && !(storm && zone.kind === 'tcws') ? zone : null // a storm signal is shown by the storm variant, never twice
  const onScreen = (!!hazard && !isAcked(acks, hazard)) || !!storm
  return { alerts, acks, ref, storm, hazard, onScreen }
}

/** Today's red warning card (N-8, N-11, S16 L1): the official warning for the area, or the storm variant with the roll call. Replaces AlertBand and StormCard on Today (they stay for Simple mode and tests).
 *  Close writes kv `warn.ack` (warnAck.ts): the card is hidden on Today only and stays in Safety > Warnings; a newer issue or a higher level shows it again. In a storm the roll-call row stays while a signal is live. */
export default function WarningCard({ notify, now }: { notify?: (msg: string) => void; now?: number }) {
  const { alerts, acks, ref, storm, hazard } = useWarnings(now)
  const clock = useNow()
  const close = useCallback((a: Alert) => {
    void putKv(ACK_KEY, ackWarning(acks, a, alerts)).catch(() => undefined)
    notify?.(HIDDEN_TOAST)
  }, [acks, alerts, notify])
  const f = freshness(newestChecked(alerts), clock)

  return (
    <>
      {hazard && !isAcked(acks, hazard) && (() => {
        const who = affectsUs(hazard, ref)
        return (
          <section role="region" aria-label="Active warning" data-testid="warning-card">
            <AlertCard
              tone="red"
              icon={ICON[hazard.kind] ?? 'warn'}
              title={hazard.title}
              onClose={() => close(hazard)}
              closeLabel="Hide this warning. It stays in Safety."
              action={{ label: who.affects ? 'What to do' : 'See details', href: '#safety/warnings' }}
              body={(
                <>
                  <p className="td-wc-k">{who.affects ? 'Warning' : 'Nearby report'} · {hazard.where} · {hazard.source}</p>
                  {hazard.kind === 'gdacs' && plainWhat(hazard) && <p>{plainWhat(hazard)}</p>}
                  <p><b>{who.line}</b>{who.km != null && ` (${who.km} km away)`}</p>
                  {who.steps && <p>{hazard.doNow}</p>}
                  <p className="td-wc-meta">{freshText(f)}{f.tone === 'ok' ? ' · Hide: still in Safety.' : ''}</p>
                  {f.tone !== 'ok' && <p className="td-wc-meta" role="status">{outdatedLine(newestChecked(alerts))}</p>}
                </>
              )}
            />
          </section>
        )
      })()}
      {storm && (isAcked(acks, storm) ? (
        <section className="card td-rc" aria-label="Storm check-in" data-testid="storm-rollcall">
          <h2 className="td-rc-h">Is everyone safe?</h2>
          <StormBlock now={now} compact />
        </section>
      ) : (
        <section role="region" aria-label="Storm mode" data-testid="warning-card-storm">
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
