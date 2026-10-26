import { useEffect, useState } from 'react'
import { supabase } from '../auth/client'

const POLL_MS = 15_000

/** How many family members have opened this SOS (rows in sos_acks): Realtime when it works, a 15 s poll as the safety net. 0 when offline or signed out. */
export function useAcks(eventId: string | null): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const sb = supabase
    if (!sb || !eventId) return
    let live = true
    const read = async () => {
      try {
        const { data } = await sb.from('sos_acks').select('user_id').eq('event_id', eventId)
        if (live && Array.isArray(data)) setN(data.length)
      } catch { /* offline: keep the last count */ }
    }
    void read()
    const timer = setInterval(() => void read(), POLL_MS)
    const ch = sb.channel(`sos-acks-${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_acks', filter: `event_id=eq.${eventId}` }, () => void read())
      .subscribe()
    return () => { live = false; clearInterval(timer); void sb.removeChannel(ch) }
  }, [eventId])
  return n
}
