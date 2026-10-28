# Jack Jack: prompts for more versions

Use with any image tool that accepts a reference picture (ChatGPT image, Gemini, Midjourney `--cref`, Ideogram, Firefly).
**Always attach the official art** as the character reference: `ui-references/jack-jack-mascot-official.webp` (vault, family-bantay).
Make one version per run: paste the **Base prompt**, then add **one** line from the **Versions** list.

## Base prompt (paste every time)

```text
Use the attached picture as the exact character reference. This is Jack Jack, the friendly mascot of a Filipino family health app.
Keep him the same dog in every detail: a small, lean tan-and-white dog (Jack Russell / native Filipino aspin mix); a white blaze
down the middle of the face and a white muzzle, chest and front legs; warm golden-tan ears and cheeks; big upright ears with pink
insides, the right ear slightly tilted; round amber-brown eyes with a bright catch-light; a black nose; a soft, friendly smile.
Same proportions, same colours, same fur pattern, same face shape as the reference.
Style: soft, polished 3D-illustration look like the reference, gentle studio light, clean fur detail, warm and kind, never scary.
Background: plain transparent (or pure white if transparency is not possible), no floor shadow, no text, no logo, no frame.
Framing: whole character visible with a little space around him, centred, square 1:1 image.
Accent colour, only if the scene needs small motion marks or a prop highlight: warm amber #E8A93A; any clothing or props in
deep green #1F3D2B or cream #F6F1E7. Nothing else coloured strongly.
```

## Versions (add one line after the base prompt)

| # | Name | Where the app uses it | Add this line |
|---|---|---|---|
| 1 | Hello | Welcome, sign-in, Ask button | `He waves one front paw at the viewer, big happy smile, tongue slightly out, three short amber motion marks beside the paw.` |
| 2 | Head only | Small round avatar on the Ask button | `Head and top of the neck only, facing the viewer, gentle smile, mouth closed, centred for a circle crop.` |
| 3 | Well done | Dose marked taken, check-in "I'm OK" | `He sits up proudly, eyes happily squinted, a small amber check-mark badge floating beside him.` |
| 4 | Sits with you | A high reading, a hard moment | `He sits calmly close to the viewer, ears slightly lowered, soft caring eyes, mouth closed, one paw resting gently forward. Calm and kind, not sad, not worried.` |
| 5 | Thinking | Loading, Ask Jack is answering | `He tilts his head to one side, one ear up, curious eyes looking up, small amber dots above his head.` |
| 6 | Reading | Discover > Learn, Health reads | `He lies down reading an open cream-coloured book held between his front paws, focused and content.` |
| 7 | Cooking | Recipes, cook mode | `He stands on his back legs wearing a small deep-green apron, holding a wooden spoon, a small pot of sinigang (sour tamarind soup) beside him.` |
| 8 | Listening | Discover > Listen | `He wears soft deep-green over-ear headphones, eyes half closed, relaxed smile, small amber music notes.` |
| 9 | Watching | Discover > Watch | `He sits holding a small bowl of popcorn, looking slightly to the side as if watching a screen, delighted.` |
| 10 | Playing | Discover > Play, games | `He plays with a cream-and-green ball, mid-bounce, ears flapping, playful.` |
| 11 | Walking | Move, steps | `He trots forward mid-stride, tail up, cheerful, a small deep-green leash trailing.` |
| 12 | Drink water | Heat advice, water log | `He holds a clear glass of water with both front paws, a small amber sun symbol behind him.` |
| 13 | Ready for rain | Storm and typhoon advice | `He wears a small deep-green raincoat with hood, standing steady and calm, a closed umbrella beside him. Calm, prepared, not afraid.` |
| 14 | Sleepy | Night mode, bedtime, Simple mode at night | `He is curled up asleep on a small cream cushion, eyes closed, peaceful.` |
| 15 | Family hug | Family tab, family recap | `He hugs a small soft heart-shaped cream pillow, eyes closed, warm smile.` |
| 16 | Medicine helper | Medicines, pillbox | `He sits beside a small weekly pillbox (seven compartments, cream and green), pointing to it with one paw, encouraging smile.` |
| 17 | Celebrate | Streaks, milestones | `He jumps with all four paws off the ground, joyful, a few amber confetti pieces around him.` |
| 18 | Offline | No internet | `He holds an unplugged cable in his mouth, puzzled but cheerful, one ear flopped.` |
| 19 | Empty list | Nothing here yet | `He peeks out from behind a plain cream box, curious, only head and front paws visible.` |
| 20 | Get help | SOS, call family | `He stands alert and focused, ears up, looking directly at the viewer, one paw raised toward the viewer as if to say "I'm here". Serious but calm, never frightened.` |

## Keep him consistent

- Make all versions in the **same chat or project**, with the official art attached each time.
- Generate 3 to 4 options per version and keep the one whose face, ear shape and fur pattern match the reference best.
- If a version drifts (wrong colour, different breed, extra spots), regenerate with: `Match the reference face and fur pattern exactly; same ears; same colours.`
- Never use him on screens about a medical emergency result, a death, or a diagnosis; there the app shows plain text only.

## Export for the app

- Transparent PNG, 1024 x 1024, then convert to WebP (quality about 85) for the app.
- Small sizes for the Ask button: 128 x 128 and 256 x 256 (version 2, head only).
- File names: `jack-<name>.webp`, for example `jack-hello.webp`, `jack-sits-with-you.webp`.
- Give each one plain alt text in the app, for example "Jack Jack waving hello".
