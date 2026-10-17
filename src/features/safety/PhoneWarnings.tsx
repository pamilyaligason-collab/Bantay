import { putKv, useKv } from './store'
import { NOT_A_SIREN } from './alerts'

export const PW_KEY = 'safety.phoneWarnings'
export const RECHECK_DAYS = 90

export type Platform = 'android' | 'ios' | 'other'
export type Rec = { items: Record<string, { state: 'on' | 'unsure'; at: string }>; checkedAt: string; os?: string | null }
type Item = { id: string; platform: 'android' | 'ios'; title: string; steps: string }

export const ITEMS: Item[] = [
  { id: 'android-eq', platform: 'android', title: 'Android Earthquake Alerts', steps: 'Open Settings, then Safety and emergency, then Earthquake alerts, and turn it on. On some phones it is under Settings, then Location, then Earthquake alerts.' },
  { id: 'android-wea', platform: 'android', title: 'Wireless emergency alerts', steps: 'Open Settings, then Safety and emergency, then Wireless emergency alerts. Turn on every alert type, including extreme, severe and test alerts.' },
  { id: 'ios-gov', platform: 'ios', title: 'Government Alerts', steps: 'Open Settings, then Notifications, then scroll to Government Alerts. Turn on Emergency Alerts and Public Safety Alerts.' }
]

export function detectPlatform(ua: string): Platform {
  if (/android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  return 'other'
}

/** "android 14" / "ios 17", or null when the OS version is unknown. A change means the phone was updated or replaced. */
export function osKey(ua: string): string | null {
  const a = /Android\s+(\d+)/i.exec(ua)
  if (a) return `android ${a[1]}`
  const i = /OS (\d+)[._]\d/i.exec(ua)
  if (i && /iPhone|iPad|iPod/i.test(ua)) return `ios ${i[1]}`
  return null
}

export const itemsFor = (p: Platform) => (p === 'other' ? ITEMS : ITEMS.filter((i) => i.platform === p))

export type Status = { chip: 'All on' | 'Not checked' | `${number} to check`; stale: boolean; why: 'age' | 'os' | null }

export function statusOf(rec: Rec | null, p: Platform, now: number, key: string | null): Status {
  const list = itemsFor(p)
  if (!rec || !rec.checkedAt || Object.keys(rec.items ?? {}).length === 0) return { chip: 'Not checked', stale: false, why: null }
  const t = Date.parse(rec.checkedAt)
  const why = !Number.isFinite(t) || now - t > RECHECK_DAYS * 86400000 ? 'age' : rec.os && key && rec.os !== key ? 'os' : null
  if (why) return { chip: `${list.length} to check`, stale: true, why }
  const open = list.filter((i) => rec.items[i.id]?.state !== 'on').length
  return open === 0 ? { chip: 'All on', stale: false, why: null } : { chip: `${open} to check`, stale: false, why: null }
}

export default function PhoneWarnings({ ua = navigator.userAgent, now = Date.now(), level = 3 }: { ua?: string; now?: number; level?: 2 | 3 }) {
  const H = `h${level}` as 'h2' | 'h3'
  const rec = useKv<Rec | null>(PW_KEY, null)
  const p = detectPlatform(ua)
  const st = statusOf(rec, p, now, osKey(ua))
  const set = (id: string, state: 'on' | 'unsure') => {
    const at = new Date().toISOString()
    // A stale record restarts: old answers no longer count.
    const prev = rec && !st.stale ? rec.items : {}
    return putKv(PW_KEY, { items: { ...prev, [id]: { state, at } }, checkedAt: at, os: osKey(ua) } satisfies Rec)
  }
  return (
    <div className="sf pw">
      <div className="pw-head">
        <H style={{ margin: 0, fontSize: 17, color: 'var(--ink)' }}>Phone warnings check</H>
        <span className={`sf-chip${st.chip === 'All on' ? '' : ' warn'}`}>{st.chip}</span>
      </div>
      <p className="sf-note">{NOT_A_SIREN} Any warning that comes seconds before shaking comes from your phone, not from Bantay. Turn these on so your phone can do that job.</p>
      {st.stale && <p className="sf-note">{st.why === 'os' ? 'Your phone software changed. Check these again.' : 'It has been over 90 days. Check these again.'}</p>}
      {p === 'other' && <p className="sf-empty">We could not tell what phone this is. Steps for both are below.</p>}
      {itemsFor(p).map((it) => {
        const cur = st.stale ? undefined : rec?.items?.[it.id]?.state
        return (
          <div key={it.id} className="pw-item">
            <strong>{it.title}</strong>
            <span className="sub">{it.steps}</span>
            <div className="pw-btns">
              <button type="button" className="btn2" aria-pressed={cur === 'on'} onClick={() => set(it.id, 'on')}>Done on this phone</button>
              <button type="button" className="btn2" aria-pressed={cur === 'unsure'} onClick={() => set(it.id, 'unsure')}>Not sure</button>
            </div>
          </div>
        )
      })}
      <p className="sub" style={{ margin: 0, fontSize: 14 }}>Bantay cannot read your phone settings, so this list is what you tell us. Test messages come from the government, and Bantay cannot send one. If your phone gets one, that tells you the setting works.</p>
    </div>
  )
}
