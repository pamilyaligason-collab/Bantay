import { useCallback, useEffect, useState } from 'react'
import { loadAll } from './store'

type Data = Awaited<ReturnType<typeof loadAll>>
const empty: Data = { people: [], readings: [], consults: [], thresholds: [] }

export function useHealthData() {
  const [data, setData] = useState<Data>(empty)
  const [ready, setReady] = useState(false)
  const [personId, setPersonId] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    loadAll()
      .then((d) => {
        if (!live) return
        setData(d)
        setPersonId((p) => p || (d.people[0]?.id ?? d.readings[0]?.personId ?? ''))
      })
      .catch(() => {}) // storage blocked: show the empty state
      .finally(() => live && setReady(true))
    return () => {
      live = false
    }
  }, [tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const readings = data.readings.filter((r) => r.personId === personId)
  const consults = data.consults.filter((c) => c.personId === personId)
  return { ...data, ready, personId, setPersonId, readings, consults, reload }
}

export const testLabel = (key: string, guide: Record<string, { label: string }>) => guide[key]?.label ?? key
