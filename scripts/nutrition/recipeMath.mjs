// The recipe maths for src/features/nutrition/foods.json. Pure, no I/O, so build-foods.mjs and the vitest file share it.
// A serving's nutrient = sum over parts of (per-100 g value x grams / 100). Unknown (null) in any part makes that nutrient null for the dish, never 0.
export const FIELDS = ['kcal', 'sodium_mg', 'potassium_mg', 'protein_g']

const r1 = (n) => Math.round(n * 10) / 10

/** One serving of `parts` ([[ingredientKey, grams], ...]) against `ingredients` (per 100 g). */
export function perServing(parts, ingredients) {
  const out = {}
  for (const f of FIELDS) {
    let sum = 0
    let known = true
    for (const [k, g] of parts) {
      const ing = ingredients[k]
      if (!ing) throw new Error(`unknown ingredient ${k}`)
      if (!Number.isFinite(g) || g <= 0) throw new Error(`bad grams for ${k}`)
      const v = ing[f]
      if (v == null || !Number.isFinite(v)) known = false
      else sum += (v * g) / 100
    }
    out[f] = known ? (f === 'protein_g' ? r1(sum) : Math.round(sum)) : null
  }
  return out
}

/** recipes.json -> the foods.json array, in the same order. estimate is true while any ingredient is not verified against the FDC API. */
export function buildFoods(recipes) {
  return recipes.foods.map((f) => ({
    key: f.key,
    name: f.name,
    tl: f.tl,
    serving_label: f.serving_label,
    ...perServing(f.parts, recipes.ingredients),
    src: f.parts.length === 1 ? 'USDA FoodData Central' : 'USDA FoodData Central (recipe)',
    ...(f.parts.every(([k]) => recipes.ingredients[k].verified === true) ? {} : { estimate: true })
  }))
}
