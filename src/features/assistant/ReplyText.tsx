import type { ReactNode } from 'react'

/** **bold** inside one line becomes <strong>; every other character stays plain text (React escapes it). */
export function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part.replace(/\*\*/g, '')))
}

const BULLET = /^\s*(?:[-*\u2022]|\d+[.)])\s+/

/** A Jack reply: lines starting "- ", "* ", "\u2022 " or "1. " become one bullet list; other lines are paragraphs. Plain text in, React elements out (no HTML). */
export default function ReplyText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { blocks.push(<ul key={blocks.length} className="as-list-ul">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = [] } }
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim()
    if (!line) continue
    if (BULLET.test(line)) { list.push(line.replace(BULLET, '')); continue }
    flush()
    blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>)
  }
  flush()
  return <div className="as-reply">{blocks}</div>
}
