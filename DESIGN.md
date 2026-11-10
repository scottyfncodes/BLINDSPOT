# BLINDSPOT: art direction

The game is seen the way the city sees itself: **from above, at night, as a map that watches.**

## The world
- **Overhead oblique view.** Buildings are extruded upward. Station walls and furniture are drawn as a low cutaway so nothing you need to read is hidden behind them.
- **Night in Calder.** Concrete, tar, worn tile, painted platform edges, rust. The surfaces are low saturation, and light comes only from lamps. Darkness is drawn, and darkness is cover: the same light value the renderer draws is what perception reads.
- **People have silhouettes, not faces.** From above, you read a person by coat colour, shoulders, hat, bag and posture. Wren is the pale hood and the rust-orange board.

## Colour carries meaning (and only that meaning)
| Colour | Token | Means |
|---|---|---|
| Signal red `#e8432c` | `--signal` | What watches: LATTICE cameras, flags, alarms, being caught |
| Amber `#f2c14e` | `--attention` | Attention: a person's suspicion, a guard's gaze, a risky lift |
| Cyanotype `#7fb0cf` | `--known` | What you know: learned sweeps, routes, circuits, names |
| Sodium `#f2a33a` | (world only) | Light, which takes away cover |
| Paper `#ebe3d2` / manila `#d8cba8` | `--paper` | The case file and the interface |

A camera you have not studied shows only its body and which way it points. A camera you have studied shows its full sweep. Knowledge is literally what lets you see.

## Interface
The interface is a criminal's working material:
- black gaffer-tape plates for the HUD;
- manila case-file cards, typed;
- rubber stamps for intel status (CONFIRMED, RUMOURED, FALSE, DEAD);
- grease-pencil red for danger.

It is not a website: no pill buttons, no gradients, no glass, no glow.

- **Type:**
  - **Big Shoulders** (Display for signage-scale headings, Text for labels and buttons). It borrows the condensed lettering of transit and industrial signage.
  - **Courier Prime** for anything typed into the case file.
  - Both are SIL OFL, loaded from Google Fonts.
- **Shapes:** square corners (2 px at most), 1 px hairlines, tape plates with slightly torn ends. Touch targets are at least 48 px.
- **Motion:** short and physical (a stamp lands, a slip slides in). Everything respects `prefers-reduced-motion` and the in-game setting.

## Ruled out
- Purple-on-black.
- Neon cyberpunk.
- Glassmorphism.
- Gradient orbs.
- Dot grids.
- Emoji.
- Sparkles.
- Inter, Geist or Space Grotesk.
- Rainbow-coded tiles.
- Em dashes in UI copy.
- Fake terminals.
