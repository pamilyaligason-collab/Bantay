// Contract stub (docs/CONTRACT-auth-sync-admin.md). Lane A1 replaces the bodies; signatures are fixed.
export interface Member { userId: string; personId: string | null; role: 'admin' | 'member'; handle: string | null }
export async function getAccessToken(): Promise<string | null> { return null }
export async function getMember(): Promise<Member | null> { return null }
export function onAuthChange(_cb: () => void): () => void { return () => {} }
export async function signOut(): Promise<void> {}
