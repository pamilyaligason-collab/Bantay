import { useMemo } from 'react'
import { LargeTitle } from '../look/LargeTitle'
import { useConfirmedDocs } from '../records/useRecordsServer'
import { LabsList } from './LabsList'
import { sourceIndex } from './labsLogic'
import { WhoLine } from './WhoLine'
import { useHealthPerson } from './useHealthPerson'
import './health.css'

/** Lab results on their own screen (#health/labs, mockup v8 health-labs). Same person scoping as the Health overview: only the chosen person's records (D-82, D-84). */
export default function LabsScreen() {
  const { ready, personId, readings, thresholds, canMark } = useHealthPerson()
  const docs = useConfirmedDocs(personId)
  const sources = useMemo(() => sourceIndex(docs), [docs])
  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Labs" tone="red" actions={<a className="hv-tl" href="#family/papers">Papers</a>} />
      <WhoLine />
      <LabsList readings={readings} thresholds={thresholds} ready={ready} sources={sources} personId={personId} canMark={canMark} />
    </>
  )
}
