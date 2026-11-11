import { firstName } from '../shell/names'

const part = (d: Date) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening')

export const greeting = (d: Date, name: string) => { const f = firstName(name); return f ? `${part(d)}, ${f}` : part(d) }
/** The date on Today's header: this phone's own day (S30 L8, A4), like the greeting beside it; never a fixed Manila (10 AM in Texas it would already read tomorrow). `tz` is for tests. */
export const dateKicker = (d: Date, tz?: string) => new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'short', timeZone: tz }).format(d)
