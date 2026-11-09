# Lotto jackpot (lane P2J) - deploy note

Nothing here is applied or deployed. The orchestrator / owner runs it, in this order.

1. Migration `0058_lotto_jackpot.sql` (owner says "apply 0058"). Creates `lotto_next_jackpot(game, draw_date, jackpot_php, fetched_at)` (RLS: signed-in read, service-role write) and nulls placeholder jackpots under P5,000,000 on six-number rows of `lotto_results`. `lotto_results.jackpot_php` already exists (0054), so the last result's jackpot needs no new column. Undo: `0058_lotto_jackpot.down.sql`. Afterwards add 0058 to `src/data/migrations.json`.
2. Deploy `lotto-pcso` (`--no-verify-jwt`, as before; no new secret). Only this function bundles `lotto.ts`. Applying 0058 first is not required: if the table is missing, the next-jackpot write fails quietly and results still go in.
3. Run the function once (the cron already calls it) and check: `select * from lotto_next_jackpot;` should show the Stand by draw (for example 6/58 Ultra Lotto, today or the next draw day) with its jackpot; `select game, draw_date, jackpot_php from lotto_results order by draw_date desc;` shows real amounts for 6/xx rows and null instead of P1.00.
4. App: `src/features/today/lottoApi.ts` exposes `jackpot_php` (number or null) on each row, `useLotto()` returns `{ rows, next }`, and `nextJackpotFor(next, latestRow)` gives the next draw's jackpot (null when none). Lane L2 wires them into `Lotto.tsx`.

Rules in the function: six-number games only; amount read from "P489,846,673.65" or "P486 Million" / "Billion"; under P5,000,000 is missing; a next-draw row needs a real draw day, today up to 7 days ahead (Manila), no posted numbers, and one agreed jackpot per draw. Rows are purged when the draw day is before today. 4D/6D keep their first prize in `jackpot_php` as before (not a jackpot; the card does not show it).
Source: https://www.lottopcso.com/ (unofficial mirror of PCSO results, D-153).
