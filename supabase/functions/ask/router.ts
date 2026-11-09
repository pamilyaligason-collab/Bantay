// Jack's model router (D-177): quick chat -> fast model; health context, harder reasoning or a long answer -> strong model; the monthly spend steps it down.
// Pure: no network, no clock. logic.ts calls route() once per question; ask.test.ts and router.test.ts run it directly.
export const FAST_TOKENS = 600
export const STRONG_TOKENS = 900
export const CAPPED_TOKENS = 300
export const STEP_DOWN = 0.7 // from here: fast model only
export const SQUEEZE = 0.9 // from here: fast model, short answers

export interface RouteIn {
  question: string
  /** user + assistant messages in the thread the model will see */
  turns: number
  /** the person's own medicines, labs or allergies are in the prompt */
  records: boolean
  /** the question touched a medicine or a lab test the person has */
  lookups: number
  /** vetted REFERENCE rows (knowledge + MedlinePlus) in the prompt */
  hits: number
  /** USD spent this month; null = unknown */
  spendUsd: number | null
  capUsd: number
  fast: string
  /** empty = no strong model configured, everything goes to fast */
  strong: string
}
export interface Route { tier: 'fast' | 'strong'; model: string; maxTokens: number; why: string }

const HEALTH = /\b(blood|sugar|glucose|pressure|bp|a1c|hba1c|cholesterol|creatinine|lab|result|test|medicine|medication|gamot|pill|tablet|dose|dosage|side effects?|symptoms?|sakit|pain|fever|lagnat|ubo|cough|rash|diabet\w*|hypertens\w*|kidney|heart|liver|thyroid|infection|allerg\w*|pregnan\w*|diet|insulin|statin|doctor|doktor)\b/i
const THINK = /\b(why|how come|explain|compare|difference|versus|vs|should i|can i|is it safe|interact\w*|what does .{1,40} mean|ano ang ibig sabihin|bakit|ano ang pagkakaiba|ipaliwanag|step by step|in detail|detailed|plan|summar\w*|list)\b/i

export function route(i: RouteIn): Route {
  const fast = (why: string, maxTokens = FAST_TOKENS): Route => ({ tier: 'fast', model: i.fast, maxTokens, why })
  if (!i.strong || i.strong === i.fast) return fast('one model')
  // Unknown spend is treated like a high one: cheap, never a surprise bill (a missing number is not "zero spent").
  if (i.spendUsd === null || !Number.isFinite(i.spendUsd) || !(i.capUsd > 0)) return fast('spend unknown')
  const used = i.spendUsd / i.capUsd
  if (used >= SQUEEZE) return fast('over 90% of the monthly cap', CAPPED_TOKENS)
  if (used >= STEP_DOWN) return fast('over 70% of the monthly cap')
  const q = i.question
  if (i.lookups > 0 || i.hits > 0) return { tier: 'strong', model: i.strong, maxTokens: STRONG_TOKENS, why: 'health context' }
  if (i.records && HEALTH.test(q)) return { tier: 'strong', model: i.strong, maxTokens: STRONG_TOKENS, why: 'records in play' }
  if (THINK.test(q) && HEALTH.test(q)) return { tier: 'strong', model: i.strong, maxTokens: STRONG_TOKENS, why: 'health reasoning' }
  if (q.length > 280 || i.turns > 6) return { tier: 'strong', model: i.strong, maxTokens: STRONG_TOKENS, why: 'long question or thread' }
  if (THINK.test(q) && q.length > 60) return { tier: 'strong', model: i.strong, maxTokens: STRONG_TOKENS, why: 'reasoning' }
  return fast('quick chat')
}

/** OpenRouter usage.cost is the real figure. When it is missing, a deliberately high per-token estimate (strong-model class) so a missing cost never counts as free. */
export function spendOf(u: { tokensIn: number | null; tokensOut: number | null; cost: number | null }): number {
  if (typeof u.cost === 'number' && Number.isFinite(u.cost) && u.cost >= 0) return u.cost
  return ((u.tokensIn ?? 3000) * 3 + (u.tokensOut ?? 900) * 15) / 1_000_000
}
