// Build src/features/nutrition/foods.json from scripts/nutrition/recipes.json.
//   node scripts/nutrition/build-foods.mjs            write foods.json from the numbers in recipes.json (offline)
//   node scripts/nutrition/build-foods.mjs --check    exit 1 if foods.json is not what recipes.json produces
//   node scripts/nutrition/build-foods.mjs --verify   look the ingredients up on USDA FoodData Central and report differences
//   node scripts/nutrition/build-foods.mjs --verify-csv <dir> [--write]   same comparison, offline, from the SR Legacy CSV download (food.csv + food_nutrient.csv).
//     --write also copies the CSV values into recipes.json and marks every ingredient that has an fdc id found in the CSV verified:true.
// --verify uses process.env.FDC_API_KEY, else DEMO_KEY (about 10 calls an hour). Responses are cached under .scratch/fdc/ (git-ignored)
// so a re-run costs nothing. It only reports; it never rewrites recipes.json. Source: USDA FoodData Central, CC0 public domain.
// No PhilFCT values are used anywhere.
import { mkdirSync, readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFoods } from './recipeMath.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const recipesPath = join(here, 'recipes.json')
const outPath = join(root, 'src', 'features', 'nutrition', 'foods.json')
const recipes = JSON.parse(readFileSync(recipesPath, 'utf8'))
const text = () => '[\n' + buildFoods(recipes).map((f) => ' ' + JSON.stringify(f)).join(',\n') + '\n]\n' // one food per line

const NUM = { kcal: 1008, sodium_mg: 1093, potassium_mg: 1092, protein_g: 1003 } // FDC nutrient ids
/** Compare one ingredient with the nutrients `got` from FDC; prints OK/DIFF and returns true when it differs (or a value is missing). */
function report(k, ing, description, got) {
  const diffs = Object.entries(NUM).filter(([f]) => got[f] == null || ing[f] == null || Math.abs(got[f] - ing[f]) > Math.max(1, Math.abs(ing[f]) * 0.03)).map(([f]) => `${f} ${ing[f]} vs ${got[f] ?? 'missing'}`)
  console.log(`${diffs.length ? 'DIFF' : 'OK  '} ${k} (${ing.fdc} "${description}")${diffs.length ? ': ' + diffs.join('; ') : ''}`)
  return diffs.length > 0
}

const arg = process.argv[2]
if (arg === '--verify-csv') {
  const dir = process.argv[3]
  if (!dir) { console.log('usage: --verify-csv <dir with food.csv and food_nutrient.csv> [--write]'); process.exit(2) }
  const want = new Map(Object.entries(recipes.ingredients).filter(([, i]) => i.fdc != null).map(([k, i]) => [String(i.fdc), k]))
  const desc = {}
  for (const l of readFileSync(join(dir, 'food.csv'), 'utf8').split('\n')) { const m = l.match(/^"(\d+)","[^"]*","(.*?)","/); if (m && want.has(m[1])) desc[m[1]] = m[2] }
  const byNutrient = Object.fromEntries(Object.entries(NUM).map(([f, id]) => [String(id), f]))
  const got = {} // fdc id -> { field: per-100 g amount }
  for await (const l of createInterface({ input: createReadStream(join(dir, 'food_nutrient.csv')) })) {
    const c = l.split(',') // id,fdc_id,nutrient_id,amount,... (all quoted numbers, no embedded commas)
    const id = c[1]?.replace(/"/g, ''), f = byNutrient[c[2]?.replace(/"/g, '')]
    if (f && want.has(id)) (got[id] ??= {})[f] = Number(c[3].replace(/"/g, ''))
  }
  const write = process.argv.includes('--write')
  let bad = 0
  for (const [k, ing] of Object.entries(recipes.ingredients)) {
    if (ing.fdc == null) { console.log(`SKIP ${k}: no fdc id (not in SR Legacy). Search for: ${ing.fdcName}`); continue }
    const d = desc[ing.fdc]
    if (d == null) { bad++; console.log(`MISS ${k}: fdc ${ing.fdc} is not in food.csv`); continue }
    const g = got[ing.fdc] ?? {}
    if (report(k, ing, d, g)) bad++
    if (write && Object.keys(NUM).every((f) => g[f] != null)) Object.assign(ing, g, { fdcName: d, verified: true })
  }
  if (write) { // rewrite only the ingredient lines so the file keeps its one-line-per-ingredient layout
    let raw = readFileSync(recipesPath, 'utf8')
    for (const [k, ing] of Object.entries(recipes.ingredients)) raw = raw.replace(new RegExp(`^(\\s*"${k}": )\\{.*?\\}(,?\\r?)$`, 'm'), (_, a, z) => a + '{ ' + Object.entries(ing).map(([f, v]) => `"${f}": ${JSON.stringify(v)}`).join(', ') + ' }' + z)
    writeFileSync(recipesPath, raw); console.log('wrote recipes.json')
  }
  process.exit(bad ? 1 : 0)
} else if (arg === '--verify') {
  const key = process.env.FDC_API_KEY || 'DEMO_KEY'
  const cache = join(root, '.scratch', 'fdc')
  mkdirSync(cache, { recursive: true })
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
    if (report(k, ing, food.description, got)) bad++
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
