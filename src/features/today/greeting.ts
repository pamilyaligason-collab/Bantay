import { firstName } from '../shell/TopBar'

// shortcut: copies TopBar's two one-liners; delete TopBar's Today branch and move these there when shell retires it
const part = (d: Date) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening')

export const greeting = (d: Date, name: string) => { const f = firstName(name); return f ? `${part(d)}, ${f}` : part(d) }
export const dateKicker = (d: Date) => new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Manila' }).format(d)
