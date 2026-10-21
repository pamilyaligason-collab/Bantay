import { useEffect, useState } from 'react'
import './calendar.css'
import { deskHref } from './types'
import { Skeleton, Tag } from './ui'
import { useDeskPeople } from './people'
import { addDays, dayLabel, itemDay, loadAgenda, timeText, todayManila, type AgendaItem } from './scheduleApi'

const MAX = 8

/** Dashboard card: today plus the next 6 days. Medicine times are summarised in one line; everything else is listed (8 at most, overdue tasks first). */
export default function ScheduleCard() {
  const { nameOf } = useDeskPeople()
  const [items, setItems] = useState<AgendaItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const today = todayManila()
  useEffect(() => {
    let live = true
    loadAgenda(today, addDays(today, 6), { overdue: true }).then((r) => live && setItems(r.items), () => live && setFailed(true))
    return () => { live = false }
  }, [today])

  const doses = (items ?? []).filter((i) => i.kind === 'dose' && itemDay(i) === today)
  const people = new Set(doses.map((d) => d.personId)).size
  const list = (items ?? []).filter((i) => i.kind !== 'dose' && !i.done)
  const shown = [...list.filter((i) => i.overdue), ...list.filter((i) => !i.overdue)].slice(0, MAX)

  return (
    <section className="dk-card dk-s4" aria-labelledby="sc-h">
      <div className="dk-card-h"><h2 id="sc-h">Schedule and reminders</h2><a href={deskHref('calendar')}>Open calendar</a></div>
      {failed ? <p className="dk-card-b">Could not load the schedule. Open the calendar to try again.</p>
        : !items ? <Skeleton rows={4} />
        : <div className="dk-card-b sc-body">
            <p className="sc-doses">{doses.length ? `Medicine times today: ${doses.length} ${doses.length === 1 ? 'dose' : 'doses'} for ${people} ${people === 1 ? 'person' : 'people'}` : 'No medicine times today.'}</p>
            {shown.length ? (
              <ul className="sc-list">
                {shown.map((i) => (
                  <li key={i.id}>
                    <span className="sc-when">{i.overdue ? <Tag tone="warn">Overdue</Tag> : `${dayLabel(itemDay(i), today)}${i.allDay ? '' : ', ' + timeText(i)}`}</span>
                    <span className="sc-t">{i.title}{i.personId && <em> {nameOf(i.personId)}</em>}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="dk-empty">Nothing scheduled this week.</p>}
          </div>}
    </section>
  )
}
