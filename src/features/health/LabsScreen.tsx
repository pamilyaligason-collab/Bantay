import { useMemo } from 'react'
import { SubHeader } from '../shell/SubHeader'
import { PersonChips } from '../records/PersonChips'
import { useConfirmedDocs } from '../records/useRecordsServer'
import { LabsList } from './LabsList'
import { sourceIndex } from './labsLogic'
import { givenName } from './medName'
import { useHealthPerson } from './useHealthPerson'
import './health.css'

const NO_DRAFTS: Record<string, number> = {}

/** Lab results on their own screen (#health/labs, mockup v8 health-labs). Same person scoping as the Health overview: only the chosen person's records (D-82, D-84). */
export default function LabsScreen() {
  const { ready, people, ownId, personId, setPersonId, readings, thresholds } = useHealthPerson()
  const docs = useConfirmedDocs(personId)
  const sources = useMemo(() => sourceIndex(docs), [docs])
  const name = people.find((p) => p.id === personId)?.name
  return (
    <>
      <SubHeader title="Lab results" backHref="#health" backLabel="Back to Health" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      {name && ready && <p className="eyebrow lb-eyebrow">{givenName(name)} · from lab papers</p>}
      <LabsList readings={readings} thresholds={thresholds} ready={ready} sources={sources} />
    </>
  )
}
