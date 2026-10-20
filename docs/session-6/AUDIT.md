# Session 6 pre-start gap audit (2026-10-20)

Opus review, read-only, of Part 1 and decisions D1-D3 against the code and a count-only query. Each gap is now handled
in PART-3.md or the build plan; the "Handled in" column says where.

## A. Part 1 corrections
| Claim | Finding | Handled in |
|---|---|---|
| Confirmed Rx lines are read-only | Wrong: `Medicines.tsx:27-33` adds them as untimed slots with Mark taken (`:74-75`) when the user may mark. NextUp, reminders and `Health.tsx:34` ignore them. | PART-1 corrected |
| "Not automatic conversion" | Superseded by D1 | PART-1 corrected |
| Reminders cover timed profile entries | Only the signed-in person's own list, never people they care for | PART-3 1.5 |
| Weather qualifies "most days" | Thresholds right (`heroCards.ts:35-36`), frequency unmeasured | PART-1 wording softened |
| Weather appears 3 times | There are 6 surfaces (section C) | PART-3 3.0 |

## B. Auto-convert gaps
1. Schedule shape: SQL comment uses `["08:00"]` (`0008_records.sql:229`), app uses minutes (`model.ts:243`). -> versioned shape, PART-3 1.2.
2. No item contains a clock time; frequency text must be mapped. -> mapping table, PART-3 1.2.
3. 13 untimed items must not get invented times. -> `needs_time`, no reminder, PART-3 1.2.
4. Stale courses: newest Rx about 11 months old; 6 have no `rx_date`. -> default in PART-3 1.3 (Lloyd: keep).
5. 5 person+drug groups repeat across prescriptions; `source_item_id` is single. -> newest wins + `medication_sources` link table, PART-3 1.2.
6. Draft items are invisible to read-only carers (`0008:21,537`). -> converted rows written confirmed (`auto`, confidence 1) under D1, reversible, PART-3 1.2.
7. Admin may edit records but not log doses (`0003:88-89`). -> kept as is, PART-3 1.5.
8. No Dexie table or sync spec for `medications`; no `deleted_at`. -> PART-3 1.5, build lane M1.
9. Reminders read profile text, own person only; id range 31000-31099. -> PART-3 1.5.
10. `meds_taken` has no `medication_id` or slot; skips are per device by name. -> PART-3 1.5.
11. Profile text still written by wizard, MemberPage, import loader; Medical ID reads it. -> single source, PART-3 1.1.
12. Only unique index is `client_id`; deletes would be recreated on re-import. -> partial unique index + tombstone, PART-3 1.2.
13. No edit history. -> `medication_changes` audit table, PART-3 1.5.
14. Where conversion runs. -> reversible migration Lloyd applies + trigger on confirm, PART-3 1.2.

## C. Weather gaps
- Open-Meteo call (`weather.ts:15`) lacks humidity, apparent temperature, UV, wind, daily min/max; `forecast_days=2`.
- Heat index not computed (`HEAT_C=33` on air temperature, `heroCards.ts:36`); PAGASA bands unverified.
- Air quality already in alerts-ingest (`ALERTS.md:41`).
- 6 surfaces: NextUp (`NextUp.tsx:69,90`), Hero (`Hero.tsx:32`), Safety tile (`SafetyHub.tsx:69`), Safety weather page with Windy (`SafetyPages.tsx:220`) and Ventusky (`:221`, `MapsPanel.tsx:76`), Assistant card (`Assistant.tsx:157`).
- Forecast timezone fixed to Manila even abroad (`weather.ts:15`, `place.ts:18`).

## D. Safety gaps
- Zone 2 has no hotlines, places or hazards; evacuation lists unpublished.
- Zones hard-coded in `geo.ts:13-17`, mirrored in `alerts-ingest/parse.ts`.
- `news_items` has no zone column (`0005:3-10`); n8n has one zone-1 feed; titles not normalised.
- No hospital lookup; storm map pinned (`LiveMaps.tsx:12`); footer prints a repo path (`Safety.tsx:53`).

## E. Tracking
- Emit `dose_logged` in `logMedTaken` (`log/store.ts:26`), `reading_added` in `logReading` (`:21`), `sos_sent` in SosScreen.
- Add `dose_skipped`, `med_added`, `med_edited`, `med_paused`, `med_deleted`, `reminder_opened`, `checkin_done`, `weather_opened`, `ask` screen.
- Add `client_at timestamptz` to `usage_events` with its column grant (`0004:23`) and `clientAt` in `tables.ts:36`.
- Events are per user, not per person: measure dose adherence from `meds_taken` joined to medication and slot.

## F. Tests and gates
Unit: model, nextPick, reminders, heroCards, today, useMyTakes, health-screen, useCanMark, events, sync tables, hub,
livemaps, zone twin. E2E: health-v6, today, sync, assistant, onboarding, profile-auth, family-plan, safety, docs.
RLS: `supabase/tests/records_rehearsal.sql`. Keep: tsc 0, vitest and Playwright green, 390x844 light and dark shots
reviewed, `no-sideways-scroll.spec.ts`, no medicine names in notifications (B-7). Add: tab bar must not cover content.

## G. Risks
1. Part 1 text contradicted D1 (fixed).
2. Stale-course default confirmed by Lloyd as "keep" (PART-3 1.3); carer visibility decided by D1, reversible (PART-3 1.2).
3. PAGASA bands and zone 2 safety data need outside input.
4. Mockups use made-up names and numbers.
5. Writing `medications` rows is a production change Lloyd applies; it must be a reversible, idempotent migration.
