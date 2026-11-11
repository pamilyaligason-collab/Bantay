# S30 L5: Texas readiness (read-only research, no app code changed)

Question: does every part of the app work for a member who lives in Texas (US Central time, UTC-6 in winter, UTC-5 in summer; 14 or 13 hours behind Manila)?
Method: grep and read of src, supabase/functions, supabase/migrations at base 6c9e6e7b. Nothing was run against live data.
Severity: broken = wrong result or a missed or false alert; wrong = misleading text or day; cosmetic = looks off, nothing lost.

## Already done for Texas (no work)
- Quick dial has a Texas box area with 911, 988, Poison Help, 2-1-1, FEMA, 311 (src/features/location/geo.ts:50, src/data/safety/hotlines.json zone texas). Call911 and SafetyHub treat Texas as a 911 place (src/features/safety/Call911.tsx:9, SafetyHub.tsx:222).
- Weather screens read the place's own zone and offset (src/features/location/place.ts:31 placeTimezone, src/features/weather/forecast.ts:56, src/features/today/weather.ts:11, WeatherScreen.tsx:220). The direct Open-Meteo call uses timezone=auto (forecast.ts:34).
- Phone-local day is used for sleep, the Today plan rows, reminders and Android alarms (src/features/health/model.ts:9 localDay, reminders.ts:119-125), so alarms ring at the phone's own 08:00.
- Sign-in is PIN or Google, no SMS code and no phone format (src/screens/SignIn.tsx): no country problem.
- Houston consulate numbers are in the OFW set (hotlines.json hl-pcg-houston, hl-pcg-houston-atn).

## Findings

### A. Time zone. The server and half the client assume Manila. No per-person zone exists (no tz column in any migration).
| # | Sev | Where | What a Texas user sees | Smallest fix |
|---|---|---|---|---|
| A1 | broken | supabase/functions/dose-watch/logic.ts:37-42 (manilaDay, slotInstant), index.ts:240 (doseDue), migrations/0018_dose_watch.sql:9 | A dose set for 08:00 is judged late at 08:30 Manila = 18:30 the evening before in Texas. The family gets "missed dose" for doses not yet due. A dose taken at 8 PM Texas lands on the next Manila day, is not found, and a false "missed" is raised. Web Push "dose due" fires at the wrong hour. | Add people.tz (IANA, default 'Asia/Manila'). dose-watch computes day and slot instant in the person's tz (Intl offset at that instant, no DST table). Philippine rows stay as they are. |
| A2 | broken | supabase/functions/_shared/fcm.ts:92 (inQuietHours) and :97 channelFor, src/features/notify/push.ts:20 | "Quiet hours 10 PM to 6 AM" run on Manila time: normal family alerts are silent 8 AM to 4 PM in Texas (winter) and loud at night. | Use the recipient's tz (people.tz) in channelFor and push.ts; one shared helper. |
| A3 | wrong | src/features/health/doseCount.ts:30, GlanceGrid.tsx:50, useActivity.ts:10, Medicines.tsx:33, MedDetail.tsx:46, today/missed.ts:55, nudge/pillboxLogic.ts:36, health/meds.ts:54-58 (manilaDay, manilaMinutes) | "Taken today", steps today and the dose slot grid start at Manila midnight = 10 AM Texas (winter). Adherence count and "today" are off. Disagrees with the phone-local code next to it (A5). | One client helper tzDay(tz) / tzMidnight(tz) fed by the person's tz; replace the +08:00 literals at these sites. |
| A4 | wrong | src/features/today/greeting.ts:6 (dateKicker fixed to Manila; the greeting on line 3 uses the phone clock) | Today header shows tomorrow's weekday and date from 10 AM Texas on, beside "Good morning". | Drop timeZone from dateKicker (phone zone). One line. |
| A5 | wrong | Client mixes two day rules: phone-local (meds.ts:34 dayOf, model.ts:9, family/events.ts:5 dayKey) and Manila (meds.ts:56 manilaDay, notify/push.ts:37 dayKey, assistant/cap.ts:7, inbox/Inbox.tsx:19, inbox/build.ts:37, family/CarerCards.tsx:40). In the PH both agree; in Texas they differ most of the day. | Inbox times, carer cards and "missed" lines show a Manila clock with no label; the same dose can sit on two days on two screens. | Same helper as A3: one rule, the person's tz. |
| A6 | wrong | src/features/family/IncomingSos.tsx:26, src/features/sync/useOffline.ts:11 (clockText), safety/AlertCard.tsx:18,34, safety/alerts.ts:152 | An SOS from Texas family reads in Manila time (1:10 PM there shows as 3:10 AM). The offline "as of" clock is Manila. PAGASA bulletin times labelled "PH time" are right. | IncomingSos and useOffline: the viewer's phone zone. Keep PAGASA labelled "PH time". |
| A7 | cosmetic | admin desk: admin/shared.tsx:4-5, desk/homeApi.ts:15-24, scheduleApi.ts:6,41,64,99, Person.tsx:24,41, systemApi.ts:13; monitor/errors.ts:16; phonecheck/appInfo.ts:26 | Admin pages use the Manila family day on purpose. Fine while the admin is in the PH. | Leave. |
| A8 | wrong | No label on any time that belongs to someone else's zone | A carer in Texas reading a PH relative's "08:00" cannot tell whose clock it is, and the reverse. | After A1 show "(their time)" when person.tz differs from the viewer's. |
| A9 | cosmetic | garden/climate.ts:45, garden/drought.ts:39, health/library/encyclopedia.ts:57 (Manila month) | Month turns up to 14 h early or late; only the PH season text. | Leave. |
| A10 | wrong | supabase/functions/alerts-digest/index.ts:2 (06:45 Asia/Manila), migrations 0030_carer_alerts.sql:82, 0033_job_runs.sql:59-124, 0041_rollcall.sql:53 | Digest push arrives at 5:45 PM Texas. The SQL day keys only de-duplicate; nothing is lost. | Leave the cron (family-wide); say the time in the Alerts settings. Leave the keys. |
| A11 | cosmetic | records/ConfirmSheet.tsx:49 and supabase/functions/records-extract/logic.ts:251,465 stamp a document date as 08:00+08:00 | A US lab date can show as the previous evening in Texas. | Store a date, or stamp 12:00 local. Low priority. |
| A12 | ok | weather/BlendCards.tsx:21 (+08:00) | Only runs for blended data, which is PH only (B1). | Leave. |

### B. Weather
| # | Sev | Where | What a Texas user sees | Smallest fix |
|---|---|---|---|---|
| B1 | wrong | supabase/functions/weather-blend/blend.ts:45-52 (cellOf rejects lat <4, >22, lon <116, >127), index.ts:24 returns 400 bad_input; client src/features/weather/useBlendedWeather.ts:18 | Every Texas refresh sends the position to the function, gets 400, throws, then falls back to the direct Open-Meteo forecast (useBlendedWeather.ts:91). The forecast works, but costs a wasted round trip and sends a Texas position to a PH-only function for nothing (ML-45). | Client: skip invoke when !inPhilippines(p) (place.ts:6). One line in loadBlendedOnce. |
| B2 | cosmetic | forecast.ts:34 has no unit params; deg() in WeatherScreen.tsx:61 and WeatherCard.tsx:55; wind tile WeatherScreen.tsx:309 | Temperature in C with no unit, wind in km/h, rain in mm. | Display-only conversion behind a kv setting 'wx.units' (default F and mph inside the Texas box). Keep data metric (heat and rain thresholds are metric). 3 sites. |
| B3 | cosmetic | today/QuickLog.tsx:117,202 body temperature accepts C only | Typing 98.6 is rejected ("30 to 45"). | Accept F (value >= 90) and convert, or label the field. Low priority. |
| B4 | ok | weather/heatIndex.ts is the NWS formula in F | none | none |
| B5 | wrong | No US severe-weather source. PAGASA, PHIVOLCS and GDACS are PH only (alerts-ingest/ingest.ts:62,85) | No tornado, flood, hurricane or heat warning for Texas. | New lane after S30 (NWS api.weather.gov alerts). Out of scope here. |

### C. Philippine-only content shown in Texas
| # | Sev | Where | What a Texas user sees | Smallest fix |
|---|---|---|---|---|
| C1 | wrong | src/screens/Today.tsx:85,91,92: PagasaToday, ClimateCard, PlantCard, PricesCard, Lotto render for everyone | "No PAGASA bulletin read", PH drought outlook, "Plant this month" crops, DA market prices in pesos, PCSO lotto. None apply in Texas. | One flag from the place (inPhilippines or a PH home zone) in Today.tsx: hide Climate, Plant, Prices, Lotto when false; keep the PAGASA card with a line "Philippine bulletin" because family are in the PH. |
| C2 | wrong | src/features/garden/climate.ts:64-76 useClimate: province lookup gives null in Texas | The Plant card asks the person to pick a PH climate type. | Covered by C1; with L1's placeProvince returning null, hide, never ask. |
| C3 | ok | today/FxCard.tsx (USD to peso) | Useful for sending money home. | Keep. |
| C4 | cosmetic | garden/daPrices.ts:61-62, FxCard.tsx:15 (peso sign) | Pesos only; there is no other currency in the app. | Leave. |
| C5 | wrong | supabase/functions/world-news/news.ts:11-23 feeds are PH (Inquirer, Rappler, GMA, Philstar, Google News PH) plus WHO and BBC. The zone column exists (migration 0017) and a 'texas' area id exists, but no feed is tagged texas. | Discover and Today news is all Philippine. Nothing local to Texas. | Add one or two Texas feeds tagged zone 'texas' in news.ts (verify a live URL first). No client change. |
| C6 | cosmetic | discover/listen/stations.ts: PH radio | Streams still play from the US. | Leave. |
| C7 | wrong | safety/packs.ts, safety/autoMaps.ts:12, rescuemap/RescueMap.tsx, safety/hazardsLayers.ts: PSGC province packs and PH hazard layers | No pack, evacuation centres or hazard layers for Texas. The auto basemap download finds nothing (returns null, no error). | Leave for S30. The abroad wording already exists (RescueMap.tsx:131). |
| C8 | wrong | safety/SafetyPages.tsx:144 "Away from that area we show no list" | No hospitals or places for Texas. | Leave; the 911 and 2-1-1 rows are there. |

### D. Emergency, crisis, SOS, calls
| # | Sev | Where | What a Texas user sees | Smallest fix |
|---|---|---|---|---|
| D1 | broken | src/features/assistant/gateClient.ts:20,32, EmergencyCard.tsx:6,13, supabase/functions/ask/gate.ts:7, src/features/calm/crisis.ts (crisisLines keeps zone === 'ph' only) | The self-harm card says "call NCMH 1553", which cannot be dialled from the US. The Calm hotline list shows only PH lines. A person in crisis in Texas gets a dead number. | Pass the place into the gate text and button: inside the Texas box use 988 (already in hotlines.json hl-tx-988). crisisLines: include zone 'texas' when the place is in the Texas area. Highest priority in this report. |
| D2 | broken | src/features/safety/dial.ts:52-57 and SafetyPages.tsx:185 (DialRow abroad={plan.abroad}) | In the Texas area plan.abroad is false, so the OFW rows are dialled in local PH form ("1348", "(02) 8722-1144") and fail from the US. Only hl-1348 carries an "abroad:" form. | planDial: dial format = international unless the pick is a PH area or 'ph' (entries.ts:46 abroadNumber). Add a test. |
| D3 | ok | sos/call.ts:32, sos/Call911.tsx, medid/LockMedicalId.tsx:44, auth/FingerGate.tsx:69 | 911 works in Texas. | none |
| D4 | wrong | PH numbers stored as 09xx: family/roster.ts:89 dial(), sos/sms.ts:12-14 smsNumber, family/FamilyPhones.tsx:107, MemberPage.tsx:129, CarerCards.tsx:133,229, IncomingSos.tsx:82, medid/LockMedicalId.tsx:38 | From a US phone, Call and text on a PH relative's 0917... cannot connect; SOS texts to PH contacts fail. A Texas contact typed as (713) 555-0100 works (usableNumber needs 10 digits). | One helper toE164(number, viewerInPh): leading 0 becomes +63 when the viewer is outside the PH, applied in dial() and smsNumber(). One file, two callers. |
| D5 | ok | sos/sms.ts:5 mapLink (maps.google.com) | Works anywhere. | none |
| D6 | wrong | SOS time text (SosScreen.tsx:74,190) uses clockIn, the sender's phone zone: correct for the sender | The receiver sees Manila time (A6). | Covered by A6 |

### E. Jack (assistant)
| # | Sev | Where | What | Smallest fix |
|---|---|---|---|---|
| E1 | wrong | supabase/functions/ask/logic.ts:102 ("one family in the Philippines") and safety rule 5 (PHIVOLCS, PAGASA, DRRMO); ask/index.ts sends no place | Jack points to PH agencies for hazards and cannot know the member is in Texas. Health and medicine answers are fine. | Client sends a coarse `region` ('ph' or 'us-tx'; no position) and the prompt branches rule 5. Crisis text is the client gate (D1). |
| E2 | cosmetic | assistant/cap.ts:7 daily question cap | Resets at 10 AM Texas. | Leave. |
| E3 | cosmetic | assistant/Assistant.tsx:305 speech language 'en-PH' | Recognition tuned to PH English. | navigator.language outside the PH. Low. |

### F. Place sharing, family map, location
| # | Sev | Where | What | Smallest fix |
|---|---|---|---|---|
| F1 | wrong | src/features/location/place.ts:15-23 resolvePlace: no GPS or a stale fix falls back to the last PH home zone; HOME_ZONES has two PH zones only (geo.ts:17) | A Texas member who has not allowed location, or whose fix is old, sees Bohol weather and "Dampas" as their place. A live fix in Texas reads "Away · Dampas" (placeWords.ts:30), even for someone who lives there. | L1 owns "location follows everything": add a member-chosen home place (id, name, lat, lon, tz) set once in Setup. Needs an owner decision. |
| F2 | cosmetic | src/features/family/PlaceMap.tsx:25 fitBounds over PH and Texas points | With one member in Texas and the rest in the PH the map zooms out to the whole Pacific; pins are tiny. | If points span more than about 3000 km, fit the biggest cluster and add a chip "1 away". |
| F3 | wrong | location/placeWords.ts:12,30, nearestPlace.ts (barangay packs, PH only) | The place name reads "Texas" or "Away · Dampas", no city. | Use the home place from F1. A reverse-geocoder would add a third-party host (ML-45): not recommended. |
| F4 | ok | family/placeAge.ts (grey pin after 6 h) and place sharing are zone free | none | none |

### G. Push, reminders, background jobs
| # | Sev | Where | What | Smallest fix |
|---|---|---|---|---|
| G1 | broken | A1, A2 | dose-watch push and quiet hours | A1, A2 |
| G2 | ok | health/reminders.ts:119-125 local alarms use phone-local dates | Ring at the phone's own 08:00. After A1 server and phone agree. | none |
| G3 | wrong | dose-watch/index.ts:240, logic.ts:37 | Texas changes clocks on the second Sunday of March and the first Sunday of November. A fixed 6 h offset would move every slot one hour off Manila on those days. | Compute the offset with Intl at the instant, in the A1 helper. |
| G4 | wrong | alerts-ingest/ingest.ts:85-95 (tier-1 hazard row per member) | A Texas member gets PH "Signal 3" and M6 quake pushes at any hour. For a family that follows home this may be wanted; the title must say "Philippines". | Owner decision: keep or per-member opt-out. Wording check in the notify templates (L3 owns the function). |

## Not affected
Records and documents (only A11), medicine library and encyclopedia (MedlinePlus), body map, exercise, Calm breathing, Jack's medical answers, PIN sign-in, family messages and photos.

## Numbered fix plan (one build lane, "L8 Texas", after S30 wave 1; about 2 sessions)
Order is by harm. Every step gets a test with hand-computed values: America/Chicago winter 2026-12-01 08:00 = 14:00Z = 22:00 Manila; summer 2026-07-01 08:00 = 13:00Z = 21:00 Manila; plus the two DST change days.
1. D1 crisis line: place-aware self-harm text and button (988 inside the Texas box); crisisLines includes the Texas set. Safety copy: Opus review.
2. D2 OFW rows dial in international form in the Texas area (dial.ts plus test).
3. D4 toE164 for tel: and sms: of PH numbers from outside the PH (roster.ts dial, sms.ts smsNumber).
4. B1 skip the blend call outside the PH (useBlendedWeather.ts); B2 F and mph display setting.
5. C1/C2 Today hides Climate, Plant, Prices, Lotto outside the PH; PAGASA card keeps a "Philippines" label. Depends on L1 (placeProvince null in Texas).
6. A4 dateKicker uses the phone zone.
7. A1/A2/A3/A5/A6/G3: migration people.tz text not null default 'Asia/Manila' with a self-only setter (the phone reports its Intl zone on open; rate limited, ML-08; grants restated, ML-21); shared server helper (dayIn, slotInstant, hourIn) used by dose-watch/logic.ts and _shared/fcm.ts; client helper tzDay/tzMidnight replacing the +08:00 literals listed in A3. Deploy list: dose-watch and every function importing _shared/fcm.ts (grep imports first, ML-22).
8. A8 label other people's times "(their time)" when tz differs.
9. F1 member home place (owner decision) and F2 map cluster.
10. E1 coarse region to Jack; C5 one or two Texas news feeds.
Out of scope: B5 US weather alerts (NWS), C7 US hazard and map packs.

## Needs from the owner
- Should a Texas member keep getting Philippine storm and quake pushes (G4)?
- Add a member-chosen home place for someone who lives abroad (F1)?
- Show temperature in F and wind in mph by default in Texas (B2)?
