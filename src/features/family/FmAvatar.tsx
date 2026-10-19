import { useEffect, useState } from 'react'
import { initialsOf } from '../auth/family'
import { signedAvatar } from '../sync/profile'

// Token tints (they follow light and dark); the initials use --ink on each.
const TINTS = ['var(--soft)', 'var(--card2)', 'var(--warn-bg)', 'var(--red-soft)', 'var(--fill)', 'var(--band)']
const tint = (s: string) => TINTS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length]!

/** Round photo (signed link from the avatars bucket, the sign-in thumbnail while it loads) or the initials. `status` adds the roll-call dot. */
export default function FmAvatar({ name, photoPath, thumb, size = 44, status }: { name: string; photoPath?: string | null; thumb?: string | null; size?: number; status?: 'ok' | 'none' }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (photoPath) void signedAvatar(photoPath).then((u) => { if (live) setUrl(u) })
    return () => { live = false }
  }, [photoPath])
  const src = url ?? thumb ?? null
  return (
    <span className="fm-av" style={{ width: size, height: size, fontSize: size * 0.38, background: tint(name) }} aria-hidden="true">
      {src ? <img src={src} alt="" onError={() => setUrl(null)} /> : initialsOf(name)}
      {status && <i className={`fm-st ${status}`} />}
    </span>
  )
}
