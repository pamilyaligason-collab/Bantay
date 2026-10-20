# Session 6 handoff: purpose (research, plan and mockups first)

No app code changes in this phase. Plan before code; Lloyd approves Parts 1-4 first.
Public repo: no real names, health values, screenshots or keys here. Members below are anonymised.

## Access for the next session
- Supabase: Bantay is project `wuakimpssycbtnmoexuc`, in a different Supabase org from the one the
  claude.ai connector was authorised for (that one sees only two other projects). Re-authorise the
  Supabase connector with the account/org that owns Bantay, then start a new session.
- Google Drive works: folder "2026.10.19 screenshots" (22 phone shots) is readable.
- Not reachable from the cloud: the vault, the laptop, and the two other projects' repos (ask Lloyd for the weather screen files or a screenshot).

## Part 1 evidence so far (last 30 days, as of 2026-10-20)
| User | Role | Active days | Screen opens | Top screen |
|---|---|---|---|---|
| Admin (builder) | admin | 4 | 229 | Today 61, Health/Safety/Family ~40 each |
| Member A | member | 1 | 18 | Today 12, Safety 3 |
| Member B | member | 1 | 10 | Family 4, Records 2 |
| Owner account | owner | 2 | 18 | setup only, excluded from habit targets |

- Q2 (doses): **no rows**. Nobody logged a dose in 30 days.
- Member A turned alerts on, then off, the same day.
- Every user is treated as an individual; only their in-app role matters.

## Tracking gaps (src/features/admin/events.ts)
- `dose_logged`, `reading_added`, `sos_sent` are on the allowlist but never emitted, so usage_events shows zero regardless.
- No screen event for Ask; no card-open events; `at` is sync time, not tap time.
- Plan item: emit those actions, add card-open names, add client time (small migration).

## Still to run (docs/session-6/baseline-30d.sql)
Q1 check-ins, Q3 scheduled medicines vs expected doses, Q4 readings per week, Q6 daily active people.

## Next
1. Run Q1, Q3, Q4, Q6 (connector or Lloyd pastes results).
2. Read the 22 screenshots plus src/ screens; list what each does now.
3. Primary-source licence/API table (PAGASA, PANaHON, NOAH, HazardHunterPH, Worldview, MedlinePlus Connect, openFDA/DailyMed, DOH/WHO, YouTube, Overpass).
4. Then Parts 2-4 per the session brief.
