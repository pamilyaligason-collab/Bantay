# OpenFitnessPal research (Bantay food log)

Researched 2026-10-22. Read-only lane. Bantay main a2f4e52 (food log) read via `git show`; nothing edited there. OFP repos cloned shallow (depth 50) into a scratch dir and read only; no code run, no build scripts run.
REA: source repos exist, so the skill's source route applied. `rea-agents doctor` NOT run (not needed for source analysis; no REA tool used, no setup run).

## 0. Bottom line

- OpenFitnessPal (OFP) is a front end to **MyFitnessPal (MFP)'s proprietary database**, scraped through a logged-in MFP browser session. It has no food database of its own. There is nothing in it Bantay may take as data.
- Its code is mixed: lib is LGPL-3.0, search is AGPL-3.0, the app repo has **no licence file** (all rights reserved by default). The only GPL-3.0-compatible piece is lib (LGPL-3.0 can be used in a GPL-3.0 work), and it is a thin Qt/C++ client of the MFP proxy, so it is useless to a React/TypeScript app.
- Bantay already has what OFP's food log has (search, recents, copy-yesterday, portions, per-food sodium and potassium, water, goal bands) and more (sodium-first, Filipino dishes, soft delete, RLS). Take ideas only; copy zero code and zero data.

## 1. The org (https://github.com/OpenFitnessPal, created 2024-08-16, 4 public repos; verified with `gh api orgs/OpenFitnessPal/repos`)

| Repo | Stack | Last push | Archived | Licence (GitHub API SPDX) | Purpose |
|---|---|---|---|---|---|
| [lib](https://github.com/OpenFitnessPal/lib) | C++ / Qt Core+Network | 2025-01-07 (HEAD 9d6eb3d30b082a0e1c70011c338d86f3289f90a1) | yes (README: "DEPRECATED, app contains the lib directly") | **LGPL-3.0** (LICENSE file is LGPL v3) | OFPLib: "access data from MyFitnessPal's extensive nutrition database through public webpages and APIs" |
| [QML-OpenFitnessPal](https://github.com/OpenFitnessPal/QML-OpenFitnessPal) (old names OpenFitnessPal, crueter/OpenFitnessPal redirect here) | Qt 6 / QML + C++, CMake, Android Gradle, Windows NSIS | 2025-07-10 (HEAD 5775447e23f2d945a35d6221d47640b15581a2b4, 40 commits) | yes ("QML frontend abandoned, will be replaced by a Kotlin frontend") | **None.** No LICENSE file in the tree, GitHub reports no licence (licence API 404). Org profile calls it "free, open-source" but grants no terms | The fitness tracker (food, recipes, exercise, health markers, symptoms, goals) |
| [search](https://github.com/OpenFitnessPal/search) | C (mongoose HTTP server) + `search.py` | 2024-08-16 (HEAD 95cd2ca994b43b126d0c96bddf4790fc914728ab, 5 commits) | no, but stale | **AGPL-3.0** (LICENSE file is AGPL v3) | Search backend: HTTP on :8888 that shells out to `python3 search.py` which uses `python-myfitnesspal` with the host's logged-in MFP browser cookies |
| [.github](https://github.com/OpenFitnessPal/.github) | none | 2024-08-16 | no | none | Org profile README only |

The Kotlin successor is not on GitHub under the org or `crueter` (searched `gh search repos`, `gh api users/crueter/repos`; nothing). Unverified: it may live on the author's self-hosted forge (README points to git.swurl.xyz; that URL returned 404 for me). A Hack Club scrapbook entry by crueter only mentions the QML app ([source](https://scrapbook.hackclub.com/CarsonRueter)). `AryaBuddha/openfitnesspal` (search hit) is an unrelated repo; not examined.

### Data sources (exact)
- Only one: MyFitnessPal. Chain: app -> `OFPManager::search` -> `https://search.swurl.xyz/` (hard-coded `BASE_URL` in lib/src/OFPManager.cpp and the QML repo copy) -> search C server -> `search.py` -> `python-myfitnesspal` `Client().get_food_search_results()`.
- No USDA FDC, no Open Food Facts, no own DB. The search repo README says the host "will need to be logged in on a browser to MyFitnessPal".
- Search proxy API shape (from search.py, verified by reading): `GET /<query>?results=N&generics&avoid_<nutrient>=<mg>` returns a JSON array of `{brand, name, id (mfp_id), calcium, cholesterol, fat, fiber, iron, protein, potassium, sodium, sugar, sat, mono, poly, trans, carbs, vitaminA, vitaminC, servings:[{mult, value, unit}]}`. Missing values default to 0 (not null).
- Licence of the data: MFP content is proprietary and mostly user-submitted. I did not fetch MFP's Terms of Service, so "ToS forbids scraping" is **unverified** here, but there is no open licence on the data and OFP supplies none. Treat as not reusable. The public service at search.swurl.xyz is also an unauthenticated third-party proxy: do not call it from Bantay (privacy and legal).

### Food-log features in the QML app (read from headers and QML file names; not run)
- Search: remote only (MFP via proxy). Settings: "Prefer Generics" and result count. Server-side `avoid_<nutrient>=<threshold>` filter (drops foods above a threshold, e.g. sodium). No barcode, no local DB.
- Foods: `FoodItem` = name, brand, id, NutrientUnion, list of `ServingSize{baseMultiplier, unit, defaultValue}`; a logged `FoodServing{item, sizeIdx, units}` scales nutrients by `servingSize.multiplier(units)`. Recipes become one item (commit 4453616). Meal names configurable (MealNamesManager). Local caching of looked-up foods (CacheManager); storage is JSON files in AppLocalData (DataManager).
- Nutrients: fat, sat/mono/poly/trans, carbs, fiber, sugar, added sugar, protein, cholesterol, calcium, iron, **sodium, potassium**, vitamins A/C/D, calories derived. Goals manager sets macro grams; no sodium-first view, no hypertension or kidney logic found (grep not exhaustive).
- Not present (checked file lists): barcode scanning, favourites, recents, quick-add calories, templates/copy-yesterday, water. It also has exercise, health markers (incl. a blood pressure field), symptoms, weight: out of scope for this lane.

## 2. What Bantay can legally reuse

Rule applied: copy zero code from licences not compatible with GPL-3.0; data only if its licence allows redistribution.

| Item | Licence | Reuse in Bantay (GPL-3.0, public) |
|---|---|---|
| lib (OFPLib C++) | LGPL-3.0 | Legally compatible (LGPL-3.0 may be combined into a GPL-3.0 work, with notice). **Practically no**: C++/Qt, and every call goes to the MFP proxy. Nothing portable. Do not copy. |
| QML-OpenFitnessPal (all source, QML, icons, `program_info` icons/svg/ico, `vc_redist.x64.exe`) | **No licence = all rights reserved** | **No.** Not even small snippets or icons. `vc_redist.x64.exe` is a Microsoft binary, never touch. Ideas and data-model shapes are not copyrightable; the code is. |
| search (C + search.py) | AGPL-3.0 | **No** (prior decision: no AGPL). Also unsafe: it builds a shell command from the request string (command injection risk, main.c about lines 94-120). |
| MFP food data (via any path) | Proprietary, no open licence | **No.** Never store, seed or cache it. Do not use the unofficial `python-myfitnesspal` scraping route. |
| Bantay's own data | USDA SR Legacy / FDC, CC0 (already) | Keep. This is the only dataset in play and it is the better one for Bantay. |
| Open Food Facts (not OFP, for the barcode idea) | ODbL (database) + DbCL (contents) | Not copied. If ever used, query at runtime with attribution and do not merge rows into `foods.json` (share-alike risk). Per-image licence (CC-BY-SA) unverified; do not use images. |

Image/icon licences: the QML repo's `icons/` and `program_info/*.svg|ico|icns` carry no stated licence, so treat as all rights reserved.

## 3. Enhancements for Bantay, ranked (value x effort), all our own implementation

Existing baseline in a2f4e52 (verified): `logic.ts` has `searchFoods`, `recentFoods`, `copyMeal` (same as yesterday), PORTIONS 0.5/1/1.5, SALTY_KEYS one-tap, `topSodium`, `goalBand`, `saltGrams`, `dailySodium`; `food_entries` has nullable kcal/sodium/potassium/protein and nullable `food_key`; `nutrition_goals` has sodium_mg and water_ml only.

1. **Salt flag on every dish tile and search result** (value high, effort S). Idea from OFP's `avoid_sodium=` filter, but shown, not hidden: a small "High salt" mark when a serving is over about 600 mg (threshold needs a cited source and sign-off; unverified). Files: `src/features/nutrition/logic.ts` (pure `saltTier(food)`), `PlateSheet.tsx` (tile), `nutrition.css`, `logic.test.ts`. No migration.
2. **Potassium for kidney users** (value high, effort M). Data is already stored per entry. Add a daily potassium total and an optional doctor-set `potassium_mg` limit that shows a band only when a limit is set (kidney guidance is individual, some people on diuretics need more, so no default). Files: `logic.ts` (`dailyTotals` already returns potassiumMg; add `potassiumBand`), `SaltSummary.tsx` or new `PotassiumSummary.tsx`, `NutritionScreen.tsx`, `actions.ts` (`saveGoal` patch), `hooks.ts` (`useGoal`). **Migration 0025**: `alter table nutrition_goals add column potassium_mg integer check (potassium_mg between 500 and 8000)` (null = no limit), plus a down file. Clinical wording needs review. Phosphorus is the other kidney number but is absent from schema and foods.json; USDA nutrient 1091 is CC0 and could be added later in `build-foods.mjs` (NUM map) with its own migration. Defer.
3. **Quick add of a food not in the list** (value high, effort S). Let a carer or senior type a name and optionally a sodium number, or leave it unknown. Today every row must come from the 104-dish list. Rows already allow `food_key` null and null nutrients, so unknown stays null. Files: `PlateSheet.tsx`, `actions.ts` (`logPlate` accepts a custom item), `logic.ts` (`snapshot` for custom). No migration.
4. **Multiple serving units per dish** (value medium, effort M). OFP's `ServingSize` list (cup, piece, ladle) is the useful idea. Keep our portion multiplier, add alternate labels per dish in `scripts/nutrition/recipes.json` and `recipeMath.mjs`, regenerate `foods.json`, extend `foods.test.ts`. Row stores the label already (`serving_label`). No migration. Do not copy OFP's unit tables (they come from MFP user data).
5. **Household variants ("my adobo, less patis")** (value medium-high, effort L). OFP's "recipe as one item" idea. New table `custom_foods` (person or household scope, name, per-serving numbers, soft delete, RLS pattern of 0024). **Migration 0026** plus a sync path in `src/features/log/store.ts`. Do after 1 to 3; ask Lloyd whether households share variants.
6. **Pinned favourites** (value medium, effort S). Recents exist; a pin is local per person in the Dexie store (`store.ts`). No migration unless pins must follow the person across phones.
7. **Copy any past day or meal** (value low-medium, effort S). Extend `copyMeal` from "yesterday" to a chosen day. `logic.ts`, `actions.ts`, `PlateSheet.tsx`.
8. **Barcode / packaged foods** (value medium for canned goods and noodles, effort L, legal risk). Open Food Facts runtime lookup with attribution; sodium is often missing or per 100 g. Defer; if built, store only the numbers the user confirmed, not OFF rows.

Clearly better our own way (do not mimic OFP):
- Nutrient storage: OFP defaults missing values to 0; Bantay keeps unknown as null and sums known values only. Keep.
- Data source: curated USDA-derived Filipino dishes with a verify script beat a scraped global DB for this audience.
- Sodium-first goal bands (Under/Near/Over), WHO-based 2000 mg default and "ask your doctor" note: OFP has no equivalent.
- Storage: Supabase with RLS, soft delete and the carer model (0024), versus OFP's local JSON files.
- Search: local, Tagalog and English names, offline. A remote search server suits neither seniors on weak connections nor privacy.
- Skip OFP's exercise, health-marker and step-counting parts (`accel` is a stub with a leftover `console.log("yoyoyo")`).

## 4. Risks

- Legal: using MFP data or its scraper chain is the main risk (ToS and copyright, ToS unverified here). Bantay is public and GPL, so copied code is visible and traceable. Unlicensed OFP app code cannot be relicensed by attribution.
- Licence confusion: GitHub shows LGPL on lib and AGPL on search, but the org profile says "open source" for the app with no licence. No licence file means not permissive.
- Security/privacy: the search proxy builds a shell command from the request path (command injection) and proxies a logged-in third-party account. Never run or call it; calling `search.swurl.xyz` would send the family's search terms to an unknown third party.
- Health: potassium and salt guidance for kidney and hypertension users is clinical. Potassium default must be null, wording "ask your doctor", and the item 1 threshold needs a cited source (unverified).
- Maintenance: OFP is archived and the Kotlin successor was not found; do not plan around its roadmap.
- Unverified: MFP ToS text; the Kotlin app's existence and licence; behaviour of the QML app (read, not run). Bantay claims were checked on a2f4e52 with `git show`; main HEAD was 246d824 at the time.
