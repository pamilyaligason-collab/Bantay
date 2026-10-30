import { supabase } from '../auth/client'
import { UpdateRow, VersionRow } from '../update/UpdateRow'
import Group, { NavRow } from './Group'
import { useAccount } from './useAccount'

/** Settings > About (#me/about): version, update (admin), Family admin tools (admin), "Signed in as". */
export default function AboutGroup() {
  const { member, who } = useAccount()
  const admin = member?.role === 'admin'
  return (
    <Group title="About" testId="settings-about">
      <div className="sh-card sh-list st-list">
        {admin ? <UpdateRow /> : <VersionRow />}
        {admin && <NavRow icon="gear" title="Family admin tools" sub="Admins only" href="#admin" />}
      </div>
      {who && supabase && <p className="sh-sub sh-note">Signed in as {who}</p>}
    </Group>
  )
}
