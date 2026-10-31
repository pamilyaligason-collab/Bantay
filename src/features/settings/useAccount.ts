import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { hasPasskeyFlag, loadFamily } from '../auth/family'
import { getMember, type Member } from '../auth/session'
import { loadCarerOf } from '../family/reportData'
import { useFamilyPeople } from '../family/roster'
import { useOwnAvatar } from '../setup/useProfile'

/** The signed-in person's account facts that the Settings screens share: member row, display name, fingerprint flag, who they care for. Always the admin's own account, never the acting person (C-9). */
export function useAccount() {
  const [member, setMember] = useState<Member | null>(null)
  const [who, setWho] = useState('')
  const [passkey, setPasskey] = useState(false)
  const [carerOf, setCarerOf] = useState<string[]>([])
  const photo = useOwnAvatar()
  const { people: roster } = useFamilyPeople()
  useEffect(() => {
    let live = true
    void getMember().then(async (m) => {
      if (!live || !m) return
      setMember(m)
      void loadCarerOf(supabase, m.userId).then((ids) => { if (live) setCarerOf(ids) })
      if (!m.personId) return
      if (hasPasskeyFlag(m.personId)) setPasskey(true)
      const row = await supabase?.from('people').select('display_name').eq('id', m.personId).maybeSingle()
      if (live) setWho(row?.data?.display_name ?? loadFamily().find((f) => f.personId === m.personId)?.displayName ?? '')
    })
    return () => { live = false }
  }, [])
  return { member, who, passkey, setPasskey, carerOf, photo, roster }
}
