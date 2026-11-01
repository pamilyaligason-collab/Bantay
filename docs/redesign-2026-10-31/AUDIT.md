# Bantay design audit (2026-10-31, live app, before the Apple-style refresh)

⚠️ DEGRADED: single-context. Lloyd's phone screenshots exist only in the main chat, so the review and the detector ran in one context.

Sources: the live site bantay.pages.dev (main b5937d4), signed in as Loyd (admin), 375x812 dark. Lloyd's 4 phone shots (light, 19:04-19:05). Detector `impeccable detect.mjs` over today/health/family/discover/safety/shell/look: 13 findings. Apple HIG notes from the vault (2026-10-13 lesson, read in full) and an Apple-pattern research pass (Apple Support 102262, Apple Newsroom 2025-06 Liquid Glass).

Scope: layout and template only. Lloyd: "current features are already ok, issue is the template design and app layout".

## 1. Verdict

The features are good, but the app shows them all at the same volume. Every tab is a stack of same-sized rounded cards with an icon and two grey lines, so nothing says "this is the point of this tab". Apple apps do the opposite: one big live object at the top (Health's Pinned summary, Fitness rings, the Find My map, a Wallet card), then grouped lists that open sub-pages. Bantay needs that hierarchy, not new features.

## 2. Nielsen scores (0-4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | System status | 3 | "Checked 5 min ago" and weather times are good. The Health hero hides whose data you see. |
| 2 | Real world | 3 | Plain words and Tagalog first-aid names are good. "pamilya" shows as a person chip. |
| 3 | User control | 2 | Health silently opens on another member. View-as and the person chips do overlapping jobs. |
| 4 | Consistency | 2 | SOS shows 3 ways (Today pill, Safety disc, Jack menu planned). Cards, rows and chips mix with no rule. |
| 5 | Error prevention | 3 | Hold-3-seconds SOS is sound. A big red target in the scroll path of Today invites accidental holds. |
| 6 | Recognition | 2 | Icon-plus-word tiles (BP, Sugar, Learn, Watch) hide what is inside until tapped. |
| 7 | Flexibility | 3 | Simple mode, Ask, and quick dial are good. |
| 8 | Minimalist | 1 | Today has 14 blocks of equal weight. Family runs about 60 items on one page. |
| 9 | Error recovery | 3 | Missed-medicine actions are clear. |
| 10 | Help | 3 | Ask Bantay prompts are good. |
| | **Total** | **25/40** | Fair: solid features, weak hierarchy |

## 3. Priority issues (P0 = fix in the refresh)

### P0-1 Today has no main focus
Live order: greeting, weather hero, quake card, missed-medicine notice, a 6-tile grid (BP, Sugar, Weight, How are you, Water, More), salt line, a red Hold for help pill, Take a breath, See the week, a setup list, Your week, then the Jack button. That is 14 blocks, and the 3 loudest are the weather (navy), the quake card (brown) and SOS (red). The user's own day (medicines due, check-in, readings) sits under them in small tiles.
Fix direction: one hero that answers "what do I need to do today", then glanceable family status, then everything else as a grouped list.

### P0-2 SOS competes for attention and is in the wrong place
A red pill in the middle of Today (phone shot 1, live dark shot) pulls the eye away from the day. It also sits where a thumb scrolls. Apple keeps SOS out of app content: it is a hardware gesture plus Medical ID (Apple Support 102262).
Fix direction (Lloyd's idea): Jack becomes the one action button. Tapping it opens a sheet with Help (hold), Scan and Chat. The Safety tab keeps the full emergency screen. Today loses the pill.

### P0-3 Health opens on another member for the admin
Live and phone: the picker lands on "Ma" (selected chip at the far right, partly off screen) instead of "Me". Code: `useHealthData` picks `chosen`, else the signed-in person, else the first person. Something sets `chosen` before the admin's own id is known (root cause to be found in the build, `src/features/records/useHealthData.ts:46`).
Fix direction: the admin always lands on Me. Other members are reached on purpose (a "Family" switcher or View as), never by default.

### P0-4 Health hero breaks for a member you can only view
Phone shot 4 and live: "No readings yet" copy, a faded body silhouette, a "View only" pill and a "Scan" pill all overlap. "View" is clipped behind its own pill and "Scan" overflows the card. The lock message is set in the same space as the call to action.
Fix direction: a separate read-only state. A name header with a "View only" badge, the data, and no log or scan buttons.

### P0-5 Location defaults to Dampas
The Today header says "Saturday, Oct 31 · Dampas" and weather says "Dampas (saved zone)" (phone shot 3). `resolveLocation` falls back to the saved zone, default Dampas, whenever GPS is not already granted or times out (`src/features/location/useLocation.ts:36`).
Fix direction: decide with Lloyd (Q&A). Options: phone location first with an honest "Location off" state, or no default zone.

### P0-6 Sub-page header sits under the status bar
Phone shot 2 (ALT lab page): the back button and the "ALT" title overlap 19:05 and the signal icons. The safe-area top inset is missing on detail pages.

## 4. Per tab

**Today**: see P0-1, P0-2, P0-5. Tiles: BP, Sugar and Weight are log buttons that look like stats but show no value. "How are you?" + I'm OK is a different control inside the same grid. The salt line floats with no container. "See the week" and "Your week" are two rows for one idea. The setup list ("2 left: Health data, SOS contacts") is fine but should be a dismissible banner at the top or live in Settings. "Family alerts also show here." is an empty-state sentence shown as a card.

**Health**: see P0-3, P0-4. "At a glance" is 4 pastel tiles (Progress, Medicines, Labs, Video) with one grey line each. They hold real data ("4 of 4 left today", "4 to ask · 6 Oct") but present it as captions. "More in Health" is 4 more tiles of the same size, so the summary and the menu look identical. Video is content, not health status. The 10-chip person row (Me, David ... Susana, "pamilya") is a scroller with no sign of more. The detail page (ALT) is good: a big number, a range bar and a High badge. Keep that pattern and make it the model for the summary.

**Discover**: Today's pick with the Jack art is the one place with a real hero. Good. Below, Learn, Watch, Listen, Play and News are 5 equal tiles with no preview (no thumbnail, no first item). "Undas" is a strong seasonal row but reads as a tip, not a feature.

**Family**: the strongest data and the most crowded page. Order: my own Medical-ID card, "Needs you now" (7 things, each with several buttons), "Everyone today" (10 people, "0 of 10 OK"), Messages, Plan, a month calendar with 7 dose rows, then Memories. The headline "0 of 10 OK" is buried mid-page. The admin's own card at the top belongs in Me or Health. Seven "Still taking X?" answers in a row is a queue and should be one row with a count.

**Safety**: clear sections (Emergency, First aid, Alerts, Hotlines, Be ready). The 3-second SOS disc plus Call 911 and Medical ID is the right home for emergency. The first-aid list is 17 two-language rows: good content, long scroll. Fine as-is structurally; it needs the shared look.

**Settings**: already close to iOS (grouped rows with icon, title, subtitle, chevron). Keep it as the model for lists.

**Jack button**: today it opens Ask Bantay (chat) straight away. Hidden on Today (shot 3 shows it over the SOS pill, so it is present on phone). It covers card content at the right edge on every tab (Health "Body wiki", Family "Mark taken").

## 5. Detector (13 findings, all warnings)

- side-tab accent border x7 (thick coloured left edge on cards, e.g. the missed-medicine notice): agrees with the review. It reads as template UI. Use a tinted icon or badge instead.
- layout-property transitions x5 (width/height/padding animated): performance, not visual. Fix in the build.
- overused font x1: the detector flags the display serif or the sans as a common AI-era font. Matters only if we keep the current type pairing.
No false positives worth noting.

## 6. Visual system (current)

v6 tokens: cream background, deep green primary, serif display headlines, pastel hue families (blue, green, lilac, amber, terracotta), rounded 24 px cards, a floating pill tab bar. It looks warm, but it does not look like Apple: Apple uses the system font, a grouped-grey (light) or black (dark) background, white inset groups, system tints and Liquid Glass bars. The direction is a Q&A item, because D-66 (v6 is final) would be superseded.

## 7. Strengths to keep

1. Plain-language copy, bilingual first aid, honest "checked N min ago" status.
2. The lab detail page (big value, range bar, High badge).
3. Discover's hero with Jack art; the Jack mascot as brand.
4. Settings' grouped list.
5. Safety's section order.
