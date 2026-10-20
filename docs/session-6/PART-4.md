# Session 6, Part 4: mockups, usability script, build lanes

As of 2026-10-20.

## 4a. Mockups
One private Artifact, 390px phone, light and dark: https://claude.ai/artifact/Anc9M12iGsoJ8ry1uC6x8f (private; Lloyd shares if wanted)
Screens: Today (normal and simple; "My week" personal KPIs and a one-line family card replace the family list), Health > Medicines, medicine edit sheet, delete with undo, Weather, Safety home
and Quick dial (zone with and without local numbers), Family status. All names and numbers are sample data.

## 4b. Usability script (moderated, 20 minutes per person, on the person's own phone)
Run with the mockup first (before build), then again on the built APK (after build). 4 sessions: one per persona
(P1 by video call, P2 and P3 in person or video with the phone camera, P4 any). Record only notes, no screen video
with real data.

**Setup (2 min)**
- "We are testing the app, not you. Think aloud. There are no wrong answers."
- Confirm the phone has the mockup link open (round 1) or the new APK (round 2).

**Tasks** (read aloud; do not point or help; note time, taps, hesitation, words they use)
| # | Task | Persona | Success | Watch for |
|---|---|---|---|---|
| T1 | "It is 8 in the evening. Show me how you would say you took your evening medicine." | P2 | Taps Taken in Next up within 10 s | Looks in Health first? Reads the time? |
| T2 | "Your mother stopped one of her medicines last month. Remove it." | P3 | Opens Medicines, the row, Stop or Delete; finds Undo | Confuses Stop vs Delete? |
| T3 | "The doctor changed a medicine to twice a day. Change it." | P3 | Edit sheet, picks Morning and Evening, Save | Can they find the time chips? |
| T4 | "From where you are, check if everyone at home is OK today and took their medicines." | P1 | Reads Family status on Today in under 15 s | Scrolls past it? Trusts it offline? |
| T5 | "Is it safe to go out at noon today? What should you do?" | P2, P4 | Reads the action line and repeats the advice | Reads only the temperature? Understands "Danger"? |
| T6 | "Switch the weather to your other home." | P4 | Uses the place toggle | Expects it in Safety? |
| T7 | "Find the number for the nearest hospital or emergency line here." | P4 | Opens Quick dial, local number first | Empty zone message clear? |
| T8 | "There are medicines to check from old prescriptions. Go through them." | P1 or P3 | Opens the card, confirms or edits each | Do they understand "From a prescription dated ..."? |

**Questions after the tasks (5 min)**
1. "What is this app for, in one sentence?"
2. "What would make you open it every day?"
3. "Anything confusing or worrying?" (probe trust in medicine reminders)
4. "English or Filipino labels for the medicine and weather lines?"
5. "Would you want a reminder for a family member's medicine on your phone?"

**Scoring**
- Task success: pass / pass with help / fail. Target: T1, T4, T5 pass for all; no task fails for more than 1 person.
- Severity of each problem: 1 cosmetic, 2 slows them, 3 blocks the task. Any severity 3 is fixed before release.
- Record results in the vault (not in this repo): date, persona code, task, result, quote.

## 4c. Build lanes
Full implementation plan: `docs/plans/2026-10-20-s6-build.md` (lanes, files, tests, gates).
