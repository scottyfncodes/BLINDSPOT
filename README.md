# BLINDSPOT

An urban heist game about a city that watches, and the gaps in what it sees. Mobile-first and played in the browser.

BLINDSPOT is a new game built from four earlier projects: GenAlpha, UNDERWATCH, LIFT and The Big Score. `docs/00-synthesis.md` is the full audit, design and plan. `docs/provenance.md` lists what came from where.

## What is playable now: Milestone 1, "Calder Central, 23:12"

One casing night at the station where the Night Mail stops. You play Wren.

- **Explore** the street, the concourse, both platforms, and, with a card, the staff corridor.
- **Observe:**
  - Stand near a camera for one full sweep and you learn its gaps; its sight is drawn from then on.
  - Follow a guard and you learn his round.
  - Open a junction box and you learn which cameras it feeds.
  - Your case file records each fact as confirmed, rumoured, false or dead.
- **Infiltrate:**
  - Lift wallets and phones with your finger (the Dip, ported from LIFT).
  - Lift the courier's coach card and have Dee copy it.
  - Put the card back on his belt before he stands up at 23:31.
  - Test the copy on the coach door.
  - Cut a junction box to blind its cameras.
- **Be nobody:**
  - People react to behaviour. Running, creeping up close, tailing someone and flipping your hood in view are noticed.
  - Staff and cameras act only on cause: a description, a restricted area, a jumped gate, tampering.
  - Light takes away cover; crowds give it.
- **Consequences:**
  - If Pell finds his card missing, Halvard cancels it and every copy.
  - Cut the same box twice and someone guards it.
  - Heat, descriptions and cash carry into the next night.

**Not built yet** (milestone 2 and later): the crew, the planning board, and boarding the Night Mail to do the job. The night report says so in the game.

## Controls
- **Touch:** drag anywhere to move. Push to the rim of the stick to run, a little to creep. Pinch to zoom. The action buttons are bottom right.
- **Keyboard:** WASD or the arrow keys to move. Shift runs, C creeps. E or Space acts, Q is the second action. H toggles the hood, Tab opens the case file, Esc pauses. Scroll to zoom.

## Develop
```
npm install
npm run dev
npm run typecheck && npm test && npx vite build
```
TypeScript, Vite, Canvas 2D, no runtime dependencies. The simulation (`src/sim`) is deterministic and pure; the renderer, UI and audio only read it.
