import Dexie, { type Table } from 'dexie'

/** Doctor visits, read from the server only (public.appointments and prescriptions.follow_up_on, migration 0008). Nothing here is written back. */
export interface Appointment {
  id?: number; clientId?: string; personId: string
  startsAt?: string; dueOn?: string; provider?: string; facility?: string; purpose?: string
  apptStatus?: 'planned' | 'done' | 'missed' | 'cancelled'; sourcePrescriptionId?: string; status?: string
}
/** A prescription row, kept for its follow-up date. serverId is its id (an appointment's sourcePrescriptionId points at it). */
export interface FollowUp { id?: number; clientId?: string; serverId?: string; personId: string; rxDate?: string; prescriber?: string; followUpOn?: string; status?: string }

class VisitsDB extends Dexie {
  appointments!: Table<Appointment, number>
  followUps!: Table<FollowUp, number>
  constructor() {
    super('bantay-visits')
    this.version(1).stores({ appointments: '++id, &clientId, personId, startsAt', followUps: '++id, &clientId, personId, followUpOn' })
  }
}
export const vdb = new VisitsDB()
