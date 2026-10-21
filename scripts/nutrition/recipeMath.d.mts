export type Per100 = { kcal: number | null; sodium_mg: number | null; potassium_mg: number | null; protein_g: number | null; verified?: boolean; fdc?: number | null; fdcName?: string }
export type Recipes = {
  ingredients: Record<string, Per100>
  foods: { key: string; name: string; tl: string; serving_label: string; parts: [string, number][] }[]
}
export const FIELDS: string[]
export function perServing(parts: [string, number][], ingredients: Record<string, Per100>): { kcal: number | null; sodium_mg: number | null; potassium_mg: number | null; protein_g: number | null }
export function buildFoods(recipes: Recipes): { key: string; name: string; tl: string; serving_label: string; kcal: number | null; sodium_mg: number | null; potassium_mg: number | null; protein_g: number | null; src: string; estimate?: true }[]
