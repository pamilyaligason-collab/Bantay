import { useState } from 'react'
import { SubHeader } from '../shell/SubHeader'
import { isTextSize, TEXT_SIZE_KEY, TEXT_SIZES, type TextSize } from '../shell/textSize'
import { THEME_KEY, type ThemePref } from '../shell/theme'
import { useKv } from '../shell/useKv'
import { isLang, LANG_KEY, LANGS, type Lang } from '../../lib/i18n'
import { ConsentNotice } from '../privacy/ConsentNotice'
import DetailsSheet from '../setup/DetailsSheet'
import ViewAsRow from '../viewas/ViewAsRow'
import { useActing } from '../viewas/viewAs'
import { THEMES } from './DisplayGroup'
import { sosNames } from './FamilyGroup'
import { NavRow, Switch } from './Group'
import { useAccount } from './useAccount'
import './settings.css'

const label = <T extends string>(list: { id: T; label: string }[], id: T) => list.find((x) => x.id === id)?.label ?? ''

/** Settings overview (#me): account row 72 px, Simple mode row 56 px, then View as (admins) and the group rows at 64 px, each with a one-line value. While acting the rows that write for a person show "View only". */
export default function Overview() {
  const { acting } = useActing()
  const { member, who, passkey, photo } = useAccount()
  const [simple, setSimple] = useKv<boolean>('mode.simple', false)
  const [quiet] = useKv<boolean>('quiet.on', true)
  const [theme] = useKv<ThemePref>(THEME_KEY, 'system')
  const [textSize] = useKv<TextSize>(TEXT_SIZE_KEY, 'normal')
  const [lang] = useKv<Lang>(LANG_KEY, 'en')
  const [sosRaw] = useKv<unknown>('sos.contacts', [])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const names = sosNames(sosRaw)
  return (
    <div className="sh sh-me st-overview" data-testid="settings-overview">
      <SubHeader title="Settings" backHref="#today" backLabel="Back to Today" />
      {!acting && <ConsentNotice />}

      <div className="sh-card sh-row st-account">
        <span className="sh-av">{photo ? <img src={photo} alt="" /> : (who || '?').charAt(0).toUpperCase()}</span>
        <div className="sh-grow">
          <b>{who || 'You'}</b>
          <div className="sh-sub">{member?.role === 'admin' ? 'Admin' : `This phone · fingerprint ${passkey ? 'on' : 'off'}`}</div>
        </div>
        {member?.personId && <button type="button" className="sh-edit" disabled={acting} onClick={() => setDetailsOpen(true)} aria-haspopup="dialog" aria-label="Edit name and photo">Edit</button>}
      </div>

      <div className="sh-card st-simple">
        <div className="sh-grow"><b>Simple mode</b><div className="sh-sub">Big buttons for the main things</div></div>
        <Switch label="Simple mode" on={simple} onChange={setSimple} />
      </div>

      <div className="sh-card sh-list st-list">
        <ViewAsRow />
        <NavRow icon="bell" title="Alerts and reminders" sub={quiet ? 'Quiet hours on · 10 PM to 6 AM' : 'Quiet hours off'} href="#me/alerts" />
        <NavRow icon="screen" title="Display" sub={`Text ${label(TEXT_SIZES, isTextSize(textSize) ? textSize : 'normal')} · Theme ${label(THEMES, theme)} · ${label(LANGS, isLang(lang) ? lang : 'en')}`} href="#me/display" />
        <NavRow icon="users" title="Family and sharing" sub={names ? `SOS text to ${names}` : 'Records, SOS text, Medical ID'} href="#me/family" locked={acting} />
        <NavRow icon="phone" title="Phone" sub="Health Connect, setup list, family phones" href="#me/phone" />
        <NavRow icon="shield" title="Privacy" sub="Agreement, AI, my data" href="#privacy" locked={acting} />
        <NavRow icon="fp" title="Sign-in" sub={`Fingerprint ${passkey ? 'on' : 'off'}`} href="#me/signin" locked={acting} />
        <NavRow icon="info" title="About" sub="Version, updates, admin tools" href="#me/about" />
      </div>

      {detailsOpen && member?.personId && <DetailsSheet personId={member.personId} name={who} onClose={() => setDetailsOpen(false)} />}
    </div>
  )
}
