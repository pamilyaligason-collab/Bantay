// Build src/features/nutrition/foods.json from scripts/nutrition/recipes.json.
//   node scripts/nutrition/build-foods.mjs            write foods.json from the numbers in recipes.json (offline)
//   node scripts/nutrition/build-foods.mjs --check    exit 1 if foods.json is not what recipes.json produces
//   node scripts/nutrition/build-foods.mjs --verify   look the ingredients up on USDA FoodData Central and report differences
// --verify uses process.env.FDC_API_KEY, else DEMO_KEY (about 10 calls an hour). Responses are cached under .scratch/fdc/ (git-ignored)
// so a re-run costs nothing. It only reports; it never rewrites recipes.json. Source: USDA FoodData Central, CC0 public domain.
// No PhilFCT values are used anywhere.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFoods } from './recipeMath.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const recipesPath = join(here, 'recipes.json')
const outPath = join(root, 'src', 'features', 'nutrition', 'foods.json')
const recipes = JSON.parse(readFileSync(recipesPath, 'utf8'))
const text = () => '[\n' + buildFoods(recipes).map((f) => ' ' + JSON.stringify(f)).join(',\n') + '\n]\n' // one food per line

const arg = process.argv[2]
if (arg === '--verify') {
  const key = process.env.FDC_API_KEY || 'DEMO_KEY'
  const cache = join(root, '.scratch', 'fdc')
  mkdirSync(cache, { recursive: true })
  const NUM = { kcal: 1008, sodium_mg: 1093, potassium_mg: 1092, protein_g: 1003 } // FDC nutrient ids
  let bad = 0
  for (const [k, ing] of Object.entries(recipes.ingredients)) {
    if (ing.fdc == null) { console.log(`SKIP ${k}: no fdc id yet. Search FDC for: ${ing.fdcName}`); continue }
    const file = join(cache, `${ing.fdc}.json`)
    if (!existsSync(file)) {
      const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${ing.fdc}?api_key=${key}`)
      if (!res.ok) { console.log(`STOP ${k}: HTTP ${res.status} (rate limited? set FDC_API_KEY)`); process.exit(2) }
      writeFileSync(file, await res.text())
    }
    const food = JSON.parse(readFileSync(file, 'utf8'))
    const got = {}
    for (const n of food.foodNutrients ?? []) for (const [f, id] of Object.entries(NUM)) if ((n.nutrient?.id ?? n.nutrientId) === id) got[f] = n.amount ?? n.value
    const diffs = Object.entries(NUM).filter(([f]) => got[f] == null || Math.abs(got[f] - ing[f]) > Math.max(1, Math.abs(ing[f]) * 0.03)).map(([f]) => `${f} ${ing[f]} vs ${got[f] ?? 'missing'}`)
    if (diffs.length) { bad++; console.log(`DIFF ${k} (${ing.fdc} "${food.description}"): ${diffs.join('; ')}`) } else console.log(`OK   ${k} (${ing.fdc} "${food.description}")`)
  }
  process.exit(bad ? 1 : 0)
} else if (arg === '--check') {
  const same = existsSync(outPath) && readFileSync(outPath, 'utf8').replace(/\r\n/g, '\n') === text()
  console.log(same ? 'foods.json matches recipes.json' : 'foods.json is out of date: run node scripts/nutrition/build-foods.mjs')
  process.exit(same ? 0 : 1)
} else {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, text())
  console.log(`wrote ${outPath} (${recipes.foods.length} foods)`)
}
