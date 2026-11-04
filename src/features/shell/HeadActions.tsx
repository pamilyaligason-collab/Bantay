import { useContext, useEffect, useState, type ReactNode } from 'react'
import { loadFamily } from '../auth/family'
import { getMember } from '../auth/session'
import { useOwnAvatar } from '../setup/useProfile'
import { SyncStatus } from '../sync/SyncStatus'
import { UnreadContext } from '../today/unread'
import { Icon } from './Icon'
import { firstName } from './names'
import './shell.css'

/** Right side of every tab root's LargeTitle: the screen's own control (children), the sync pill, the bell (opens the inbox) and the avatar (opens Me, where Admin lives). */
export function HeadActions({ children }: { children?: ReactNode }) {
  const unread = useContext(UnreadContext)
  const photo = useOwnAvatar()
  const [name, setName] = useState('')
  useEffect(() => {
    let live = true
    void getMember().then((m) => { const n = m?.personId ? loadFamily().find((f) => f.personId === m.personId)?.displayName : ''; if (live && n) setName(n) })
    return () => { live = false }
  }, [])
  return (
    <div className="lt-actions-set">
      {children}
      <SyncStatus />
      <a className="ha-bell" href="#notif" aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'} data-testid="head-bell"><Icon name="bell" size={22} />{unread > 0 && <span className="ha-dot" />}</a>
      <a className="ha-me" href="#me" aria-label="You and settings" data-testid="head-me">{photo ? <img src={photo} alt="" /> : (firstName(name).charAt(0) || <Icon name="users" size={20} />)}</a>
    </div>
  )
}
