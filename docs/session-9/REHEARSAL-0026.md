# Migration 0026 rehearsal (W1-NUTRI)

Synthetic rows only; nothing from the live project. 0026 is not applied to the live database.

| Item | Result |
|---|---|
| Target | throwaway local Postgres 18 (WSL Ubuntu) |
| Script | `supabase/tests/nutrition_v2_rehearsal.sql` |
| Exit code | 0, ends `ALL PASS` |
| Up, down, up | clean; down keeps the meal rows; up again restores the columns |

Deploy order: apply 0026 BEFORE publishing the app build. New phones send the 10 new food_entries columns and potassium_mg/sex on nutrition_goals, and a project without 0026 answers 400.
