# Session 6, Part 2: personas and habit targets

As of 2026-10-20. Anonymised: personas are composites of the in-app roles, not real people.
Baseline numbers come from `HANDOFF.md` (usage tracking is only 4 days old) and PART-1.md.

## 1. Personas
| # | Persona | Role in app | Situation | What they need from Bantay | What stops them today |
|---|---|---|---|---|---|
| P1 | **Carer abroad** (builder) | admin | Works away for months; patchy, expensive internet; checks family from far away. | One glance: is everyone OK, were medicines taken, any storm near home. | Doses never logged, so nothing to see; weather crowds out the family status. |
| P2 | **Parent on daily medicines** | member | 60+, Android, low confidence with apps, larger text helps, prefers Filipino words. Takes 1-4 medicines a day. | A reminder at the right time and one big "Taken" button. | No medicine is scheduled (0 rows), so no reminder and no button on Today. |
| P3 | **Home carer** (sibling or spouse at home) | member, carer of P2 | Lives with P2; marks doses for P2; keeps papers and lab results. | See P2's doses due, mark for them, fix a wrong medicine quickly. | Records asks for 229 checks; medicines are read-only text; no edit. |
| P4 | **Light member** | member | Busy adult or young person; opens the app when there is weather or a family message. | Local, trustworthy weather and safety; quick "I'm OK". | Safety content is for the other home area; weather appears 3 times. |

Owner account: setup only, excluded from targets (as in HANDOFF.md).

## 2. Jobs to be done (ranked)
1. **"Remind me (or my parent) to take the medicine, and let me say it is done in one tap."** (P2, P3)
2. **"Let me see from far away that everyone is OK today."** (P1)
3. **"Tell me if weather or a hazard near *my* place means I must act, and what to do."** (P2, P4)
4. **"Let me fix what the import got wrong without a 229-item queue."** (P3, P1)
5. **"In an emergency, one press reaches family with my location."** (all)

## 3. Habit targets
Measured over the first 14 days after the build ships, per person, from `usage_events` (client time).
Baseline column is the 4-day baseline of 2026-10-20.

| # | Habit | Who | Target (14 days) | Baseline | Event that measures it |
|---|---|---|---|---|---|
| H1 | Doses logged | each person with an active medicine | >= 70% of scheduled doses marked taken or skipped within 2 h of the slot | 0 (no schedule) | `meds_taken` joined to `medications` by `medication_id` and `slot` (taken or skipped); events `dose_logged`, `dose_skipped` for funnels |
| H2 | Medicine list reviewed | P1 or P3 for each person | every auto-converted medicine opened or edited at least once in the first 7 days | 0 | `medications.schedule.review` cleared; events `med_edited`, `med_paused`, `med_deleted` |
| H3 | Daily check-in | P2, P4 | "I'm OK" on >= 4 days a week | 1 profile, 4 check-ins | `checkin_done` (activity row exists; add the event) |
| H4 | Family glance | P1 | opens Today on >= 5 days a week; taps the family line when it flags someone | Today 61 opens / 4 days (builder only) | `screen:today` + `card_seen:family_line` |
| H8 | Own progress seen | everyone | opens Today's "My week" card (in view) on >= 4 days a week | not measurable | `card_seen:my_week` |
| H5 | Weather action seen | P2, P4 | when an action line shows (heat danger or rain watch), >= 50% open it or dismiss it | not measurable | `weather_opened` (with `from: action_line`) |
| H6 | Reading added | people with a BP or sugar medicine | >= 1 reading a week | 0 by hand since launch | `reading_added` |
| H7 | Records backlog | P3 or P1 | items waiting to be checked go from 229 to 0 within 14 days | 229 | `records_confirmed` (count), `records_queue` size |

Guard metrics (must not get worse): alerts turned off (`alerts_off`), sign-in failures, sync failures (`sync_failed`).

## 4. Tracking changes these targets need
1. Emit the allowed-but-silent events: `dose_logged` in `logMedTaken`, `reading_added` in `logReading`, `sos_sent` in
   `SosScreen` (PART-1 section 3).
2. Add new names to the allow-list: `dose_skipped`, `med_added`, `med_edited`, `med_paused`, `med_deleted`,
   `reminder_opened`, `checkin_done`, `card_seen`, `weather_opened`, `records_confirmed`, and an `ask` screen event.
3. Add `client_at timestamptz` to `usage_events` with its column grant, and `clientAt` in `sync/tables.ts` (today `at`
   is arrival time, so an offline phone shifts every habit).
4. Events are per signed-in user, not per person: dose adherence (H1) comes from `meds_taken`, not from events.
5. Keep event payloads free of health values: ids, slot times and counts only (rule B-7).

## 5. Open questions for the usability test (not blockers)
- Language: is English enough for P2, or are Filipino labels needed for the medicine and weather lines?
- Should P3 marking a dose for P2 count toward H1 (yes, proposed) and be shown as "marked by"?
