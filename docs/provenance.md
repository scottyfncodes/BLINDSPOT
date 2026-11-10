# Provenance

All four source projects are by the same owner and are read, never modified, from their own repositories. None of them carries a LICENSE file. Choosing a licence for BLINDSPOT is the owner's decision.

## Code carried over

| BLINDSPOT file | Source | Commit | How |
|---|---|---|---|
| `src/core/rng.ts`, `events.ts`, `spatial.ts` | UNDERWATCH `src/core/` | 368f316 | Verbatim, plus a provenance header |
| `src/core/math.ts` | UNDERWATCH `src/core/math.ts` | 368f316 | First 173 lines (the IK and 3D helpers were dropped) |
| `src/core/loop.ts` | UNDERWATCH `src/core/loop.ts` | 368f316 | Verbatim. BLINDSPOT's renderer actually uses `alpha` to interpolate; UNDERWATCH discarded it. |
| `src/theft/dip.ts` | LIFT `js/mini/common.js` (MiniBase), `js/mini/pickpocket.js` (DipGame) | 70557ed | Ported to TypeScript as pure logic. Fixes: seeded RNG instead of Math.random; no DOM or window; `glanceMul` required (LIFT went NaN without it). New: a PLANT mode that puts an item back. Pocket geometry, wall tolerance (14, +4 hip), speed limit 125, grip dwell 0.42 s, glance cost 110/s, and quality thresholds (32/66) are LIFT's. |
| `src/sim/perception.ts` | LIFT `js/world/sim.js` (`attnOf`, `sees`, `perceive`), `js/data/content.js` (`ACTIVITY_INFO`) | 70557ed | Rebuilt. Kept from LIFT: attention × cone × suspicion, the 0.6 s glance telegraph, staff suspicious only with cause, civilian decay 6/s and staff 3/s, rates 24 and 26, alert multipliers [1, 1.15, 1.3, 1.55]. New: real line of sight, light and crowd cover. |
| `src/sim/sim.ts` `liftSetup` | LIFT `sim.liftQuality` | 70557ed | Same formula, `attn·38 + watchers·14 + susp·0.45 + seen·18`, plus cameras ·12. |
| Junction boxes feeding cameras | GenAlpha `world/junctionboxes.ts`, `world/coverage.ts` | 4cae1d3 | Concept only, rebuilt. Repair, vigilance and guarding on a repeat are new. |
| Camera sweep, vigilance after disturbance | UNDERWATCH `src/sim/surveillance/sensors.ts`, `disturbance.ts` | 368f316 | Concept and the 0.6 sweep gain, rebuilt for this sim |
| Believed vs true intel, bought tips that lie | The Big Score `src/game/intel.ts`, `calc.ts` | 9084a18 | Concept, rebuilt as world facts |
| Save migrate-by-merge | GenAlpha `state/persistence.ts`, The Big Score `state/persistence.ts` | 4cae1d3 / 9084a18 | Pattern |
| Architecture purity test | UNDERWATCH `tests/architecture.test.ts` | 368f316 | Pattern |
| Pure touch engine behind a DOM adapter | UNDERWATCH `src/core/touch.ts` | 368f316 | Pattern; the gestures are new |

Everything not listed was written for BLINDSPOT.

## Assets
- No image, audio or model files from any source. The world, characters and items are drawn procedurally; all sound is synthesised.
- Fonts: Big Shoulders Display, Big Shoulders Text and Courier Prime, from Google Fonts, all SIL Open Font License 1.1.
- `public/favicon.svg` is a provisional mark. The app icon goes through GITCRAFT's App Icon Studio, where the owner picks from concepts.
