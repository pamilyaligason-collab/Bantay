export type Nutrients = { kcal: number | null; sodium_mg: number | null; potassium_mg: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; sat_fat_g: number | null; fiber_g: number | null; sugars_g: number | null; calcium_mg: number | null; iron_mg: number | null; magnesium_mg: number | null; vitd_ug: number | null; b12_ug: number | null }
export type Per100 = { kcal: number | null; sodium_mg: number | null; potassium_mg: number | null; protein_g: number | null; carbs_g?: number | null; fat_g?: number | null; sat_fat_g?: number | null; fiber_g?: number | null; sugars_g?: number | null; calcium_mg?: number | null; iron_mg?: number | null; magnesium_mg?: number | null; vitd_ug?: number | null; b12_ug?: number | null; verified?: boolean; fdc?: number | null; fdcName?: string }
export type Recipes = {
  ingredients: Record<string, Per100>
  foods: { key: string; name: string; tl: string; serving_label: string; parts: [string, number][] }[]
}
export const FIELDS: string[]
export const EXTRA_FIELDS: string[]
export const ALL_FIELDS: string[]
export function perServing(parts: [string, number][], ingredients: Record<string, Per100>): Nutrients
export function buildFoods(recipes: Recipes): ({ key: string; name: string; tl: string; serving_label: string; src: string; estimate?: true } & Nutrients)[]
