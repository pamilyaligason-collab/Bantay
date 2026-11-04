# Weather blend for hyperlocal forecasts (research 2026-10-31)

The owner has an OpenWeather key (`OPEN_WEATHER_API_KEY`, activating within hours; a scheduled check `bantay-openweather-activation-check` tests it every 3 h until 1 Nov 22:00 Manila and logs to the vault `research/openweather-activation-log.md`).

## Sources (checked on the provider pages, 2026-10-31)
| Source | Free terms | What it adds | Notes |
|---|---|---|---|
| OpenWeather Free plan | 60 calls/min, 1M/month; Current, 5-day/3-hour, Air Pollution, Geocoding, Maps 1.0 | current conditions, AQI | attribution required (credit, link, logo); commercial use allowed per FAQ |
| OpenWeather One Call 3.0 ("One Call by Call") | 1,000 calls/day free, then GBP 0.0012/call; card requirement UNVERIFIED; default daily cap 1,000 vs 2,000 UNVERIFIED | minutely rain 60 min, hourly 48 h, daily 8 d, government alerts (PAGASA listed) | minutely method for PH unknown: treat as model until compared with PAGASA radar |
| Open-Meteo (today) | 10,000 calls/day, **non-commercial only**, CC BY 4.0 | blended global models | paid plan needed if Bantay ever earns money |
| MET Norway Locationforecast | free, identifying User-Agent required, honour Expires, CC BY 4.0 | independent second model | commercial redistribution terms on its Licensing page not read yet |
| Visual Crossing | 1,000 records/day, commercial OK (fair use) | fallback model | attribution rule not stated |
| WeatherAPI.com | ~100K calls/month, commercial OK, link-back | short-range fallback | monthly cap conflicting in sources |
| aviationweather.gov METAR | no key, 100 req/min | ground truth: RPVT Tagbilaran (Bohol-Panglao), RPMR General Santos, RPVM Mactan | licence text not on page (US gov data, likely public domain: UNVERIFIED) |
| PAGASA | no forecast API | official warnings via CAP feed (already ingested) | always shown as the official word |

## Recommended design (lane Q)
1. Edge function `weather-blend` (server-side only; keys in Supabase secrets): fetch Open-Meteo + MET Norway + OpenWeather One Call for a cell, median per hour, drop missing providers; minutely rain only from OpenWeather; alerts from PAGASA CAP first, OpenWeather alerts second.
2. Cache table keyed by rounded lat/lon (2 decimals, about 1.1 km) with 30 min TTL; family members in the same cell share one fetch. Budget: ~3-5 cells x 48 refreshes = under 250 calls/day per provider, inside every free cap.
3. Hourly bias check against the nearest METAR station; store the offset per station and show "checked against Tagbilaran airport" when used.
4. App: one hook returns {now, next2h (minutely or interpolated, labelled), hourly48, daily10, aqi, sources[]}; credits in the Weather footer (OpenWeather logo + link, MET Norway, Open-Meteo CC BY 4.0).
5. Before release: confirm OpenWeather card/cap in the dashboard, MET Norway licensing page, Open-Meteo plan if commercial.

## Status (Phase 2, 2026-11-05)
Built and tested, flag off. Migration `0047_weather_cells` (+ `.down.sql`) is written and **not applied**. The Weather screen reads the blend only when `bantay.flag.wx.blend` is `1` on the device; `WEATHER_BLEND_ON` stays `false`.
To take it live (owner): set the `OPEN_WEATHER_API_KEY` secret, apply 0047, deploy `weather-blend`, then turn the flag on per device. Tests for the function run under vitest (`npx vitest run supabase/functions/weather-blend`), not `deno test`.

**Owner steps, in this order.**
1. In the OpenWeather dashboard, set a daily call cap on the One Call plan (at or below the 1,000 free calls a day) BEFORE the key goes into the function. With the cap set, a cache fault costs at most one day of free calls, never a bill.
2. Apply 0047 (it grants `service_role` explicitly), then set `OPEN_WEATHER_API_KEY` and deploy `weather-blend`.
3. Smoke test once from a signed-in session: the first call for a cell returns `cached:false`, a second call for the same cell returns `cached:true`. If the second one is not cached, stop and read the function log: the function logs `weather_cells read failed` or `weather_cells write failed` with the error code only (never a position or the key). On a read failure it skips the paid source on purpose.
4. Only then turn the flag on per device.
