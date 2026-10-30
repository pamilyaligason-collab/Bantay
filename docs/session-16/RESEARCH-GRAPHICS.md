# Family Bantay: graphics and dynamic background research (2026-10-30)

Method: WebFetch of npm registry, bundlephobia, GitHub API, and licence pages on 2026-10-30. Anything not fetched is marked **unverified**. Bundlephobia sizes are whole-package minified+gzip, not tree-shaken, so real cost is lower for modular libs. "Last release" is the npm `latest` version, no date unless the source gave one.

## Recommendation table

| Place in app | Recommended option | Why | Cost (KB gz) | Licence |
|---|---|---|---|---|
| Today weather card | Keep SVG WeatherScene, add CSS-only gradient sky by time/condition + CSS/GSAP rain, heat shimmer; optional React Bits `Aurora`/`SoftAurora` only for night/clear on high-end devices | Zero GPU on low-end; WebGL is opt-in | 0 (CSS); GSAP already approved; React Bits component ~ few KB source, no deps | CSS free; GSAP "standard no charge"; React Bits MIT + Commons Clause |
| Breathing exercise | Hand-rolled CSS/SVG orb (scale + opacity, 4/7-8/box timings via GSAP timeline or CSS keyframes). Optional "particle sphere" as React Bits `Orb`/`Particles` (self-contained WebGL2) behind a capability check | Orb is 1 element; particles are the only costly part | 0 CSS; React Bits ~ few KB | as above |
| Health body figure | `react-body-highlighter` (or a copy of its SVG paths) with our own hotspots | Ready SVG muscle map, MIT, small | ~164 KB unpacked, gz unverified | MIT |
| Health progress rings/charts | Hand-written SVG ring (stroke-dashoffset, GSAP or CSS); `uPlot` only if a time-series is needed | uPlot 21.9 KB gz, canvas, fast | 0 (ring); 21.9 (uPlot) | MIT (uPlot licence unverified, believed MIT) |
| Discover hero art | Static SVG illustrations (Open Peeps / Humaaans CC0, own drawn) + GSAP parallax; optional Lottie via dotLottie | CC0 = no attribution issues | 0 + GSAP | CC0 |
| Family faces row, calendar | CSS transitions / GSAP stagger; Rive only if mascot state machine is wanted | Cheap | 0 | - |
| Mascot "Jack" | Rive `@rive-app/canvas-lite` with one `.riv` file bundled offline | State machines = idle/happy/sleep without code; MIT runtime | 57 gz (canvas-lite, whole pkg) + .riv file | MIT |
| Onboarding (5 steps) | No tour library. Own full-screen step pages with one CSS transition; driver.js only if a coach mark on a real screen is needed | Elders: simple linear flow beats overlay tours | 0; driver.js ~ 205 KB unpacked, gz unverified | driver.js MIT |
| Empty states / success | Inline SVG + GSAP check draw (stroke-dashoffset, no DrawSVG plugin needed); confetti via tiny canvas lib (e.g. canvas-confetti, **unverified**) or CSS | Cheapest | ~0 to 6 (unverified) | - |
| Loading skeletons | CSS shimmer (background-position keyframes, transform only) | No JS | 0 | - |
| Icons | Lucide (rounded line, tree-shakeable) | Matches style; ISC | per-icon ~0.3 KB (unverified) | ISC (+MIT for Feather-derived) |
| Breathing sound | Pixabay audio or Freesound CC0, bundled as small .ogg, off by default | Offline once cached | file size only | Pixabay Content Licence / CC0 |

## 1. Animated backgrounds and shaders (ranked, cheapest on a low-end phone first)

1. **CSS-only gradient / mesh animation** (animate `background-position` or `transform` of an oversized gradient layer, `will-change: transform`). 0 KB, compositor-only. Fit: **yes**, default for Today sky and section tints. (No external source; standard CSS.)
2. **React Bits canvas/DOM-light backgrounds** (`DotGrid`, `GridMotion`, `ShapeGrid`, `Threads`, etc.). Repo lists 64 Backgrounds components: AcidSquares, AeroShards, Antigravity, Aurora, Balatro, Ballpit, Beams, CRTWarp, ColorBends, DarkVeil, Dither, DotField, DotGrid, EvilEye, FaultyTerminal, Ferrofluid, FloatingLines, FluxLines, Galaxy, GhostFibers, GradientASCII, GradientBlinds, GradientWaves, Grainient, GridDistortion, GridMotion, GridScan, Hyperspeed, Iridescence, LetterGlitch, LightPillar, LightRays, LightTunnel, Lightfall, Lightning, LineWaves, LiquidChrome, LiquidEther, MagicRings, MagnetLines, MicroSlats, MoltenMetal, Orb, Particles, PatternWaves, PixelBlast, PixelSnow, Plasma, PlasmaWave, Prism, PrismaticBurst, Radar, RippleGrid, Scanner, ShapeGrid, ShapeWaves, SideRays, Silk, SlicedWaves, SoftAurora, Threads, Topography, Waves, WebThreads (https://api.github.com/repos/DavidHDev/react-bits/contents/src/ts-tailwind/Backgrounds). Repo licence: "MIT + Commons Clause" per https://github.com/DavidHDev/react-bits; GitHub API reports NOASSERTION; last push 2026-10-19; 50.6k stars.
   - Checked source of **Aurora, Waves, Particles, Orb, SoftAurora, Grainient**: each imports only React, uses raw **WebGL2** with inline GLSL ES 3.00, no ogl/three dependency, and the ones that mention it pause off-screen (IntersectionObserver); Aurora also pauses when tab hidden or `paused`; SoftAurora/Grainient/Orb/Particles read `matchMedia` (likely reduced motion; not confirmed per file). They render nothing if WebGL2 is missing. **DotGrid** also WebGL2 here (not canvas 2D as earlier React Bits versions used).
   - Other components not inspected: cost **unverified**; assume every shader is a full-screen fragment pass, so cost scales with canvas pixels.
   - Fit: **yes, maybe** only Aurora, SoftAurora, Orb, Particles, Grainient (soft, cream-compatible). Cap devicePixelRatio to 1, canvas at half resolution, render only when on-screen, static fallback poster. **No** for Hyperspeed, Ballpit, Lightning, LiquidEther, Galaxy, LetterGlitch, CRTWarp, FaultyTerminal (busy/aggressive for elders, heavy).
3. **tsParticles slim**: `tsparticles-slim` 2.12.0, 136 KB min / 37.9 KB gz (bundlephobia). Canvas 2D, many options. Fit: **no**, bigger than a single React Bits Particles for similar look.
4. **OGL**: 131 KB min / 34.2 KB gz whole package (bundlephobia), tree-shakeable; only needed if you write custom shaders. Fit: **maybe**, not needed since React Bits files are self-contained.
5. **Shader-gradient libraries** (ShaderGradient, etc.): depend on three.js / react-three-fiber, **unverified** size, expect >100 KB gz. Fit: **no**.
6. **Vanta.js**: depends on three.js (or p5), **unverified**, effects are WebGL and heavy for mid-range Android. Fit: **no**.

## 2. Interactive graphics and character animation

| Name | URL | Licence | Size | Last release | Mobile cost | Fit |
|---|---|---|---|---|---|---|
| GSAP | https://www.npmjs.com/package/gsap | "Standard no charge" licence, https://gsap.com/standard-license (npm registry) | 6.26 MB unpacked package; core gz **unverified** (about 25-30 KB commonly cited) | 3.15.0 (2026-10-30 registry latest) | Low; JS timeline | **yes**, approved. MorphSVG/DrawSVG are included in the free licence per Lloyd's standing rule (not re-verified here). Use for check morph, ring fill, stagger. |
| Rive web runtime | https://github.com/rive-app/rive-wasm | MIT (GitHub LICENSE) | `@rive-app/canvas-lite` 206 KB min / **57 KB gz** (bundlephobia); includes WASM | 2.49.0 published 2026-10-29 (GitHub API) | Medium (WASM init, canvas); .riv files are small, load offline from the bundle (offline claim: general knowledge, **unverified** in docs fetched) | **yes** for Jack: one `.riv` with state machine. Lazy-load only on screens with the mascot. |
| dotlottie-web | https://www.npmjs.com/package/@lottiefiles/dotlottie-web | MIT | 165 KB min / **33 KB gz** (bundlephobia); 7.45 MB unpacked (includes wasm) | 0.81.0 | Medium (WASM renderer) | **maybe**: simple one-off animations (confetti, success). Smaller than Rive. |
| lottie-web | https://www.npmjs.com/package/lottie-web | MIT (**unverified**) | size **unverified** (commonly ~60 KB gz light build) | **unverified** | Medium-high, SVG renderer slow on many layers | **no**, prefer dotlottie-web. |
| LottieFiles free animations | https://lottiefiles.com/page/license | Free incl. commercial, attribution not required (strongly encouraged); derivatives under same terms; no redistribution to build a competing service | per file | - | - | **yes**, but check each file's own licence; read page fetched 2026-10-30 |
| Motion (framer-motion successor) | https://www.npmjs.com/package/motion | MIT | `motion` 175 KB min / 59 KB gz whole package (bundlephobia); LazyMotion/`m` subset is much smaller, figure **unverified** | 14.8.0 | Low | **maybe**: only if layout/shared-element transitions between React routes are wanted. GSAP covers the rest; do not ship both unless needed. |
| GSAP vs Motion | | | | | | Decision: GSAP primary (already approved, timelines for breathing, SVG draw), Motion not needed. |

## 3. Data viz for health progress

| Name | URL | Licence | Size | Mobile cost | Fit |
|---|---|---|---|---|---|
| Hand-written SVG ring | n/a | own | 0 | Very low | **yes** for progress rings (circle + stroke-dashoffset, GSAP or CSS). |
| uPlot | https://www.npmjs.com/package/uplot | MIT (**unverified**) | 50.8 KB min / **21.9 KB gz** (bundlephobia) | Low (canvas) | **maybe** for BP/glucose time series; styling by hand, small touch tooltip work. |
| Chart.js | https://www.chartjs.org | MIT (**unverified**) | **unverified** (commonly ~65 KB gz) | Medium | maybe if more chart types are needed; tree-shake. |
| Recharts | https://recharts.org | MIT (**unverified**) | **unverified**, pulls d3 + React-SVG, large | Medium-high on many points | **no** for small cards. |
| visx | https://airbnb.io/visx | MIT (**unverified**) | modular, **unverified** | Low (SVG primitives) | maybe: pick `@visx/shape` + `@visx/scale` for a sparkline; hand-written SVG polyline is simpler. |

Recommendation: for sparklines and rings use plain SVG; add uPlot only for a full trend screen.

## 4. Body map (open licence)

- **react-body-highlighter** https://www.npmjs.com/package/react-body-highlighter : MIT, v2.0.5, 164 KB unpacked, no explicit date (internal timestamp suggests about July 2021, i.e. stale). Muscle-group front/back SVG with click handler. Fit: **yes/maybe**, copy the SVG paths into the repo rather than depend on a stale package; React 18 compatibility **unverified**.
- **Wikimedia Commons anatomy SVGs** (CC0 / CC BY-SA / public domain varies per file) https://commons.wikimedia.org : per-file licence must be read; CC BY-SA requires attribution and share-alike. Not fetched. Fit: **maybe**.
- **Own drawn simplified figure** (warm line style matching Lucide) with 8-10 hotspot circles. Fit: **yes**, best for the cream/green look and elders (large targets, 48 dp).

## 5. Free assets and licences

| Source | URL | Licence (as fetched) | Fit |
|---|---|---|---|
| Open Peeps | https://openpeeps.com | CC0, free commercial | **yes** (people/faces style) |
| Humaaans | https://www.humaaans.com | CC0, free commercial | **yes** |
| unDraw | https://undraw.co/license | Commercial OK, no attribution. Forbids redistributing in packs, and says adding to an app is a case to avoid unless central use is cleared; also bans AI/ML use. Reads ambiguous for bundling into an app | **maybe/no**: avoid bundling; ask unDraw or skip |
| Storyset | https://storyset.com/terms | Free only with credit to Storyset; no credit needs a Flaticon Premium subscription; dated Feb 2022 | **no** unless credit line is acceptable |
| Lucide | https://github.com/lucide-icons/lucide | ISC (project) + MIT (Feather-derived icons); `lucide-react` 1.64.0, ISC | **yes**, rounded line style; import single icons |
| Phosphor | https://www.npmjs.com/package/@phosphor-icons/react | MIT, v2.1.10 (33 MB unpacked package, tree-shake) | **yes** if weights (duotone) are wanted; not both Lucide and Phosphor |
| Tabler Icons | https://tabler.io/icons | MIT (**unverified**) | maybe |
| Pixabay audio | https://pixabay.com/service/license-summary/ | Free use, no attribution needed; cannot sell/redistribute the audio alone; no trademark use. Not CC0 | **yes** for bundled breathing ambience; keep licence note in repo |
| Freesound | https://freesound.org | per-file (CC0 / CC-BY / CC-BY-NC); filter to CC0 only. **unverified** | maybe |
| Rive community files | https://rive.app/community | per-file licence, **unverified** | check each file |

## 6. Onboarding for elders on Android (rules)

Sources: NN/g https://www.nngroup.com/articles/usability-for-senior-citizens/ (87 guidelines in the full report; the article is qualitative). Android numbers (48 dp targets, WCAG 4.5:1, 200% text) were stated by the fetch tool as general guidance, not from the Android page itself; confirm at https://m3.material.io/foundations/designing/structure and https://www.w3.org/TR/WCAG22/.

1. Make every target large: NN/g says small buttons/links are a recurring failure for older users; use at least 48 dp (Android) and keep spacing between taps.
2. Large, high-contrast text; support 200% text scale without clipping or letter-per-line wrapping (NN/g: tiny, low-contrast mobile text is a recurring problem; WCAG 1.4.3/1.4.4).
3. One idea per step, linear Next/Back with a visible step count (our 5 steps); progressive disclosure, no overlay tour over a busy screen. (design practice, not from a fetched source)
4. Be forgiving: accept typed or spoken input and varied formats (NN/g: a date-time picker defeated a user; typo-tolerant phone/card entry).
5. Clear error wording next to the field, easy to fix (NN/g).
6. No startling sounds, intrusive pop-ups, or autoplay audio; breathing sound off by default (NN/g).
7. Motion must be optional: respect `prefers-reduced-motion`; no motion-only information (WCAG 2.3.3, **unverified** in fetch).
8. Skippable, resumable, and re-openable from Settings; do not trap on first launch. (design practice)

Coach-mark libraries: **driver.js** 1.10.2, MIT, 206 KB unpacked (npm registry); **react-joyride** 3.2.0, MIT, 720 KB unpacked, peers React 16.8-19 (npm registry). Fit: driver.js **maybe** (only for one-off hints); react-joyride **no** (heavier, overlay tours poor for elders). gz sizes: driver.js bundlephobia call returned 8.0 KB gz (listed under the driver.js request; the result matched "27.8 KB min / 8.0 KB gz").

## Do not use

- **Vanta.js, ShaderGradient, three.js / react-three-fiber backgrounds**: heavy three.js dependency, WebGL on every frame, unverified size, poor on low-end WebView.
- **tsParticles** (even slim, 37.9 KB gz): larger than React Bits Particles and more options than needed.
- **lottie-web**: slower SVG renderer, prefer dotlottie-web.
- **Recharts**: heavy for small cards.
- **react-joyride**: 720 KB unpacked, overlay tour pattern is poor for elders.
- **Storyset** (credit requirement) and **unDraw** (app-bundling ambiguity, no redistribution).
- **React Bits Hyperspeed, Ballpit, Lightning, LiquidEther, Galaxy, LetterGlitch, CRTWarp, FaultyTerminal and similar high-energy shaders**: not inspected for cost (unverified) but visually busy, wrong for a calm family health app.
- **Lenis inside the Capacitor shell**: per standing rule, desktop only (lenis 1.3.27, MIT, 458 KB unpacked).
- Any WebGL effect without: lazy load, `prefers-reduced-motion` stop, off-screen pause, DPR cap, static fallback, and no network dependency (self-host all assets so it works offline).

## Unverified list

GSAP core gz size; GSAP MorphSVG/DrawSVG licence detail; lottie-web, Chart.js, Recharts, visx, uPlot, Tabler licences and sizes; Vanta/shader-gradient sizes; Freesound terms; Rive offline claim; react-body-highlighter React 18 support; per-component cost for the 58 React Bits components not read; reduced-motion handling in every React Bits file; Wikimedia anatomy file licences.
