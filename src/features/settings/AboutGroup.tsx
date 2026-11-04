import { supabase } from '../auth/client'
import { FLAGS } from '../safety/flags'
import PacksSettings from '../safety/PacksSettings'
import { UpdateRow, VersionRow } from '../update/UpdateRow'
import Group from './Group'
import { useAccount } from './useAccount'

/** Settings > About (#me/about): version, update (admin), "Signed in as". */
export default function AboutGroup() {
  const { member, who } = useAccount()
  const admin = member?.role === 'admin'
  return (
    <Group title="About" testId="settings-about">
      <div className="sh-card sh-list st-list">
        {admin ? <UpdateRow /> : <VersionRow />}
      </div>
      {FLAGS.localPacks && <PacksSettings />}
      {who && supabase && <p className="sh-sub sh-note">Signed in as {who}</p>}
    </Group>
  )
}
