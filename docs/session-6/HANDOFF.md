# Session 6 handoff: purpose (research, plan and mockups first)

No app code changes in this phase. Plan before code; Lloyd approves Parts 1-4 first.
Public repo: no real names, health values, screenshots or keys here. Members below are anonymised.

## Access for the next session
- Supabase: project `wuakimpssycbtnmoexuc`; the connector reaches it (fixed 2026-10-20).
- GitHub: Claude app installed on the repo (fixed 2026-10-20).
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

## Baseline run 2026-10-20 (Supabase connector now reaches the project)
Usage tracking started 2026-10-17, so the "30 days" window is really 4 days.
- Q1 check-ins: admin 4 on 2 days; every other profile 0.
- Q2/Q3 doses: `medications` has **0 rows** (all users), `meds_taken` 0 rows ever, while 19 prescriptions
  were imported. Prescriptions never became scheduled medicines, so there is nothing to remind, show in
  Next up, or log. This is the root cause of zero doses, not reluctance.
- Q4 readings: none in the window. 64 readings exist from imports (2023-02 to 2026-10-06); none entered by hand since launch.
- Q6 daily active people: 2, 4, 1, 1 (Oct 17-20).
- Totals: 10 profiles, 5 sign-ins, 5 push subscriptions, 593 lab results, 192 documents, 0 appointments.

## Next
1. Decide with Lloyd: turning imported prescriptions into scheduled medicines is the first habit fix.
2. Read the 22 screenshots plus src/ screens; list what each does now.
3. Primary-source licence/API table (PAGASA, PANaHON, NOAH, HazardHunterPH, Worldview, MedlinePlus Connect, openFDA/DailyMed, DOH/WHO, YouTube, Overpass).
4. Then Parts 2-4 per the session brief.
