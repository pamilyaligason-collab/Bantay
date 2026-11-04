/** Capitalised first name: the family list may hold 'rey'. (Moved from TopBar.tsx; same behaviour.) */
export const firstName = (full: string) => { const f = full.trim().split(/\s+/)[0] ?? ''; return f.charAt(0).toUpperCase() + f.slice(1) }
