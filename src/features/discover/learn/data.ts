import medData from '../../../data/learn/meds/cards.json'
import recipeData from '../../../data/learn/recipes.json'

export type CardKind = 'medicine' | 'supplement' | 'herbal'
export type Evidence = 'good' | 'some' | 'little'
export interface MedCardData {
  id: string; kind: CardKind; name: string; match: string[]; evidence?: Evidence
  forWhat: string; what: string; how: string[]; missed: string; side: string[]; emergency: string; noMix: string[]; food: string; generic: string
}
export type RecipeTag = 'lowsalt' | 'diabetes' | 'soft' | 'fish'
export type Step = string | [string, number]
export interface Recipe {
  id: string; name: string; blurb: string; tags: RecipeTag[]; minutes: number; servings: number; usualMg?: number
  ingredients: [string, number, string?][]; steps: Step[]
}

export const MEDCARDS = medData.cards as MedCardData[]
export const MED_SOURCES = medData.sources
export const MED_CHECKED = medData.checked
export const RECIPES = recipeData.recipes as Recipe[]
export const RECIPE_SOURCES = recipeData.sources

/** Salt limit the bars compare with: the 1,500 mg sodium a day that heart and blood pressure guides use as the ideal. */
export const DAILY_SODIUM_MG = 1500

/** Sodium per serving in mg, rounded to 10: the sum of the ingredient lines (whole pot) over the servings. */
export const sodiumPerServing = (r: Recipe): number => Math.round(r.ingredients.reduce((a, i) => a + i[1], 0) / r.servings / 10) * 10
export const stepText = (s: Step): string => (typeof s === 'string' ? s : s[0])
export const stepMinutes = (s: Step): number | null => (typeof s === 'string' ? null : s[1])
export const medCard = (id: string) => MEDCARDS.find((c) => c.id === id)
export const recipe = (id: string) => RECIPES.find((r) => r.id === id)
