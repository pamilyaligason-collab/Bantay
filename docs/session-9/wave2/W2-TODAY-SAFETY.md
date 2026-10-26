# W2-TODAY-SAFETY fix round
Branch worktree-wf_ac368f43-134-2 commit f48045e worktree D:\Claude\Bantay\.claude\worktrees\wf_ac368f43-134-2
Build status: done
Builder exit claim: Late-dose state, Simple-mode SOS and tab bar, one-time coach mark and Safety grouping are committed with tsc, full vitest and the Playwright specs green. Today shows a late dose and a visible Simple-mode SOS button.

## Review issues (pass_with_issues)
1. [major] APP-AUDIT top-15 item 12 (lane D) says 'Simple mode: hide tab bar, real SOS button, I'm OK higher on full Today'. The 'I'm OK higher on full Today' part was not done: Today.tsx still renders GreetingBand onOk under the 'More' block at the bottom (Today.tsx:59-60). The builder's risks list does not mention it, so the exitClaim is incomplete against the brief.
2. [major] In Simple mode the real SosButton sits below the fold at 390x844. In docs/session-9/shots/w2-today-safety/today-simple-light.png the SOS circle is cut off at the bottom edge, even in the calm state. With a dose card it moves lower still. You can scroll to it, but the audit's other option was to reserve the three big buttons above the fold, and this does not meet it.
3. [minor] No test covers three new behaviours. (1) The TabBar 8-second auto-dismiss (TabBar.tsx:22-27): no fake-timer test. (2) The Safety grouping: no spec asserts the five group headings or which tile lands in which group. (3) The data-simple attribute that hides .tabbar: only the screenshot shows it. G8's 'or on the first scroll/tap' dismiss was not built, only the timer.
4. [minor] The 8 s timer also runs in Simple mode, where the hint is hidden by CSS but `hint` is still true. That marks the coach mark as seen although the user never saw it.
5. [minor] Dead CSS left behind. `.sf-act-sec` (safety.css:122) is no longer used now that FirstAid uses Group. `.bt .td-bigbtn.sos` (today.css:87) is no longer used now that the Simple SOS link is removed.
6. [minor] The late-dose colours are hard-coded (#000 mix and #F5C468 in today.css:230-231), not tokens. I computed AA and it passes: late bg vs on-green text is 13.16 light / 8.23 dark, the p at .9 opacity is 10.91 / 7.03, the kicker is 9.15 / 5.72. The group tints also pass: h2 is 10.04 to 14.56, sub text at .85 opacity is 7.77 to 9.56, in both themes.
7. [minor] Style: FirstAid.tsx puts `import { Group } from './Group'` above the react import, which does not match the file's import order. The 'Be ready' group and moving 'Past SOS' under Hotlines go beyond the four groups Lloyd named (the builder disclosed this).

## Builder needs
- Orchestrator merge into the wave branch. This worktree was fast-forwarded to claude/cache-ttl-cost-39e7cd (fc9450c) first, because it was cut from older main without wave 1.

## Builder risks
- Simple-mode data-simple attribute is only exercised in the browser (screenshot shows the tab bar gone), not asserted in a test.
- No Playwright spec exercises Simple mode directly beyond the today-auth screenshot; the SOS button is covered by a vitest test.
- Late-dose card shows the whole 2h on-time window; no e2e for it, only vitest.
- Other lane D top-15 items (Quick log icons, water glyph, BP placeholder, Quick log order) were not touched. QuickLog and WeatherCard are outside this lane's file list, and the weather heat number was done in wave 1.
- Safety tint contrast was checked by eye in screenshots plus the existing axe checks in the specs, not by a computed AA ratio.
- Safety Past SOS moved under Hotlines and Go-bag plus Safety cards under a new Be ready section, which is my call beyond the four groups Lloyd named.