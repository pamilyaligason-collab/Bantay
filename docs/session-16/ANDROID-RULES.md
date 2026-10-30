# Android mobile design rules that apply to Bantay (session 16, N-6)

Read 2026-10-30 from developer.android.com/design/ui/mobile (accessibility, system-bars, layout-basics, predictive-back,
material-overview, patterns/settings, layout-and-nav-patterns). The m3.material.io navigation bar and top app bar pages did not load,
so their sizes are not stated here and nothing below is guessed.

## Navigation
- The navigation bar holds 3 to 5 top-level destinations of the same level. Bantay keeps 5: Today, Health, Discover, Family, Safety.
- Tabs and bottom app bars are secondary navigation, used inside a destination (Health sub-tabs, N-15).
- One primary action per screen (a FAB or one main button); less-used actions in an overflow menu.
- Settings is secondary navigation: reached from the top bar (the avatar, as now), never a tab. Call it "Settings".

## Settings (N-5)
- 15 or more settings: group them under subscreens opened from an overview list; the row label equals the subscreen title.
- Group with headings or containment; rows have a label, supporting text, icon and control.
- On/off is a switch; multiple choices in a dialog or a child screen, not inline radio rows.
- A dependent setting sits under its parent with a short reason it is unavailable.
- Labels start with the key word; avoid Set, Change, Edit, Manage, Use, Select, Choose; do not repeat the section title.
- Frequently used actions sit next to the feature they change, not in Settings. App version and account management stay out of the
  settings list (an "About" and an "Account" row may lead there).
- Respect system settings (text size, dark theme) instead of overriding them.

## Touch, text, contrast
- Every touch target at least 48 dp (Bantay rule is 48 px already).
- Text scales with the system font size; body text never below 12 sp. Bantay tests 200% text as a 195 px viewport.
- Text contrast at least 4.5:1; icons and control outlines at least 3:1. Never colour alone for meaning (section accents, N-17, always come
  with an icon and a label).
- Gestures always have a visible button too (swipe to dismiss a warning, N-10, also has a close button).

## Edge-to-edge and back
- Android 15 enforces edge-to-edge: draw behind transparent bars, pad with safe-area insets, no tap targets under the gesture insets.
- Predictive back: sheets and sub-pages must close on system back; the native shell opts in, the web layer keeps one history entry per
  sub-page so back returns to the parent.
