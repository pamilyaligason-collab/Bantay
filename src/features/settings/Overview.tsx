import { useState } from 'react'
import { SubHeader } from '../shell/SubHeader'
import { isTextSize, TEXT_SIZE_KEY, TEXT_SIZES, type TextSize } from '../shell/textSize'
import { THEME_KEY, type ThemePref } from '../shell/theme'
import { useKv } from '../shell/useKv'
import { ConsentNotice } from '../privacy/ConsentNotice'
import DetailsSheet from '../setup/DetailsSheet'
import ViewAsRow from '../viewas/ViewAsRow'
import { useActing } from '../viewas/viewAs'
import LabsGroup from './LabsGroup'
import { THEMES } from './DisplayGroup'
import HomePlaceRow from './HomePlaceRow'
import { sosNames } from './FamilyGroup'
import { supabase } from '../auth/client'
import { Lock, NavRow, Switch } from './Group'
import { properName } from '../health/medName'
import { useAccount } from './useAccount'
import './settings.css'

const label = <T extends string>(list: { id: T; label: string }[], id: T) => list.find((x) => x.id === id)?.label ?? ''

/** Settings overview (#me), as the Settings board: account card 72 px, Simple mode row, then one grouped list of 56 px rows (32 px tint chip, 17 px title, one-line value). While acting the rows that write for a person show "View only"; signed out hides the rows that need an account (Family and sharing, Sign-in). */
export default function Overview() {
  const { acting } = useActing()
  const { member, who, passkey, photo, loaded } = useAccount()
  const out = loaded && !member && !supabase // signed out (the Settings board's signed-out state): no family rows, only a copy with no sign-in configured; a failed session read never looks signed out
  const noAccount = loaded && !member // signed out on a copy with sign-in set up too: the two rows below need an account
  const [simple, setSimple] = useKv<boolean>('mode.simple', false)
  const [quiet] = useKv<boolean>('quiet.on', true)
  const [theme] = useKv<ThemePref>(THEME_KEY, 'system')
  const [textSize] = useKv<TextSize>(TEXT_SIZE_KEY, 'normal')
  const [sosRaw] = useKv<unknown>('sos.contacts', [])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const names = sosNames(sosRaw)
  return (
    <div className="sh sh-me st-overview" data-testid="settings-overview">
      <SubHeader title="Settings" backHref="#today" backLabel="Back to Today" />
      {!acting && <ConsentNotice />}

      <div className="sh-card sh-row st-account">
        <span className="sh-av">{out ? '?' : photo ? <img src={photo} alt="" /> : (who || '?').charAt(0).toUpperCase()}</span>
        <div className="sh-grow">
          <b>{out ? 'Not signed in' : who ? properName(who) : 'You'}</b>
          <div className="sh-sub">{out ? 'Sign-in is not set up on this copy' : member?.role === 'admin' ? 'Admin' : `This phone · fingerprint ${passkey ? 'on' : 'off'}`}</div>
        </div>
                {member?.personId && (acting
          ? <button type="button" className="sh-edit st-edit-off" disabled aria-label="Edit name and photo, view only"><Lock /></button>
          : <button type="button" className="sh-edit" onClick={() => setDetailsOpen(true)} aria-haspopup="dialog" aria-label="Edit name and photo">Edit</button>)}
      </div>

      <div className="sh-card st-simple">
        <div className="sh-grow"><b>Simple mode</b><div className="sh-sub">Big buttons for the main things</div></div>
        <Switch label="Simple mode" on={simple} onChange={setSimple} />
      </div>

      <div className="sh-card sh-list st-list" data-testid="settings-list">
        {!out && member?.role === 'admin' && <NavRow icon="gear" title="Family admin tools" sub="Admins only" href="#admin" />}
        {!out && member?.role === 'admin' && <NavRow icon="users" tint="amber" title="Admin dashboard" sub="Add, edit or remove members" href="/admin#/members" testId="admin-dashboard-row" />}
        {!out && <ViewAsRow />}
        <NavRow icon="bell" tint="red" title="Alerts and reminders" sub={quiet ? 'Quiet hours on · 10 PM to 6 AM' : 'Quiet hours off'} href="#me/alerts" />
        <NavRow icon="screen" tint="blue" title="Display" sub={`${label(TEXT_SIZES, isTextSize(textSize) ? textSize : 'normal')} text · ${label(THEMES, theme)}`} href="#me/display" />
        <HomePlaceRow />
        {!noAccount && <NavRow icon="users" tint="amber" title="Family and sharing" sub={names ? `SOS text to ${names}` : 'Records, SOS text, Medical ID'} href="#me/family" locked={acting} />}
        <NavRow icon="phone" tint="teal" title="Phone" sub="Health Connect and setup list" href="#me/phone" />
        <NavRow icon="shield" tint="purple" title="Privacy" sub="Agreement, AI, my data" href="#privacy" locked={acting} />
        {!noAccount && <NavRow icon="fp" title="Sign-in" sub={`Fingerprint ${passkey ? 'on' : 'off'}`} href="#me/signin" locked={acting} />}
        <NavRow icon="info" tint="none" title="About" sub="Version and updates" href="#me/about" />
      </div>
      {member?.role === 'admin' && <LabsGroup />}
      {noAccount && <p className="sh-sub sh-note">Family and sign-in rows show after you sign in.</p>}

      {detailsOpen && member?.personId && <DetailsSheet personId={member.personId} name={who} onClose={() => setDetailsOpen(false)} />}
    </div>
  )
}
