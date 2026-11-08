// Stand-in for lane A2's ./fullLibrary (FullLibraryCard + searchFullLibrary). The orchestrator swaps the import in Library.tsx to './fullLibrary' at merge and deletes this file.
export const FullLibraryCard = (): null => null
export const searchFullLibrary = async (_q: string): Promise<{ title: string; snippet: string; key: string }[]> => []
// f:<key> article of the downloaded full library. Assumed shape (not in the contract): the orchestrator adapts Article.tsx's FullArticleView to lane A2's real readArticle / FullArticle at merge.
export interface FullArticleData { title: string }
export const readArticle = async (_key: string): Promise<FullArticleData | null> => null
export const FullArticle = (_p: { article: FullArticleData }): null => null
