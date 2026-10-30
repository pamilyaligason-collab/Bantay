import { useSelfPersonId } from '../setup/useProfile'

// S16 C-9. L0 stubs: every function returns the "not acting" value. L6 fills the bodies; signatures stay.
export async function enterActing(_personId: string): Promise<boolean> { return false }
export function exitActing(): void {}
export function useActingPersonId(): string | null { return useSelfPersonId() }
export const useActing = (): { acting: boolean; personId: string | null; name: string } => ({ acting: false, personId: null, name: '' })
export function useViewedVisibleIds(): Set<string> | null { return null }
export function useActingCan(): { log: boolean; edit: boolean; rollcall: boolean; mood: boolean; reason: string | null } | null { return null }
