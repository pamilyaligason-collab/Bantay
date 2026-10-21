# Session 8 clinical review list

Text below is plain-language and non-diagnostic, but a clinician should read it before release. Append new items under your lane's heading.

## L1 labs (lab results list and detail)

Code: `src/features/health/labsLogic.ts` (`INFO`), shown on the lab detail page.

1. "What this test measures" lines for: LDL, HDL, total cholesterol, triglycerides, HbA1c, fasting glucose, eGFR, creatinine, hemoglobin, platelets, white blood cells, uric acid. Wording follows MedlinePlus lab-test pages (https://medlineplus.gov/lab-tests/). Check each is accurate and not alarming.
2. Two generic "questions to ask your doctor" per test, same map. Check they are sensible and neutral.
3. Neutral fallback line and questions for any test not in the map.
4. "Toward / away from the usual range" wording compares each result with the one before it, by distance to the range limits. It never says better or worse.
5. NOT added, needs clinician-supplied values: the dashed "many doctors are not concerned until ..." line from the mockup.
6. Reference ranges come from the lab printout, the family limit, or `guide-ranges.json` / the general guide in `ranges.ts`; no new ranges were added.
