import recipes from '../../../data/learn/recipes.json'
import trivia from '../../../data/play/trivia.json'
import facts from '../../../data/play/ph-facts.json'
import { playable, VIDEOS } from '../../health/library/videosLogic'
import { seedOf, triviaIndex } from '../play/score'
import { phFactIndex } from '../facts/onThisDay'

export type PickKind = 'recipe' | 'trivia' | 'fact' | 'video'
export interface Pick { kind: PickKind; id: string }

// Fixed order, so a day key always lands on the same item. Trivia and facts have no ids in their files: the id is the list index.
const POOL: Pick[] = [
  ...recipes.recipes.map((r) => ({ kind: 'recipe' as const, id: r.id })),
  ...VIDEOS.filter(playable).map((v) => ({ kind: 'video' as const, id: v.id })),
  ...trivia.questions.map((_, i) => ({ kind: 'trivia' as const, id: String(i) })),
  ...facts.facts.map((_, i) => ({ kind: 'fact' as const, id: String(i) }))
]

/** One item per local day: `day` is dayKey() (YYYY-MM-DD, the phone's date). Same key, same item.
 *  A trivia or fact pick is always the question/fact Play shows for that day (Play's own rule), so tapping it opens the same one. */
export function pickOfDay(day: string): Pick {
  const p = POOL[seedOf(day) % POOL.length]!
  if (p.kind === 'trivia') return { kind: 'trivia', id: String(triviaIndex(day, trivia.questions.length)) }
  if (p.kind === 'fact') return { kind: 'fact', id: String(phFactIndex(day)) }
  return p
}

export interface PickView { eyebrow: string; title: string; sub: string; href: string; external: boolean }
/** What the card shows for a pick. A video opens on YouTube outside the app; the rest open inside it. */
export function pickView(p: Pick): PickView {
  if (p.kind === 'recipe') {
    const r = recipes.recipes.find((x) => x.id === p.id)!
    return { eyebrow: 'Recipe', title: r.name, sub: `${r.blurb}, ${r.minutes} min`, href: '#discover/learn/recipe/' + p.id, external: false }
  }
  if (p.kind === 'video') {
    const v = VIDEOS.find((x) => x.id === p.id)!
    return { eyebrow: 'Video', title: v.title, sub: `${v.source}. Opens YouTube.`, href: 'https://www.youtube.com/watch?v=' + v.id, external: true }
  }
  if (p.kind === 'trivia') return { eyebrow: 'Alam mo ba?', title: trivia.questions[Number(p.id)]!.q, sub: 'Tap to answer', href: '#discover/play/trivia', external: false }
  return { eyebrow: 'Did you know?', title: facts.facts[Number(p.id)]!, sub: 'More fun facts in Play', href: '#discover/play/facts', external: false }
}
