# Official safety alerts (D-25)

A scheduled Edge Function (`alerts-ingest`) pulls public alert feeds into `public.safety_alerts`. The app's sync copies the active rows into
the phone (Dexie kv `safety.alerts`), so alerts show offline. Bantay is not a siren: no copy promises advance warning.
Done by Lloyd. About 15 minutes. Nothing here is applied by the build.

## 1. Apply the SQL

Run `supabase/migrations/0007_safety_alerts.sql` after 0006. Signed-in members can read; nobody but the service role can write.
Rehearsal on a throwaway Postgres (11 checks): `supabase/tests/alerts_rehearsal.sql`.

## 2. Secret

| Name | What |
| --- | --- |
| `ALERTS_CRON_SECRET` | A long random string, at least 32 characters. Generate it yourself. Never commit it. The function refuses to run without it. |

`supabase secrets set ALERTS_CRON_SECRET=...` (or the dashboard). Then store the SAME value in Vault, in the SQL editor only:
`select vault.create_secret('<the secret>', 'alerts_cron_secret');`

## 3. Deploy

```
supabase functions deploy alerts-ingest --no-verify-jwt
```

`--no-verify-jwt` is intended: the cron call carries no user session. The `x-alerts-secret` header is the only gate; a wrong or missing secret gets 401.
Test once by hand (secret from your password manager): POST to `https://<ref>.supabase.co/functions/v1/alerts-ingest` with that header.
Expect `{"ok":true,"sources":{"USGS":{"ok":true,...},"GDACS":...,"Open-Meteo":...}}`.

## 4. Schedule

Run `ops/sql/alerts_cron.sql` (pg_cron plus pg_net, every 10 minutes). It stops with a clear error if step 2's Vault secret is missing.

## What it pulls

| Source | Kind in the app | What is kept | Lives for |
| --- | --- | --- | --- |
| USGS all-day quakes | `quake` (tier 1) | M3.5+ within 150 km of either home zone, M4.5+ within 500 km, M6.0+ within 1,500 km, M7.0+ within 3,000 km (D-88) | 24 h from the quake |
| GDACS RSS | `gdacs` (tropical cyclone, flood), `volcano` (tier 1), `tsunami` (tier 1) | Current events in the Philippines or within 1,000 km of either home zone (D-88). Global context, not a PAGASA or PHIVOLCS warning | 48 h (72 h volcano, 12 h tsunami) from GDACS's last change |
| Open-Meteo air quality | `air` (tier 2) | US AQI 101 and above, on an 11 km model grid. Model estimate, never shown above an official warning | 3 h |

If a source fails (timeout, error, a page that is not the expected feed), its old rows stay and are marked `stale`. The card then says
"Last checked <time>; source unreachable." Nothing is deleted on failure. Expired rows are hidden by the app and can be cleaned later.

## Not ingested (HTML or PDF scrape only)

PHIVOLCS earthquake list and detail pages (Word-export HTML), PHIVOLCS volcano bulletins (no feed found), PAGASA tropical cyclone and weather
bulletins (PDF inside an iframe), BOHECO I interruptions (WordPress category page). NGCP, LWUA and NDRRMC returned 403 to the probe and are
unverified: re-test with a browser user agent. Tagbilaran Water has no resolvable official site. Until a parser exists for these, the Safety
screen's hotlines and the links in each card stay the way to check them. USGS stands in for PHIVOLCS quakes.

## PAGASA public alert feed (S5, D-78)

`https://publicalert.pagasa.dost.gov.ph/feeds/` is an Atom index of CAP 1.2 files. Its rights element says "Licensed under CC BY 4.0", so every row and card says
**PAGASA, CC BY 4.0**. Read-only fetch checked 2026-10-26. It carries tropical cyclone wind signals (`wcp`), tropical cyclone alerts (`acp`) and general flood
advisories (`gfa`). It has no thunderstorm advisory: those stay a link to the PAGASA bulletin.

| Feed product | Row | Tier | Rule |
| --- | --- | --- | --- |
| Tropical Cyclone Warning (wind signal 1-5) | `tcws`, id `pagasa-tcws-<storm>-<zone>`, level "Signal No. N" | 1 | Kept only when its areaDesc names a home zone (Bohol or Tagbilaran for Dampas; General Santos, South Cotabato or Sarangani for Conel). The newest bulletin of a storm decides; a later Tropical Cyclone Alert lifts every signal (row written already expired). Expires with the CAP (12 h). |
| General Flood Advisory | `rainfall`, id `pagasa-rain-<zone>`, level = CAP severity | 2 | Kept when a CAP area polygon contains the zone point. A newer advisory replaces it; a Final (AllClear) or Cancel ends it. Never notifies. |

Each run reads the index, then the CAP files it lists that were updated in the last 30 hours (at most 40; each retried once). If the index or any CAP cannot be
read, only the PAGASA rows are marked stale and kept; GDACS, Open-Meteo and USGS keep running on their own, so a typhoon still shows from GDACS.

**Family alert.** After the upsert, each live tier-1 row writes one `hazard` row (`notify_family(person, 'hazard', 'storm_warning', '<row id>:s<signal>', 'self')`,
service role) for every member with a login, then one `{mode:'flush'}` call to `dose-watch` so browser (PWA) users get the push now. The ref carries the signal:
a rerun writes nothing, a raised signal writes again. APK users see the row in the alert list the next time they open Bantay (D-78: no server push).
The app has no per-member home zone on the server, so every member is told about either zone (the family watches both, D-27).

Extra function secret (optional): `DOSE_WATCH_CRON_SECRET`, the same value dose-watch uses. Without it the flush call is skipped and browser users get the push on the
next dose-watch run (15 minutes). Redeploy `alerts-ingest` after setting it. `alerts-ingest` also bundles `_shared/heartbeat.ts`: redeploy it whenever that file changes.

Safety screens: storm mode (`StormCard`, on the Safety tab and mounted on Today by S7), Warnings (source line "From PAGASA public alerts ..., GDACS and Open-Meteo, checked
every 10 minutes ..."), the hub's Phone alerts tile (count from the phone check, only while something needs fixing) and the Phone warnings guide.

## Freshness and honest copy (session 12, lane D)

**The cron gap.** `alerts-ingest` had no cron job from 2026-10-17 (last fetch 22:16) until 2026-10-27 (job `*/10`, first run 17:00 Manila, applied from
`ops/sql/alerts_cron.sql`). For ten days the phones showed the last rows as if they were current: no row was marked stale because nothing had failed, the job
had simply never run. The fix has two parts: the cron job above, and the checks below so a silent stop is visible on the phone and on the admin desk.

**On the phone.** Every alert has `checkedAt` (the row's `fetched_at`). `safety/alerts.ts` `freshness(checkedAt, now)` returns `{ageMin, tone}`:
60 minutes or less is `ok`, over 60 is `amber`, over a day is `red`, and no time at all is `null` and `red` ("Never checked"), never "fresh".
Where it shows:

| Place | What it says |
| --- | --- |
| Each alert card (Safety > Warnings) | "Checked 5 min ago", and whether it affects the family |
| Today alert band | the same, plus the amber line below |
| Safety home, Alerts group | "Checked n min ago" from the newest row, and the amber line |
| Safety hub Warnings tile | "None now · may be out of date" when the newest check is over an hour old |

The amber line is shown even when no row is marked stale: "Alerts last checked <time>. They may be out of date. Check PAGASA or listen to the radio."
With no saved alert at all the phone cannot tell a quiet day from a dead feed, so it says "Never checked" with the same amber line. (A feed-level "last
synced" time written by `sync.ts` would remove that ambiguity; it is a one-line follow-up in that file.)

**Does it affect us?** `affectsUs(alert, here)` (D-87, D-88): an alert with no point covers the whole area. Every quake the ingest kept affects the
family and always shows the do-now steps: within its felt radius by magnitude (M<4 50 km, 4-5 100, 5-6 200, 6-7 400, 7+ 800, unknown 100) it says
"Near you" or "Near home (zone)", beyond it "About N km away. You may feel it. If you feel shaking, follow the steps below."; M6.5+ adds the tsunami line.
Storm, flood, tsunami, volcano and GDACS rows affect within 1,000 km; air, utility and local notices within 50 km; heat within 150 km. Anything else says
"Far from you. Watch for updates." The app never says "no action needed". Hand-computed: 0.8 degrees of latitude is 88.95 km, so an M4.5 quake 89 km
from Conel is near (felt to 100 km).

**Source copy.** One constant, `SOURCES_LINE`, replaces every claim that the app pulls PAGASA, PHIVOLCS or NDRRMC warnings:
"Quakes: USGS. Storms, floods, volcanoes and tsunamis: GDACS and the PAGASA public alert feed. Air quality: Open-Meteo. Checked every 10 minutes. PAGASA bulletins are links you can open."
What the ingest really reads: USGS (quakes), GDACS (cyclone, flood, volcano, tsunami), the PAGASA public alert feed (wind signals, flood advisories) and
Open-Meteo (air quality only, no weather). PHIVOLCS is not ingested (see "Not ingested") and neither are the PAGASA bulletin PDFs: the constant says PAGASA bulletins are links you can open, and PHIVOLCS is not mentioned as a source.
The line names only what the ingest reads (ML-12). Other screens that still name PHIVOLCS or PAGASA as sources are outside lane D (SafetyPages, stormMode, heroCards) and are routed to the orchestrator.

**GDACS in plain words.** GDACS statistics ("Population affected by Category 1 (120 km/h) wind speeds or higher is 0.291 million.") are shown as
"About 291,000 people live where the strongest winds or water are expected." A statistic line the app cannot read is dropped, never shown raw.

**Admin desk.** System health > Scheduled jobs > "Official alerts feed" turns red when the newest `job_runs` row for `alerts-ingest` is older than 60 minutes
or `ok = false` (30 minutes for the other jobs). The sidebar dot counts it. No `job_runs` row yet is amber (unknown), never red.
