// Stand-in for lane A2's ./fullLibrary (FullLibraryCard + searchFullLibrary). The orchestrator swaps the import in Library.tsx to './fullLibrary' at merge and deletes this file.
export const FullLibraryCard = (): null => null
export const searchFullLibrary = async (_q: string): Promise<{ title: string; snippet: string; key: string }[]> => []
