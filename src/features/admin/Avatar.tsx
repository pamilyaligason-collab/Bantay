import { useEffect, useState } from 'react'
import { initialsOf } from '../auth/family'
import { downloadAvatar } from './api'

const TINTS = ['#E8D3A8', '#CFE0CF', '#D6DDEB', '#F1D4CC', '#E3DCF0', '#DCE5D8']
const tint = (s: string) => TINTS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length]!

/** Round photo from the avatars bucket, or the initials on a soft colour. `rev` bumps after a new upload. */
export default function Avatar({ name, photoPath, size = 44, rev = 0 }: { name: string; photoPath: string | null | undefined; size?: number; rev?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photoPath) { setUrl(null); return }
    let alive = true
    let made: string | null = null
    void downloadAvatar(photoPath).then((b) => { if (alive && b) { made = URL.createObjectURL(b); setUrl(made) } })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [photoPath, rev])
  return (
    <span className="ad-av" style={{ width: size, height: size, fontSize: size * 0.4, background: tint(name) }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initialsOf(name)}
    </span>
  )
}
