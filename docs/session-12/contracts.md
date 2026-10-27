# Session 12 contracts (Phase 3, D-80..D-86)

Fixed before launch; changes only through the orchestrator (ML-02). Source: docs/session-12/PLAN.md rev 2. **The "Rev 2 overrides" block wins over the table below.**

## Base state (orchestrator pre-commit, already in the base sha; lanes never edit these)
- `NOTIFY_KINDS` / `ALERT_KIND` in `src/features/notify/templates.ts` and the byte-identical `supabase/functions/_shared/templates.ts` include kinds `share`, `rollcall`, `kudos` and templates `share_offer`, `share_on`, `share_admin` (A fix round 2: to a member when an admin offers a viewer on their records, no name, tab today), `share_off`, `rollcall_help` (urgent), `rollcall_ask`, `kudos`. Labels added in `inbox/build.ts` KIND_LABEL, `notify/AlertCardToday.tsx` PRIORITY (`rollcall` after `sos`), `admin/desk/systemApi.ts` ALERT_KINDS.
- `templates.test.ts` reads the newest migration that restates `check (kind in (...))` for carer_alerts; until lane A's 0037 restates it, only `share|rollcall|kudos` may run ahead. **Lane A: 0037 must restate the full CHECK in that exact `check (kind in ('a', 'b', ...))` form.**
- `src/features/shell/routes.ts`: `Tab` = `today | health | discover | family | safety` (TABS in that order); view `sharing` (full view, own header); `#discover/<sub>` -> tab `discover`, view `<sub>`.
- `src/App.tsx`: SCREENS has a stub `discover` (renders null) and `sharing` is excluded from tab views. **F1 replaces the stub and adds the `sharing` render and all App hooks.**
- Pinned packages: `@capacitor/push-notifications` 8.1.3, `@capacitor-community/text-to-speech` 8.0.2.
- `.gitignore`: `android/app/google-services.json`.
- `supabase/tests/chain_rehearsal.sql` loads 0001..0036 (no 0028) after its 0006 asserts and ends with `\echo REHEARSAL DONE`. **Each SQL lane appends exactly one `\ir ../migrations/00NN_*.sql` line just above `\echo REHEARSAL DONE`, in migration order (merge conflicts there are the orchestrator's).** Run: WSL `sudo -u postgres createdb x; psql -X -q -v ON_ERROR_STOP=1 -d x -f chain_rehearsal.sql` then the lane's own rehearsal file.

## Rev 2 overrides (Opus review)
- **Sharing (A):** no `carers.accepted_at`. Pending offers live in `public.share_offers (person_id uuid, carer_id uuid, can_write bool, added_by uuid, added_at timestamptz default now(), primary key (person_id, carer_id))`, RLS select for carer, member (`is_self`), admin; no client writes. `share_set(p_on=true)` inserts an offer; `share_accept(p_person, true)` moves it into `carers` and deletes the offer; `false` deletes the offer. `share_set(p_on=false)` deletes the carers row or the offer, and refuses when `is_person_creator(person_id, carer_id)`. 0037 drops `carers_insert/update/delete` (0001) and `carers_admin_insert/update/delete` (0004); `carers_read` unchanged. `my_viewers()` returns `(carer_user_id, display_name, can_write, pending boolean, added_by_admin boolean)` from carers + share_offers. `is_carer_of`/`is_writer_of` are NOT re-created.
- **Privacy copy (A, everywhere):** "Only you, the family admins, and the people you share with can see your records." Admin grid: "Admins can see records to help."
- **Invite (B):** `family-names?invite=<token>` returns `[{first_name, initial, handle}]` (array) or 404; uses `join_claim_peek(p_hash)` (no attempt count); only pin-login `join_claim` counts (5). `invite_tokens` excluded from `export_my_data`. 0038 does NOT touch `dose_watch_prune`.
- **Push (E):** `push_token_claim(p_token text, p_app_version text) returns void` SECURITY DEFINER (deletes other users' rows for that token, upserts the caller's; grant authenticated). Sign-out hook line in `src/features/auth/session.ts` (E owns that line) deletes the own token BEFORE `supabase.auth.signOut`. Channels: `carer_alerts` (importance 5) and `carer_quiet` (importance 2) created before `register()`; tone `normal` alerts between 22:00 and 06:00 Manila go to `carer_quiet`, SOS/Unwell/dose_missed/rollcall_help always `carer_alerts`. `requestPermissions()` for POST_NOTIFICATIONS; Me shows "Alerts are off on this phone" + Open settings when denied (A mounts E's `PushPermissionRow` in Me). Broadcast skips disabled users. 0040 is the only migration that re-creates `dose_watch_prune` (adds invite_tokens > 30 days and push_tokens stale/failed lines). FCM title/body = `renderTemplate(id, {})` exactly.
- **Roll call (I):** direct REST upsert (not the outbox); `rollcall.user_id` set to `auth.uid()` by trigger.
- **SQL style:** `search_path = ''`, `extensions.gen_random_bytes`, qualified `extensions.digest`/`sha256`; rehearsals count only `share%` audit actions (`audit_carers` 0021:63-64 logs carers writes too).
- **AcceptCard** is mounted by J (People.tsx hook). `scripts/golive-s12.ps1` is the orchestrator's.
- **F1** also owns `src/features/assistant/tools.ts` (Jack TABS list).

## Lane K (core loop) exports
```ts
// src/features/today/actions.ts (K)
export function retryUnsentMood(): Promise<'sent'|'none'|'offline'>   // kv mood.unsent; called on reconnect and Today mount
// src/features/today/useDueMeds.ts (K)
export function markTaken(personId: string, medIds: string[]): Promise<number>   // rows logged
// src/features/family/MemberPage.tsx (K) reads today's doses, last mood, last BP for the person (RLS decides; no new RPC)
```
J adds in People.tsx: bubble tap -> `#family/people/<personId>` (K's member page), `<AcceptCard/>` (A) at top, `<StormRollCall/>` (I) when a storm is live.

## Rev 1 contract table (overridden where the block above differs)

### Tables / columns / policies
| Name | Owner | Shape | Readers / writers | RLS |
|---|---|---|---|---|
| `carers.accepted_at, added_by, added_at` | A (0037) | see 3 | `share_set`, `share_accept`, `link_creator()`, service role; readers: carer, owner, admin | `carers_read` only; no client insert/update/delete |
| `invite_tokens` | B (0038) | see 3 | `admin_create_invite`, pin-login (service role) | none for app roles |
| `meds_taken.marked_by` | C (0039) | uuid, trigger-set | trigger; readers: whoever reads the row | not updatable |
| `carer_prefs` | C (0039) | `user_id pk, digest_on bool default true, updated_at` | owner; dose-watch (service) | own row |
| `push_tokens` | E (0040) | see 3 | owner (REST, RLS); dose-watch/broadcast (service) | own rows; cap 3 |
| `rollcall` | I (0041) | see 3 | member/writer carer; family reads | `is_family_member()` select |
| `family_messages.kind (+kudos, recap), about_person` | G (0042) | see 3 | existing message policies | unchanged |
| `carer_alerts.kind` (+`share`,`rollcall`,`kudos`) | pre-commit + A (0037 CHECK) | enum | notify_family, share_set, triggers | unchanged |
| `audit_log.action` (+`share_add`,`share_remove`,`share_accept`,`invite`,`join`) | A (0037) | enum | share RPCs, B's RPCs | admin read |

### RPCs / functions (all SECURITY DEFINER, `search_path = ''`, grants restated)
| Signature | Owner | Callers | Returns / errors | Rate limit |
|---|---|---|---|---|
| `share_set(p_person uuid, p_carer uuid, p_can_write bool, p_on bool) returns text` | A | A `sharing/api.ts`, `admin/api.ts` | `'pending'|'removed'|'unchanged'`; `42501` not allowed; `22023` bad target; `53400` too many | 30/h per caller |
| `share_accept(p_person uuid, p_accept bool) returns bool` | A | A `AcceptCard` | true when a row changed | `pin_try` 30/h |
| `my_viewers()` | A | A | table (see 3) | - |
| `admin_share_grid()` | A | A `desk/Sharing.tsx` | table; `42501` non-admin | - |
| `admin_create_invite(p_user uuid) returns text` | B | B `desk/Members.tsx` | plain token once; `42501`; `22023` member has a PIN | 20/h per admin |
| `join_claim_check(p_hash text)`, `join_claim_use(p_hash text)` | B | pin-login only | see 3 | 5 checks per token |
| pin-login action `join_claim {token, pin}` | B | B `pinLogin.ts joinPort` | `{ok:true}` or `{ok:false, why:'bad_invite'|'taken'|'no_signal'}` | 10/h per IP |
| `family-names?invite=<token>` | B | B `JoinFlow` | `{names:[one]}` or 404 | existing 20/15 min per IP |
| `Port.digestOff(userIds: string[]): Promise<Set<string>>` | C declares, E implements | `runDoseWatch` digest rows | user ids with `digest_on = false` | - |
| `isVaccine(m: MedRow): boolean` (`dose-watch/logic.ts`) | C | runDoseWatch, medsToReview | name/form rule, tested | - |
| `flushPush(now: Date): Promise<{webPushed: number, fcmPushed: number}>` (dose-watch) | E | cron, `mode:'flush'` | web push + FCM; `pushed_at` set once | FLUSH_MAX 100, budget 100 s |
| `sendFcm(sa: ServiceAccount, token: string, msg: FcmMessage): Promise<number|null>` (`_shared/fcm.ts`) | E | dose-watch, broadcast | HTTP status; 404 UNREGISTERED -> caller deletes | 8 s timeout |
| `rollcall_alert()` trigger | I | trigger | `need_help` -> family rows | - |
| `family_messages_kudos_alert()` trigger | G | trigger | `kudos` -> member row | - |

### Client exports (exact)
```ts
// src/features/sharing/api.ts (A)
export function setShare(personId: string, carerUserId: string, on: boolean, canWrite?: boolean): Promise<'pending'|'removed'|'unchanged'|'offline'|'refused'>
export function acceptShare(personId: string, accept: boolean): Promise<boolean>
export function myViewers(): Promise<Viewer[]>                   // {carerUserId, displayName, canWrite, acceptedAt|null, addedByAdmin}
export { AcceptCard } from './AcceptCard'                       // mounted by J in People.tsx
// src/features/notify/DigestToggle.tsx (C)
export default function DigestToggle(): JSX.Element | null       // null unless carerOf.length > 0
// src/features/health/medName.ts (J)
export function shortMedName(name: string): string
// src/features/notify/fcm.ts (E)
export function watchPushForSession(): () => void
export const CHANNEL_ID = 'carer_alerts'
// src/features/discover/index.ts (F1)
export type DiscoverSub = 'learn'|'listen'|'play'|'watch'|'news'
export function registerSub(sub: DiscoverSub, Screen: ComponentType): void
// src/features/discover/learn/pick.ts (F2)
export function articleText(id: string): string | null
// src/features/discover/listen/tts.ts (F4)
export function speak(text: string, lang: 'en'|'fil'): Promise<void>; export function stop(): Promise<void>; export function available(lang: 'en'|'fil'): Promise<boolean>
// src/features/nudge/replyParse.ts (G)
export function parseReading(text: string): { sys: number; dia: number; pulse?: number } | { ask: string } | null
// src/features/safety/stormMode.ts (I)
export function stormRef(a: Alert): string                       // safety_alerts.id of the live signal
// src/features/today/placeName.ts (J, consumes D)
export const placeNameOf: (place) => string                      // same string on Today, Safety header and AlertBand (S10)
```
kv keys: removed `share.*` (A); new local-only `nudge.kudosOff`, `nudge.bpTimes`, `play.day` (G, F3); `push.token` (E). Templates: `share_offer` (carer: "<name> wants to share their health records with you", tab family), `share_on` (member: "<name> can now see your records", today), `share_off`, `rollcall_help` (safety, "Someone in your family needs help in the storm", family, urgent), `rollcall_ask`, `kudos` (carer cls, "Someone sent you a heart", health). Secrets: `FIREBASE_SERVICE_ACCOUNT_B64` (new, E); `FAMILY_INVITE_TOKEN` (retired, B). GitHub secret `GOOGLE_SERVICES_JSON_BASE64` (E).

## Batch 2 overrides (merge, D-89)
- **Roll call (I, 0041):** no direct writes. Client calls `rollcall_set(p_person uuid, p_storm_ref text, p_status text) returns void` and `ensure_storm_tasks(p_storm_ref text) returns void` (SECURITY DEFINER, authenticated, active family member, live tcws/rainfall/thunderstorm/tsunami safety_alerts row only, 30/h per caller, need_help alert cooldown 30 min per person per storm). No `rollcall_alert` trigger. Storm task `client_id` = `storm:<ref>:<1..4>`. `StormRollCall` hides itself unless a PAGASA signal is live; People renders it unconditionally.
- **Discover registry (F2):** `registerSub`/`subScreen` live in `src/features/discover/registry.ts`, re-exported by `index.ts`; sub modules import from `../registry` (or `..`).
- **Pillbox (G):** dose logging reuses the `markTaken` 3 h same-medicine+slot guard.
- **Learn (F2):** medicine and supplement cards stay hidden until kv `learn.medcards` is true (clinician sign-off).
- **Batch 2 as built (release review):** the round-1 roll call design in the table above is replaced by the overrides here. `nudge.kudosOff` ("pause kudos") is NOT built in this release; extra kv keys `nudge.bpArmed`, `facts.otd`, `discover.news`. `articleText(id, { medcards })` takes the flag so card text is not read out while the cards are hidden. `fetchRollcall(refs)` reads every live zone row of one storm (`stormKey`) and keeps the newest answer per person. Known follow-ups: StormCard's Do now list is static (ticks show on Family only); `ensure_storm_tasks` makes 4 new tasks if the top zone of a storm changes; kudos push waits for the 15-min cron.
