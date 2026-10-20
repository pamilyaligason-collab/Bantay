# Assets and licences

Checked gztchan/awesome-design and noahelhadedy/400-free-design-resources. Only entries with an explicit open licence are kept.

| Item | Used | Licence | URL |
| --- | --- | --- | --- |
| canvas-confetti | Yes, `celebrate()` | ISC | https://github.com/catdad/canvas-confetti |
| @types/canvas-confetti | Yes, dev types only | MIT | https://www.npmjs.com/package/@types/canvas-confetti |
| @capgo/capacitor-health 8.11.12 | Yes, Health Connect and HealthKit reads (native app) | MPL-2.0, used unmodified, GPL-3.0 compatible via MPL section 3.3. Keep its licence notice. | https://github.com/Cap-go/capacitor-health |
| @capacitor/core, cli, android, ios 8.5.3 | Yes, native shell | MIT | https://github.com/ionic-team/capacitor |
| Fraunces (600, opsz 36, Latin subset woff2 in `public/fonts/fraunces-600.woff2`) | Yes, display headings | SIL OFL 1.1, Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces). Instanced and subset from the Google Fonts repo file; no Reserved Font Name is claimed. | https://github.com/google/fonts/tree/main/ofl/fraunces |
| Plus Jakarta Sans (400, 600, 700, Latin subset woff2 in `public/fonts/jakarta-*.woff2`) | Yes, UI text | SIL OFL 1.1, Copyright 2020 The Plus Jakarta Sans Project Authors (https://github.com/tokotype/PlusJakartaSans). Instanced and subset from the Google Fonts repo file. | https://github.com/google/fonts/tree/main/ofl/plusjakartasans |
| @tabler/icons-react 3.49.0 | Yes, every `<Icon name>` glyph (`src/features/shell/Icon.tsx`) | MIT, Copyright (c) 2020-2024 Paweł Kuna. Keep this licence notice. | https://tabler.io/icons |
| Hand-drawn icons: kidney, stomach, quake, typhoon (`src/features/shell/icons/custom.tsx`) | Yes, same props as Tabler icons | Own work, no third-party source. | none |

Known but unused (nothing downloaded). The list pages state no licence, so these are the upstream licences, noted for later:

| Item | Upstream licence | URL |
| --- | --- | --- |
| Lucide | ISC | https://lucide.dev |
| Iconoir | MIT | https://iconoir.com |
| Open Doodles | CC0 | https://www.opendoodles.com |
| unDraw | unDraw's own licence (free to use, no attribution, no reselling as a library) | https://undraw.co |

## Body art for Explore your body (D-69 design pass, lane L4)

Shipped file: `public/anatomy/body.svg` (one sprite, about 125 KB gzipped, one `<g id>` per layer: body, skeleton, muscles, heart, lungs, brain, digestion, kidneys, skin, hormones). Every shape was simplified, flattened to the shared 140 x 310 frame, merged into runs and recoloured to app colour variables (`--a0` to `--a4`, `--b0` to `--b4`, `--bd`, `--bo`), so no source colour or text label ships. Nothing was copied verbatim. All files were downloaded from Wikimedia Commons on 2026-10-19 and the licence was read from each file's own page (MediaWiki API, `LicenseShortName`). Public domain and CC0 need no credit, the credit is given anyway on the screen: "Illustrations: Mariana Ruiz Villarreal (LadyofHats), Mysid, johnbloor and the US government, public domain or CC0, from Wikimedia Commons."

| Source file (Commons) | Author | Licence | Used for | URL | Checked |
| --- | --- | --- | --- | --- | --- |
| Circulatory_System_no_tags.svg | LadyofHats (Mariana Ruiz Villarreal) | Public domain | Shared body outline (layer `body`) and the heart and blood layer | https://commons.wikimedia.org/wiki/File:Circulatory_System_no_tags.svg | 2026-10-19 |
| Human_skeleton_front_no-text_no-color.svg | LadyofHats (Mariana Ruiz Villarreal) | Public domain | Skeleton layer, re-traced to three tones | https://commons.wikimedia.org/wiki/File:Human_skeleton_front_no-text_no-color.svg | 2026-10-19 |
| Human_muscle_system_simple_diagram_unlabeled.jpg | johnbloor | CC0 | Muscles layer, traced from the photo-style image into four tones | https://commons.wikimedia.org/wiki/File:Human_muscle_system_simple_diagram_unlabeled.jpg | 2026-10-19 |
| Respiratory_system_complete_gl.svg | LadyofHats | CC0 | Lungs and windpipe layer (lobes and diaphragm only, bronchial detail dropped) | https://commons.wikimedia.org/wiki/File:Respiratory_system_complete_gl.svg | 2026-10-19 |
| Digestive_system_diagram_edit.svg | Mariana Ruiz, edited by Joaquim Alves Gaspar and Jmarchn | Public domain | Digestion layer (gullet, liver, stomach, bowels) and the pancreas in the hormones layer | https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_edit.svg | 2026-10-19 |
| Illu_urinary_system.svg | Arcadian, derivative work by Thstehle (US government illustration) | Public domain | Kidneys, ureters and bladder layer, and the adrenal glands in the hormones layer | https://commons.wikimedia.org/wiki/File:Illu_urinary_system.svg | 2026-10-19 |
| Brain_diagram_without_text.svg | Mysid, arrows by Was a bee | Public domain | Brain layer, shown enlarged over the head | https://commons.wikimedia.org/wiki/File:Brain_diagram_without_text.svg | 2026-10-19 |
| Skin.svg | US-Gov | Public domain | Skin section layer | https://commons.wikimedia.org/wiki/File:Skin.svg | 2026-10-19 |
| Endocrine_central_nervous_en.svg | LadyofHats | Public domain | Pituitary area and thyroid in the hormones layer | https://commons.wikimedia.org/wiki/File:Endocrine_central_nervous_en.svg | 2026-10-19 |
| Spinal cord and nerve lines (layer `brain`) | Drawn for this app | Own work | Cord and nerve lines | none | 2026-10-19 |

Tools used to build the sprite are throwaway scripts (browser flattening, svgpath, potrace), not shipped and not dependencies.

Looked at and not used:

| Source | Why not |
| --- | --- |
| Servier Medical Art, https://smart.servier.com (site licence CC BY 4.0) | The site only offers PNG and PowerPoint files, no SVG. The SVG-like copies on Wikimedia Commons are CC BY-SA 3.0, which this lane skips. No Servier art ships, so no Servier credit is shown. |
| Files tagged CC BY-SA or non-commercial on Commons (for example the OpenStax muscle plates, Wapcaplet heart, Jordi March kidney and urinary diagrams) | Share-alike or non-commercial terms. Skipped as instructed. |
| Wikiman 1m80.svg, Patrick J. Lynch brain diagram | CC BY 2.5. Allowed, but a public domain brain diagram fitted better. |
