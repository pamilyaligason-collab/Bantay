import { useState } from 'react'
import { FLAGS } from '../safety/flags'
import { putKv, useKv } from '../safety/store'
import { GroupedList, LargeTitle, Row, Section, Sheet } from '../look'
import { ALERT_KEY, readPrefs, URGENT_TEXT, type AlertPrefs } from './prefs'
import { Switch } from './Switch'
import './alerts.css'

type BoolKey = 'nearFamily' | 'phWide' | 'worldDigest' | 'macro' | 'quiet' | 'push' | 'sms'

/** World alerts settings. Saved on this phone only; nothing here sends anything yet. */
export default function AlertSettings() {
  const prefs = readPrefs(useKv<unknown>(ALERT_KEY, undefined))
  const [ask, setAsk] = useState(false)
  const set = (patch: Partial<AlertPrefs>) => void putKv(ALERT_KEY, { ...prefs, ...patch })
  const sw = (key: BoolKey, title: string, sub?: string) => (
    <Row title={title} sub={sub} control={<Switch on={prefs[key]} label={title} onChange={(on) => (key === 'nearFamily' && !on ? setAsk(true) : set({ [key]: on }))} />} />
  )
  return (
    <>
      <LargeTitle title="World alerts" back={{ href: '#safety/world', label: 'World' }} />
      <p className="wal-note">Saved on this phone. Push delivery arrives with lane A.</p>
      <Section title="Instant">
        <GroupedList label="Instant alerts">
          {sw('nearFamily', 'Hazards near family', 'Dampas and Conel')}
          {sw('phWide', 'Philippines-wide warnings', 'PAGASA and PHIVOLCS')}
        </GroupedList>
        <p className="wal-note">{URGENT_TEXT}</p>
      </Section>
      <Section title="Daily digest">
        <GroupedList label="Daily digest">
          {sw('worldDigest', 'World digest', 'Big events from GDACS')}
          {sw('macro', 'Macro and news')}
          <Row title="Send at" control={<input className="wal-time" type="time" aria-label="Digest time" value={prefs.digestTime} onChange={(e) => e.target.value && set({ digestTime: e.target.value })} />} />
        </GroupedList>
      </Section>
      <Section title="Quiet hours">
        <GroupedList label="Quiet hours">{sw('quiet', 'Quiet hours', 'Only urgent alerts at night')}</GroupedList>
      </Section>
      <Section title="Channels">
        <GroupedList label="Channels">
          {sw('push', 'Push notifications')}
          {FLAGS.smsFallback && sw('sms', 'SMS fallback')}
        </GroupedList>
        <p className="wal-foot">For the worst events, your phone also gets a cell broadcast from the carrier. Bantay does not control it.</p>
      </Section>
      {ask && (
        <Sheet title="Turn off alerts near family?" onClose={() => setAsk(false)}>
          <div className="wal-confirm">
            <p>You will not hear about hazards near Dampas or Conel.</p>
            <div className="wal-btns">
              <button type="button" className="btn2" onClick={() => setAsk(false)}>Keep on</button>
              <button type="button" className="btn" onClick={() => { set({ nearFamily: false }); setAsk(false) }}>Turn off</button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}
