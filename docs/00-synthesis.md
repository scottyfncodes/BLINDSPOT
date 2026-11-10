# BLINDSPOT: Four-Repository Synthesis Report

Status: first deliverable of the PROJECT CITY HEIST master prompt.
Date: 2026-11-10. Sources audited at: GenAlpha `4cae1d3`, UNDERWATCH `368f316`, LIFT `70557ed`, big-score `9084a18`.

Every claim below comes from reading source and running each project's own checks in this session. Where a README or doc disagreed with the code, the code won and the disagreement is noted.

---

## 1. Four-repository technical audit

### Results measured in this session

| | GenAlpha ("STATIC") | UNDERWATCH | LIFT | The Big Score |
|---|---|---|---|---|
| Stack | React 18 + TS 5.6 + Vite 5 | TS 5.6 + Vite 5, **no runtime deps**, Canvas2D | Plain ES modules, no package.json | React 18 + TS 5.6 + Vite 5 |
| Size | ~1.7 MB src; 5,065-line `draw.ts` | ~40.5k lines TS | ~4.5k lines JS | ~20k lines |
| Typecheck | clean | clean | n/a (`node --check` passes) | clean |
| Tests | **578 / 578 pass** (40 files, 43 s) | **728 / 728 pass** (33 files, 63 s) | none exist | **77 / 77 pass** (8 files, 47 s) |
| Build | pass, 552 kB JS (174 kB gz) | pass, 520 kB JS (180 kB gz) | cannot run: no `index.html`, no game loop | pass, 348 kB JS (114 kB gz) |
| Browser tests | none | Playwright visual + axe + layout | none | none |
| Deploy | GitHub Pages (claude/* branches) | GitHub Pages (last pushed branch wins) | none | GitHub Pages from `docs/` |
| Licence file | none | none | none | none |
| Third-party art | Kenney CC0 tiles (NOTICE files present) | none (all procedural) + IBM Plex (OFL) | none (all procedural) | none |

### What each project actually is (versus its brief)

**GenAlpha** is a narrative RPG with a walkable top-down town (1600×1100 units, nine districts in a 3×3, 42 locations, 297 hand-placed obstacles). Story is a scripted scene graph across three acts and four mentors, proven dead-end-free by a 136,280-state reachability test. Hacking is two pure, seeded puzzles: **Trace** (minesweeper deduction, 500 seeds proven solvable) and **Cipher** (Mastermind). Its one genuinely systemic idea is **junction boxes that power cameras**: break a box and every camera it feeds goes dark, which feeds a city-wide surveillance **coverage %** that triggers lockdown sweeps. Weaknesses: cameras never see the player (they are coverage geometry), guards are radius checks with no line of sight, chasing vans drive through buildings, NPCs are decorative triangle-wave walkers, the game loop lives inside an 1,810-line React component, there's no view culling, and emojis are used as icons.

**UNDERWATCH** is the most technically mature project and the strongest foundation. It is a fixed-60 Hz deterministic simulation with an architecture test that forbids the sim from touching DOM, render, `Math.random` or `Date.now`. Its **surveillance stack is genuinely simulated**:
- 56 cameras with sweep, FOV, height and occlusion against a spatial hash.
- A Subject (truth) / Track (belief) split with confidence decay.
- Behaviour flags, route prediction, risk bands, evidence back-projection and pursuit/dispatch to forecast points.
- Per-place **disturbance memory** that makes cameras sweep wider and look back up a repeated stone throw. This is exactly the "exploiting the same vulnerability makes it less useful" rule the brief asks for.
- **Recon and plan**: learn sweep timing, commit a step chain, and the real sensors judge it.

Skateboarding is real and tuned: push strides, carve, ollie, flip and grab tricks, auto-derived grind lines, ramps and roof decks. Weaknesses:
- The renderer is a Canvas2D painter's-algorithm software 3D that has never been measured on a phone. Interpolation is claimed in the docs but discarded in `main.ts:277`.
- The headline identity match is effectively scripted by authored priors.
- NPCs are waypoint loops with no memory.
- There are three overlapping wanted systems.
- `Sim` is a 2,769-line god class.

**LIFT** is not a city game: it is a **1931 Art Deco railway pickpocket game** set aboard a moving train. That makes it the most directly relevant source for The Train Job. It has no entry point, game loop, UI or input, so it has never run in a browser. Headless in Node, all five trains generate and simulate to the end of the line. Its value is deep:
- A **crowd perception model**: attention from activity × awareness × heat, vision cones, suspicion that accrues per witness, a 0.6 s **glance telegraph**, and staff who only grow suspicious *with cause* (description match, trespass, hurrying, heat, notoriety).
- **Witness descriptions** keyed to outfit + coat variant, with an alibi.
- A security state machine (patrol → respond → investigate → hunt → search → lockdown checkpoint).
- **Six touch-first tactile theft minigames**: the Dip (relative-drag hand with pocket walls, speed cap and grip dwell), Unhook, Trace-the-clasp, Twist-the-ring, Pat-down and Lockpick.
- A world-to-minigame handoff (`liftQuality` seeds the minigame's awareness; a sloppy result feeds heat and descriptions).

Bugs: an audio crash before the WebAudio unlock, a NaN that makes minigames unloseable if `glanceMul` is missing, every lock pin scoring "perfect", `setTimeout` inside the sim, an unreachable `chase` state, and an O(n) A*.

**The Big Score** is a polished, menu-driven heist manager. It has the best **meta design** of the four:
- **Crew**: 8 roles, 6 attributes, traits with complication multipliers, loyalty with a freelancer-vs-retained threshold at 60, upkeep, greed-weighted pay and memories.
- **Intel** with **believed vs true** confidence: false intel shows as "confirmed" and only hurts at the moment it matters.
- Kit tags with reliability rolls.
- A heat curve that hardens security and raises crew prices.
- **Target depletion and hardening.**
- A counter-based seeded RNG that makes a whole night reproducible.
- `campaignSim` + `progression.test.ts`, which assert balance claims by playing headless campaigns.

But execution is six menu picks resolved by a triangular dice roll. The safe dial **looks interactive but isn't**: the outcome is decided before it animates. The city map is six abstract pins. Other bugs:
- Injured crew never heal unless you lie low.
- The planning board's Heat estimate uses a different formula from the Heat actually charged.
- `experience` is a label only.

### Cross-cutting findings

- **Shared technology.** TypeScript + Vite in three of four. Canvas2D in three of four. Procedural WebAudio in all four, so no audio files exist anywhere. mulberry32 RNG in all four (three separately written copies). localStorage saves with merge-migration in three.
- **Incompatible architectures.**
  - Two React reducer apps (GenAlpha, Big Score) whose state model is not a game loop.
  - One pure-sim engine (UNDERWATCH).
  - One loose module set (LIFT).
  - Coordinate systems differ: GenAlpha world units, UNDERWATCH metres, LIFT 32 px tiles in a side-on strip, Big Score has none.
  - Camera models are incompatible: GenAlpha top-down, UNDERWATCH chase-cam 3D plus plan view, LIFT side-on cutaway, Big Score a menu.
- **Nothing can be merged wholesale.** Pure logic ports; apps don't.

---

## 2. Feature extraction matrix

R = REUSE, A = ADAPT, B = REBUILD, X = RETIRE. "Port" means the code is copied with its tests and provenance header.

### Simulation and engine
| System | Source | Call | Destination use |
|---|---|---|---|
| Deterministic RNG (`Rng`, `hashString`) | UNDERWATCH `core/rng.ts` | R | Sole RNG. LIFT and GenAlpha copies retired. |
| Vector math, spatial hash, event bus | UNDERWATCH `core/*` | R | Engine core. |
| Fixed-step loop | UNDERWATCH `core/loop.ts` | A | Add the missing render interpolation. |
| Architecture purity test | UNDERWATCH `tests/architecture.test.ts` | A | Same rule: sim imports no DOM, render, ui or audio. |
| Sim god class / host monolith | UNDERWATCH `sim.ts`, `main.ts` | B | Rebuilt as small systems with an explicit tick order. |
| React reducer as game loop | GenAlpha `GameContext`, Big Score `store` | X | The sim owns state; DOM UI reads snapshots. |
| Grid A* | LIFT `sim.js` | B | Binary-heap A* on a nav grid, with path cache. |

### World and traversal
| System | Source | Call | Destination use |
|---|---|---|---|
| City data DSL + validator | UNDERWATCH `content/builder.ts`, `world.validateWorld` | A | City authored as code, validated by tests. |
| Bellhaven suburb, GenAlpha town, LIFT carriages | all three | X | Replaced by the city of **Calder**. |
| Districts as a 3×3 grid | GenAlpha `locations.ts` | X | Districts are authored zones with their own security profile. |
| Circle-vs-rect collision, axis sliding | UNDERWATCH `world.ts`, GenAlpha `Overworld` | A | Agent movement. |
| Skating model (push, carve, ollie, grind) | UNDERWATCH `player.ts`, `grinds.ts` | A | Milestone 3: the board is a traversal tool on streets and rooftops, and a noisy one. |
| Kenney CC0 tile sheets | GenAlpha `public/tiles` | X | Don't match the art direction (see §6). |

### Surveillance and security
| System | Source | Call | Destination use |
|---|---|---|---|
| Camera sensor (sweep, FOV, occlusion, states) | UNDERWATCH `surveillance/sensors.ts` | A | Camera network. Height simplified to rooftop/street. |
| Disturbance memory and vigilance | UNDERWATCH `surveillance/disturbance.ts` | A | **Vulnerability decay**: a gap used twice is watched on the third visit. |
| Track / belief confidence decay | UNDERWATCH `fusion.ts` | A | Security believes a last-known position, not the truth. |
| Pursuit/search state machine to forecast point | UNDERWATCH `pursuit.ts`, `dispatch.ts` | A | Guards and police response. |
| Junction box → camera power feed | GenAlpha `junctionboxes.ts`, `world/coverage.ts` | A | Cameras have a power circuit you can cut, at the cost of an alert at the box. |
| Coverage % → lockdown sweep | GenAlpha `systems/coverage.ts` | A | District-level surveillance pressure (milestone 4). |
| Radius-only patrols, vans, drones | GenAlpha `patrols/drones/copwalk` | B | Replaced by perceiving guards. |
| Three overlapping wanted systems | UNDERWATCH `trouble`/`exposure`/risk | B | **One model**: Suspicion (per witness) → Alert (per site) → Heat (city, persistent). |
| Network hack verbs (LOOP traced later) | UNDERWATCH `network.ts` | A | A camera loop that fails its integrity check later is the honest cost of hacking. |
| Identity match by authored prior | UNDERWATCH `runIdentityMatch` | X | Identity is built from what was actually seen. |

### People
| System | Source | Call | Destination use |
|---|---|---|---|
| Attention × cone × suspicion perception | LIFT `sim.js attnOf/sees/perceive` | A | **The** NPC perception model, with line-of-sight raycasts instead of "same carriage". |
| Glance telegraph (0.6 s stir before a look) | LIFT `sim.js`, `mini/common.js` | R | The readable "freeze" signal, in the world and in theft. |
| Staff suspicious only with cause | LIFT `perceive` | R | Guards need a reason: description match, trespass, hurrying, heat. |
| Witness description (outfit + variant, stale after 150 s, alibi) | LIFT | A | The basis of a compromised identity. |
| Security FSM (patrol/respond/investigate/hunt/search) | LIFT | A | Guard brain. Finish `chase`, remove `setTimeout`. |
| Daily routines, schedules | none of the four has them | B | New: agents follow a timetable keyed to the city clock and the train timetable. |
| Population generation (archetypes, companions, secrets) | LIFT `gen.js` | A | Commuter and VIP generation. |
| Ambient walkers | GenAlpha `npcs.ts` | X | Every person in Calder perceives. |

### Theft and infiltration
| System | Source | Call | Destination use |
|---|---|---|---|
| The Dip (relative-drag pocket minigame) | LIFT `mini/pickpocket.js` | A | Port to TS, decouple from `window`, modern pockets. |
| Unhook, Trace-clasp, Twist-ring, Pat-down | LIFT `mini/pickpocket.js` | A | Milestone 3 (watch → phone, ring → lanyard). |
| Lockpick (binding order, overset, noise) | LIFT `mini/lockpick.js` | A | Doors and cases. Fix the "always perfect" bug. |
| World → minigame handoff (`liftQuality`) | LIFT `sim.liftQuality` | R | Who is watching seeds the minigame's starting awareness. |
| Disguise / outfit access + class trust | LIFT `content.js` outfits | A | Uniforms open staff areas and change who trusts you. |
| Trace (hacking deduction puzzle) | GenAlpha `systems/trace.ts` | R | Junction boxes and access panels (milestone 3). |
| Cipher (Mastermind keypad) | GenAlpha `systems/cipher.ts` | R | Keypad doors where no code was stolen. |
| Menu "sabotage window" | GenAlpha `sabotage.ts` | X | Replaced by spatial play. |
| Slingshot ballistics + evidence back-projection | UNDERWATCH | A | Later: a distraction tool that leaves evidence. |
| Coin distraction, staged incident | LIFT `throwCoin`, `stageIncident` | A | Distraction verbs. |

### Crew, planning, consequences
| System | Source | Call | Destination use |
|---|---|---|---|
| Crew model (roles, attributes, traits, loyalty, greed, memories) | Big Score `types.ts`, `data/crew.ts`, `traits.ts`, `generation.ts` | A | Crew, now with **embodied abilities** used in the world. |
| Freelancer vs retained (loyalty ≥ 60), upkeep, contacts | Big Score `campaign.ts` | R | Crew economy. |
| Believed vs true intel, sources with hidden reliability | Big Score `intel.ts`, `calc.ts` | A | **Intel facts are world facts** (a sweep period, a guard's route, a door code), and a bought fact can be false. |
| Recon → plan step chain judged by real sensors | UNDERWATCH `recon.ts` | A | The planning board's timeline. |
| Clue/deduction graph | UNDERWATCH `casefile.ts` | A | Intel board connections. |
| Six fixed menu stages + dice resolution | Big Score `resolve.ts` | X | Replaced by played execution. |
| Score vs opposition + triangular CDF | Big Score `calc.ts` | A (narrow) | **Off-screen crew tasks only**, and the planning board's odds estimate. |
| Exposure clock (noise → exposure → response window) | Big Score `resolve.ts` | A | Police ETA once a site's alert trips. |
| Heat curve, decay, lie low, target depletion and hardening | Big Score `campaign.ts` | R | Persistent consequences. |
| Fake interactive dial | Big Score `Dial.tsx` | X | Rebuilt as a real timed safe crack only if it is real. |
| Escalation rollout, relocation of sabotaged nodes | GenAlpha `escalation.ts`, `relocate.ts` | A | Security hardening after a job. |
| Consequence ladder (shakedown → arrest) | GenAlpha `consequences.ts` | A | Being caught is a setback, not a game over. |
| Moral economy (fence vs return vs give) | LIFT `economy.js` | A | Later: what you do with a take shapes your network. |
| News from results, city wire, marks | Big Score `news.ts`, `city.ts`, `marks.ts` | A | The city remembers in print. |
| Balance-by-headless-campaign tests | Big Score `campaignSim` | R (method) | Every balance claim is a test. |
| Story acts, mentors, Devon case | GenAlpha, UNDERWATCH | X | Different games. Tone mined only. |

### Presentation
| System | Source | Call | Destination use |
|---|---|---|---|
| Pure touch gesture engine, safe-area aware | UNDERWATCH `core/touch.ts` | A | The pattern (pure engine + thin DOM adapter, ergonomics tests). Rewritten for heist verbs. |
| Canvas2D software 3D chase cam | UNDERWATCH `perspective.ts` | X | Unmeasured on phones, and the stealth read needs overhead. |
| Plan / oblique top-down view | UNDERWATCH `camera.ts` (`ROOF_K`) | A | **The main camera.** See §3. |
| Ink line weight + screentone | UNDERWATCH `ink.ts`, `tone.ts` | A | Building shading. |
| Palette discipline + saturation tests | UNDERWATCH `palette.ts`, `art-direction.test.ts` | A | Same discipline, new palette. |
| Noir dossier board (cream paper on dark board, stamps) | Big Score CSS tokens | A | Planning layer UI. |
| Procedural parametric characters | LIFT `chars.js` | A | Top-down figures with readable silhouettes. |
| Generative noir trio, swing jazz, synth sfx | Big Score `audio.ts`, LIFT `audio.js` | A | Intensity-layered score keyed to alert state. Fix LIFT's crash. |
| Phone / cyberdeck shell | GenAlpha `Phone.tsx` | A | Later: the burner phone as the in-world menu. Drop the emoji icons. |
| Playwright visual + axe + iPhone layout specs | UNDERWATCH `e2e/*` | A | Same gates from day one. |

---

## 3. Recommended destination architecture

**A new repository, `BLINDSPOT`**: TypeScript (strict) + Vite, **zero runtime dependencies**, Canvas2D world plus DOM UI, Vitest + Playwright. Deployed on Vercel as a static build: a preview per PR, production from `main`.

### The camera decision
The main view is an **overhead oblique "surveillance map"** camera. Buildings are extruded upward by a roof offset, as in UNDERWATCH's plan view. It is not UNDERWATCH's software 3D chase cam.
- **Readability.** Stealth is about cones, sightlines and gaps. From overhead the player can read every camera sweep and every glance without guessing.
- **Phone performance.** Static city layers are prerendered into chunk canvases once and culled per frame. Only people, cones and effects draw live. UNDERWATCH's per-face painter's sort and GenAlpha's draw-everything renderer are what we are avoiding.
- **Identity.** The player sees the city the way the city sees itself: from above, as a map that watches. The fiction and the camera agree.

WebGL stays an option for a later milestone if a measured frame budget needs it. Moving the renderer later doesn't change the sim.

### Layers (import direction is enforced by a test)
```
core/     rng, math, spatial, events, loop        (ported from UNDERWATCH)
sim/      world, nav, agents, perception, security, theft, intel, heat, crew, plan
          - no DOM, no render, no Math.random, no Date.now
content/  the city of Calder, the station, people, timetable (typed data + DSL)
render/   chunked static layers, agents, cones, overlays, camera with interpolation
ui/       HUD, intel board, dossier, minigame hosts, title, pause (DOM over canvas)
input/    pure touch + keyboard engine -> Intent; thin DOM adapter
audio/    procedural WebAudio buses and score (ported and fixed)
save/     versioned schema, migrate-by-merge, try/catch around storage
```

### Tick order (fixed 60 Hz)
1. Input → Intent.
2. Player movement and collision.
3. Agent schedules → goals → nav → movement.
4. Cameras update (sweep, power, disturbance-driven vigilance).
5. Perception: every perceiver runs attention × cone × line of sight × light against the player and against events.
6. Suspicion → witness memory → Alert (site) → Heat (city).
7. Security brains: patrol, respond, investigate, search, pursue.
8. Theft and interaction resolution.
9. Intel extraction from what the player has observed.
10. Events flushed to UI and audio.

Rendering interpolates between the last two ticks.

---

## 4. Systems: reuse, adapt, rebuild, retire (summary)

- **REUSE (port with tests):**
  - UNDERWATCH core (RNG, math, spatial hash, event bus, loop).
  - LIFT glance telegraph, "suspicious only with cause", and `liftQuality` handoff (as rules and constants).
  - GenAlpha Trace and Cipher puzzles.
  - Big Score freelancer/retained crew economy, heat curve, target depletion and hardening, persistence pattern, and balance-by-simulation method.
- **ADAPT:**
  - UNDERWATCH sensors, disturbance, fusion, pursuit/dispatch, recon/plan, skating, palette discipline, touch-engine pattern and Playwright gates.
  - LIFT perception (add line of sight), witness descriptions, security FSM, the Dip and Lockpick, outfits, population generation and audio.
  - GenAlpha junction-box power feeds, coverage pressure, escalation and consequences ladder.
  - Big Score crew model, believed-vs-true intel, kit tags and reliability, exposure clock, news and dossier visual language.
- **REBUILD:**
  - Pathfinding.
  - NPC routines and schedules (no source has them).
  - The unified wanted model.
  - The sim orchestrator and host.
  - Save schema.
  - Guards (GenAlpha's radius ghosts).
- **RETIRE:**
  - Every story, act and mentor.
  - GenAlpha's renderer and hand-placed town.
  - UNDERWATCH's software 3D renderer and Bellhaven.
  - LIFT's carriage layouts and period content (its copy also breaks the no-em-dash rule).
  - Big Score's menu resolver, fake dial and abstract map.
  - Kenney tiles.
  - React as a game-state container.

---

## 5. Unified game design document

### Title: BLINDSPOT
A blind spot is the one thing all four sources have in common:
- the gap in a camera sweep (UNDERWATCH);
- the moment a mark looks away (LIFT);
- the dead zone you make by killing a junction box (GenAlpha);
- the hole in a plan nobody saw coming (Big Score).

The whole game is finding, making and exploiting them, and the city learning to close them.

Alternatives considered: OFF CAMERA (good, but two words and softer), DEAD ANGLE (the military term, colder), CASING (scouting a target, too narrow), SWEEP.

### Premise
**Calder** is a river port that got rich twice: once from the docks, once from money that never touched them. The old town still runs on rail, cash and favours. The new town runs on **LATTICE**, a private camera network that Halvard Trust built to protect its quarter and then sold to the city, street by street.

You are **Wren**: young, broke, quick-handed, one of the kids who grew up under the cameras and learned where they don't look. You start with a skateboard, a burner phone, and a reputation of zero.

### Pillars
1. **The city watches back.** Every person and camera perceives. Nothing is scripted to catch you; something sees you.
2. **Read, then act.** Information is the currency. You earn it by watching, stealing and paying, and some of what you're sold is a lie.
3. **Your hands are the game.** Theft is a physical touch skill, never a dialog button.
4. **Plans meet the street.** A plan is a set of timed advantages you set up in the world, and the world gets a vote.
5. **Calder remembers.** Faces, routes, methods and debts persist.

### The loop, as systems
| Stage | What you do | Systems |
|---|---|---|
| EXPLORE | Walk, run and skate the city, find places, people and opportunities | movement, districts, timetable, informants |
| OBSERVE | Watch cameras sweep, follow a mark, time a guard, read a timetable | perception (yours), **intel facts** with confidence |
| INFILTRATE | Lift a keycard, cut a junction box, wear a uniform, slip a gate | theft minigames, power circuits, outfits, access zones |
| PREPARE | Turn intel into a plan: assign crew, buy kit, mark routes | planning board, crew, kit, believed-vs-true intel |
| EXECUTE | Play the job, with crew acting on their timed assignments | the same sim: perception, security, crew agents |
| ESCAPE | Break line of sight, lose the description, reach a drop | track decay, description staleness, pursuit |
| EVOLVE | Fence, pay crew, buy kit, lie low, face a harder city | heat, depletion/hardening, loyalty, news |

### How the systems talk (the point of the whole design)
- **What you observe** becomes intel. Intel unlocks plan steps, which reduce what security can see during execution.
- **How you steal** (clean, sloppy or caught) sets heat and witness descriptions. Descriptions make guards suspicious with cause, so your next infiltration is harder in that outfit.
- **Cutting a junction box** blinds its cameras, but raises disturbance at the box. Use the same box twice and its cameras come back watchful and the box gets a guard (vulnerability decay).
- **Crew loyalty** depends on the take and on whether you left anyone behind. A low-loyalty insider can sell you out, and their intel becomes "false".
- **Heat** raises guard counts, camera vigilance and crew prices, and decays only if you lie low.

### Unified wanted model (replacing four overlapping ones)
- **Suspicion** (per witness, 0–100). It accrues from attention × visibility × proximity × behaviour, and decays when you're unseen.
  - Civilians react to behaviour.
  - Staff need cause: description match, restricted zone, running, high heat.
- **Alert** (per site, 0–3: CALM → WARY → SEARCHING → LOCKDOWN). It is raised by confrontations, discovered thefts, dead cameras and alarms. It decays over time.
- **Heat** (city-wide, 0–100, persistent across days). It is charged at the end of an incident and shapes the next day.

### Characters
Expressive silhouettes from overhead mean hats, bags, coats, boards and posture.
- **Wren**: a hood up, a board under one arm. The player.
- **Commuters**: archetypes with an awareness level and a pocket inventory.
- **Station staff**: guards and platform staff. Uniforms are also disguises.
- **Couriers**: carry the thing you want.
- **Crew**:
  - Driver, Hacker, Face, Inside, Muscle, Scout.
  - Each has attributes and traits, and **one embodied ability** in the world, e.g. the Face's distraction pulls a guard's attention for N seconds; the Hacker loops a named camera for a window.

---

## 6. World and gameplay architecture

### Calder (target shape for the full game)
| District | Role | Security profile |
|---|---|---|
| **Saltmarket** (THE STREETS) | Markets, skate spots, informants, petty theft, crowd cover | Low cameras, beat police, crowded |
| **Calder Central** (TRANSIT) | The station, the Loop line, crowds on a timetable | Cameras + platform guards; crowds rise and fall with trains |
| **The Ledger** (CORPORATE) | Halvard Trust, offices, the money | Dense LATTICE coverage, keycards, guards with cause |
| **The Sumps** (UNDERGROUND) | Storm drains, the closed Kettle Line, safehouse, the fence | Unwatched, but people talk |
| **The Tops** (ROOFTOPS) | Spans every district; traversal, vantage points, exits | Drones (later), no crowds |

### World data model
- Metres, top-down, y-down.
- Buildings are polygons with height.
- Surfaces carry walkable / restricted / zone tags.
- Occluders and light pools are separate data.
- A nav grid at 0.5 m.
- The city is authored in code through a small DSL and validated in tests: connectivity, every camera powered by a box, every restricted door reachable.

### People model
- **Schedule**: a list of (time window → place → activity), plus the station timetable.
- **Activity** sets attention (phone 0.35, conversation 0.25, waiting 0.6, guard post 0.85).
- **Perception**: cone × range × line of sight × light × attention, with a glance cycle.
- **Memory**:
  - suspicion;
  - last seen position and outfit;
  - what they lost (if robbed);
  - who they called (a confrontation dispatches security).
- **Affiliation**: civilian, station staff, Halvard security, police. The faction decides who responds to whom.

### Time
A city clock. In the vertical slice it runs from 22:30 to 00:10 with the 23:40 Sterling Night Mail as the event. Crowds peak around arrivals.

---

## 7. Vertical slice: THE TRAIN JOB

The 23:40 **Sterling Night Mail** stops at Calder Central for six minutes. Its last car is a Halvard Trust courier coach, carrying a sealed case of bearer instruments from the Ledger to the port. The courier, **Pell**, walks the concourse at 23:20 with a coach keycard on a belt clip.

| # | Step | Played as | Systems proven |
|---|---|---|---|
| 1 | Explore the station | Walk the concourse, platforms, staff corridor, roof | world, nav, districts |
| 2 | Observe security | Watch the 6 concourse cameras sweep; time the platform guard | sensors, perception, intel facts |
| 3 | Gather intel | Each observation logs a fact with confidence; the informant at the kiosk sells two more (one false) | intel, believed vs true |
| 4 | Credentials or insider | **Lift Pell's keycard** (the Dip), *or* pay **Mara**, the platform porter, to leave the staff door on the latch | theft minigame, crew/insider loyalty |
| 5 | Assemble crew | Pick 2 of 4 available specialists (Face, Hacker, Driver, Inside) | crew model, cost, loyalty |
| 6 | Plan | Planning board: assign each crew member an ability to a time and place from known intel | plan, intel gating |
| 7 | Execute | 23:40: the train is in. Board the courier coach and crack the case (Lockpick), with crew abilities firing on schedule | same live sim |
| 8 | Complication | Drawn from world state, not a script: a camera you never scouted, a guard rerouted by your earlier heat, or the insider sells you out if their loyalty is low | consequences |
| 9 | Escape | Out through the staff tunnel to the Sumps, or over the roof. Lose the description | pursuit, description staleness |
| 10 | Consequences | Heat, Pell's description of you, Halvard hardens the courier route, crew loyalty, news | persistence |

It's not a cinematic. If you lift the keycard cleanly and nobody saw, there's no complication from Pell. If a camera caught you, the next night has a guard at that door.

---

## 8. Risks, dependencies and blockers

| Risk | Severity | Mitigation |
|---|---|---|
| **Repository creation is not permitted from this session.** The GitHub tools available here cannot create a repository. | Blocker for PR workflow | The owner creates `scottyfncodes/BLINDSPOT`. Until then the project builds locally and deploys to Vercel from source. |
| Canvas2D performance on iPhone with many perceivers | High | Chunked prerendered statics, culling, perception budget (LOS only for agents within range), measured frame time in a perf test. |
| Scope: four games' worth of ideas | High | Milestones with a playable build at each. Nothing presented as finished until it is. |
| LIFT has never run in a browser, so its minigame tuning is unplayed | Medium | Port with tests; tune with PLAYCRAFT plus real iPhone play. |
| Chromium emulation is not iPhone Safari | Medium | Playwright WebKit project where available; manual device check before each production merge. |
| No licence files in any source repository | Medium | All four are the same owner's work. Provenance is recorded per file in `docs/provenance.md`. A LICENSE choice is the owner's decision. |
| Analytics script added by hand to two source builds | Low | Pulse added only through the build here, if approved. |
| Determinism drift (`setTimeout`/`Math.random` in LIFT, `Date.UTC` in UNDERWATCH) | Low | Architecture test forbids them in `sim/`. |

---

## 9. Recommended repository name

**`BLINDSPOT`**, at `scottyfncodes/BLINDSPOT`.

---

## 10. First implementation milestone: M1 "Calder Central, 23:20"

A playable, deployable foundation that proves the engine and the first three loop stages (EXPLORE → OBSERVE → INFILTRATE) at the station, with real systems.

**In scope, done when each is played and tested:**
1. Engine:
   - Ported core.
   - Fixed-step loop with interpolation.
   - Sim/render split enforced by an architecture test.
   - Determinism test.
2. Calder Central, authored in code:
   - Concourse, two platforms with a parked train, staff corridor, the street outside, a rooftop access.
   - A nav grid, collision and validation tests.
3. Movement, touch-first:
   - A floating left-thumb stick and context action buttons.
   - Keyboard on desktop.
   - Walk, run and sneak, with noise and attention consequences.
4. Overhead oblique renderer:
   - Chunked static layers and a smooth follow camera.
   - Pinch-to-zoom.
5. **Perceiving crowd**:
   - Commuters on schedules keyed to the train timetable.
   - Attention by activity, cones with line of sight, glance telegraph, suspicion.
   - Witness description memory.
6. **Cameras**: sweep, line of sight, junction-box power circuits that can be cut, disturbance-driven vigilance.
7. **Security**:
   - Guards with the patrol → respond → investigate → search → pursue machine.
   - Suspicious only with cause.
   - Site Alert and city Heat.
8. **The Dip**:
   - Ported, touch-first.
   - Its starting awareness is seeded by who is watching.
   - Its result feeds heat and descriptions.
   - Lifting Pell's keycard opens the staff door.
9. **Intel log**: observing a camera for a full sweep, timing a guard, or seeing Pell's card records a fact. This is the seed of the planning board in M2.
10. Save/resume, title, pause, settings (sound, reduced motion), iPhone safe areas, no page scroll, and Playwright phone + desktop checks.

**Next milestones:**
- M2: Crew + planning board + execution of the full Train Job.
- M3: Lockpick, Trace and Cipher; outfits; skating traversal and rooftops.
- M4: The wider city (Saltmarket, the Sumps), days, persistent consequences, news.
