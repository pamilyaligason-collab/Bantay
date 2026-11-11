import { useEffect } from 'react'
import { requestSheet, startAuto, useSheetRequest } from './autoUpdate'
import { UpdateSheet } from './UpdateSheet'
import { useUpdate } from './useUpdate'

/** Mounted once in App: runs the automatic update check and shows the update sheet when the "update ready" notice is tapped. */
export function AutoUpdater() {
  useEffect(() => startAuto(), [])
  const want = useSheetRequest()
  const u = useUpdate()
  if (!want || u.decision.kind === 'none') return null
  return <UpdateSheet latest={u.decision.latest} onClose={() => requestSheet(false)} />
}
