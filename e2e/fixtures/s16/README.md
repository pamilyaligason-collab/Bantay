# Session 16 fixtures

Each lane creates its own file here (contracts.md C-11); nothing else writes to this folder. Fixtures freeze the clock (`FIXED_CLOCKS` in `e2e/s16.ts`) and the data so a gate rerun leaves the tree clean (ML-32).

| File | Lane | Exports |
|---|---|---|
| `today.ts` | L1 | `calm`, `alertsOff`, `quake`, `storm`, `offline` |
| `health.ts` | L2 | `full`, `empty`, `acting` |
| `discover.ts` | L3 | `full` |
| `family.ts` | L4 | `full`, `emptyNeeds`, `acting`, `sixMedicines` |
| `settings.ts` | L5 | `admin`, `member` |
| `acting.ts` | L6 | `adminWriter`, `adminNoLink`, `member` |
| `onboarding.ts` | L8 | `withMeds`, `noMeds`, `deniedTwice` |

Mock server for signed-in specs: `e2e/health-auth-mock.ts` (existing). Page-height budgets (D-102) are in contracts.md C-11.
