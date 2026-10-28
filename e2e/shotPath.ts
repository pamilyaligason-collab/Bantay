// Committed doc screenshots are rewritten only when DOC_SHOTS=1 (ML-32); a plain run writes under test-results/.
export const shotPath = (p: string) => (process.env.DOC_SHOTS === '1' ? p : p.replace(/^docs\//, 'test-results/doc-shots/'))
