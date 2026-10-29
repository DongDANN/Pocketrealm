# Delve Redesign — Player-Controlled Turns, Skill Collection, Fair Capsules

Status: **draft for owner review.** No code has been written against this document.
Date: 2026-10-27. Affects: the Delve game layer only.
Supersedes: SPEC 6.9 (idle/auto-battle premise), 6.11.C (Habit Cards), 6.11.M (catch-up worker),
and parts of 6.11.D (boss phases) and 6.11.K (mastery scope).

---

## 1. Why

The owner plays the live build and cannot read it. Concretely, from their own screenshots: a room
resolves in one tap, HP moves from 60 to 58, and nothing on that screen says how. Every decision in
the run is taken by `evaluateCards` on their behalf, so the game asks nothing of them and then
reports a number they cannot trace.

The redesign gives back control and makes every number itemized. It is not a genre change: the
Hollows, the seeded map, boons, relics, statuses, elements, Heat, Embers, the Forge, the Workshop,
the Codex, the Realm and the entire budgeting app all stay.

## 2. Invariants that do not move

These bind every section below, and a change that breaks one is out of scope.

1. **The budgeting core is untouched.** Money, periods, envelopes, safe-to-spend, recurring, the
   reward ledger, streaks, quests, achievements, export/import, PWA and offline behaviour do not
   change in any way.
2. **Score never comes from money.** No game value is derived from an amount spent, a category, or
   from spending less. Fuel comes from the free trickle and from logged actions only
   (`src/core/rewards.ts:123` `OIL_SOURCES`), unchanged.
3. **Nothing is purchasable with real money.** Capsules, Skill Dust, runs and cosmetics have no
   price in real currency, ever. This is a product rule, not a tuning knob.
4. **No compulsion mechanics.** No limited-time banners, no login streaks, no timers, no push, no
   pay-to-skip, no fake urgency. The "good place to stop" note after a long session stays.
5. **No shame.** A faint or a bad decision costs a run, never levels, XP, Sparks, cosmetics, Forge
   nodes or collected skills.
6. **Determinism and offline.** Every outcome is reproducible from the seed and the persisted
   decision log. The app remains fully offline with no network calls carrying user data.

## 3. Summary of the eight decisions

| #   | Decision                                          | Effect                                               |
| --- | ------------------------------------------------- | ---------------------------------------------------- |
| 1   | The player chooses every combat action            | `evaluateCards` becomes the fallback, not the driver |
| 2   | Autopilot and Habit Cards are removed             | the away-simulation half of the engine is deleted    |
| 3   | Oil buys **run starts**, not rooms                | the habit → progress link survives without idle play |
| 4   | One hand exchange = one room                      | a fight is a room, not a 15-minute session           |
| 5   | 60 collectible skills, five tiers, in a Codex     | the Pokémon-style collection and the hunt            |
| 6   | Capsules with published odds and three-layer pity | the reveal ritual, without gambling economics        |
| 7   | Skill Dust is the single progression currency     | use and duplicates both feed one ladder              |
| 8   | Floor rule flips, skip-for-more, Glint interest   | run tension from known-terms trade-offs              |

---

## 4. Section A — the turn loop

### A.1 The seam

Combat is already a round loop that asks a separate function what to do. The player's input replaces
exactly that call and nothing else:

- `src/core/delve/combat.ts:553` already assembles `CardCombatState` — `round`, `energy`, `hp`,
  `maxHp`, `cooldowns`, `actives`, and per-target `hp` / `maxHp` / `marked` / `weakness`. This is
  the action menu's data, already computed.
- `src/core/delve/combat.ts:569` calls `evaluateCards(equipped, state)` and takes `decision.fired`.
- `src/core/delve/combat.ts:589` picks the target automatically (first alive, or the marked one).
- `src/core/delve/combat.ts:596` sets `guardActive` only on a boss telegraph.

Those three lines are the whole change surface inside combat. Energy, cooldowns, `rollDamage`,
status application, phases, enemy turns, the `ROUND_CAP` termination and the log all stay as they
are.

### A.2 New shape

```ts
/** What the player chose for this round, or null to let the fallback policy decide. */
export interface TurnOrder {
  skillId: string | null; // null = basic attack
  targetIndex: number;
  guard: boolean;
  consumableId?: string;
}
```

`runCombat` gains one parameter, `decide: (state: TurnState) => TurnOrder | null`. `TurnState` is
`CardCombatState` renamed, since after this change it describes the human's menu as well as the
fallback's. The UI always supplies the order for anything the player sees.

The `evaluateCards` path survives as a **non-player-facing** decider used by the fuzz and golden
tests, which have to generate thousands of complete runs headlessly with no human in the loop. It is
not offered as a convenience, and there is no "let the companion play for me" control anywhere in the
UI — that is Autopilot by another name and it is what this redesign removes. Consequences worth
stating plainly: the Daily Challenge is played by hand on the day, or missed; and **time no longer
advances a run at all.** A run left at a campfire sits there for a week and costs nothing when
resumed. `habitCards.ts` is kept only as that test infrastructure, with `DelveCards.tsx` deleted.

Both decider routes produce the same `CombatResult`, so determinism is unaffected.

### A.3 What the player sees each round

1. **Intent, on every enemy.** `Tollbug — heavy strike, 14 next round`. The telegraph mechanic
   already exists for bosses (`bossTelegraph`, `src/core/delve/combat.ts:596`) and the data lives in
   the enemy tables; it becomes a normal enemy attribute rather than a boss-only flag.
2. **The itemized sum, before committing.** Each option renders its own arithmetic:
   `Cinder Cut · 2 energy · ATK 10 × 1.4 power × Fury chain 1.5 × Marked 1.25 = 26 → Tollbug 22 left`
   The number shown is the number computed — the sum is produced by the same function that resolves
   the hit, not by a UI-side reimplementation. This is the single most important line in the
   document.
3. **Four actions:** Skill / Attack / Guard / Item. Energy and cooldowns are the limiter, as today.
4. **Break off:** leave the room with its reward unclaimed and return to camp. Costs nothing but the
   room.

### A.4 Sizing

A room is one exchange: bounded by `ROUND_CAP`, which already exists. A run is 15–25 rooms across
6–10 floors, so a full run played actively is 10–20 minutes — but it is never required in one
sitting, because a run persists between sessions and the camp state costs nothing to leave.

---

## 5. Section B — what is removed

Deleted outright:

| Path                                                               | Reason                                                                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/core/delve/autopilot.ts`                                      | no away-time decision maker                                                                                                  |
| `src/core/delve/policy.ts`                                         | Autopilot policy model                                                                                                       |
| `src/core/delve/catchup.ts`                                        | offline step catch-up                                                                                                        |
| `src/core/delve/workerJob.ts`                                      | worker message contract for catch-up                                                                                         |
| `src/data/delveWorker.ts`, `src/data/workers/`                     | the worker itself                                                                                                            |
| `src/ui/screens/DelvePolicy.tsx`                                   | the Autopilot editor screen                                                                                                  |
| `src/ui/screens/DelveCards.tsx`                                    | the Habit Cards editor screen                                                                                                |
| the catch-up sheet anchored at `src/ui/screens/Delve.tsx:153`      | the "While you were away" summary, which now has nothing to report                                                           |
| the oil-dry camp copy in `src/ui/screens/Delve.tsx:171` and `:520` | "the clock is paused" and "the lantern is dry" describe away-progress that no longer exists; oil is now spent to start a run |
| `tests/delve-cards.test.ts`, `tests/delve-worker.test.ts`          | cover deleted code                                                                                                           |

`evaluateCards` survives as test infrastructure only — the headless decider for the fuzz and golden
suites — so `habitCards.ts` is kept and stripped to one built-in default policy with no editable
deck and no UI. It is never reachable from the app.

Removed from `DelveMeta` (`src/core/delve/types.ts:155`): the `autopilot` policy field and the
`cards` array. `lastStepAt` and `maxSeenAt` remain, because the daily oil trickle and the
clock-rewind defence still need a date and a monotonic clock guard.

Removed from the route table: `/delve/policy` and `/delve/cards`. Removed from `vercel.json`
consideration: nothing; the SPA rewrite already covers all routes.

## 6. Section C — oil buys run starts

Oil keeps its sources and caps exactly as they are (`src/core/rewards.ts:123-132`: trickle 20/day,
+4 per logged entry capped at 8, +10 check-in, +10 no-spend, +30 review, +15 goal capped at 3,
120/day earned, 200 stored). What changes is what it buys.

| Hollow          | Cost to start a run | Runs from one day's trickle | Runs at the 120/day cap |
| --------------- | ------------------- | --------------------------- | ----------------------- |
| Rootfall Warren | 20 oil              | 1                           | 6                       |
| Second Hollow   | 24 oil              | —                           | 5                       |
| Third Hollow    | 28 oil              | —                           | 4                       |

The trickle of 20 still buys exactly one run a day, which preserves the SPEC promise that the game
moves a little even for someone who logs nothing. Logging habits buys additional runs. Rooms inside a
run are free — the run is already paid for.

The Daily Challenge remains free of oil, as today.

**Tuning obligation:** `npm run sim:delve` personas are rewritten around runs-per-day rather than
steps-per-day, and the pacing targets in SPEC 6.10 are re-stated as "days to clear Hollow 1" with
the same bands (Trickle ~2–3 weeks, Casual ~5–8 days, Habit ~3–5 days, Optimizer at most ~2.5×
Trickle in Embers/day).

---

## 7. Section D — the skill collection

### D.1 Contents

60 skills at launch, across the five existing rarity ramps (`src/art/palette.ts` already defines a
ramp per rarity, so tier colouring is free):

| Tier     | Count | Base weight |
| -------- | ----- | ----------- |
| Common   | 22    | 45%         |
| Uncommon | 16    | 28%         |
| Rare     | 12    | 16%         |
| Epic     | 7     | 8%          |
| Mythic   | 3     | 3%          |

Every skill carries one of the existing tags — `guard`, `fury`, `fortune`, `vigor`, `thrift` — so
the tag-chain multiplier from boons extends to the moveset without a new axis. Skills are original in
name and copy, per SPEC 14.

### D.2 Companion moveset

Four equipped slots, respec free between runs (the same rule as the build skill tree today). The
number of skills the companion can _know_ grows with companion level, which is the Pokémon-style
evolution gate: level 1–4 knows 6, 5–9 knows 10, 10–19 knows 16, 20–34 knows 24, 35+ knows 40.
Equipping stays at four so builds stay legible.

### D.3 Capsules

Chain: **run → Materials (Ore, Herb, Echo) → capsule crafted in the Workshop → the player chooses
when to open it.** Capsules cost materials only. They never cost Embers, so the Forge tree keeps a
single uncontested sink, and they can never be bought with real money.

Craft cost is fixed at **2 Ore + 1 Herb** per capsule. The tier ceiling of a capsule rises with the
deepest Hollow its materials came from: Hollow 1 material yields Common-to-Rare, Hollow 2
Uncommon-to-Epic, Hollow 3 Rare-to-Mythic. So the pull quality a player sees is a function of where
they farm, which is a decision, not a dice roll.

### D.4 The three pity layers, all visible

1. **No dud.** Every capsule guarantees Uncommon or better.
2. **Hard pity.** A counter increments on each capsule that fails to reach Epic; at 10, the next
   capsule is Epic or better. Resets on hit. Rendered as pips on the capsule screen.
3. **Relevance.** Reuse of the existing boon bad-luck rule (SPEC 6.11.E): within any three
   capsules, at least one must match the player's most-used tag or element.

**Odds disclosure.** The tier weights and the current pity counter are printed on the capsule before
it is opened. A capsule the player does not open stays in inventory indefinitely; there is no
expiry and no daily limit.

### D.5 Determinism and anti-scumming

Capsule contents are drawn from `combatRng`-style seeded randomness keyed on
`(userSeed, capsuleIndex)`, and the result is persisted **at the moment of the draw**, before the
reveal animation plays. Closing the app mid-animation, reloading, or restoring an older backup
cannot reroll a capsule. This is the existing SPEC 6.9 anti-scumming rule, applied to the new
object.

### D.6 Skill Dust — one ladder, two sources

Duplicates convert to Skill Dust: Common 1, Uncommon 3, Rare 8, Epic 20, Mythic 50.
Using a skill also earns dust: every 10 uses of a skill in a run grants 1 dust for it at run end.
Levels cost 5 / 15 / 40 / 90 dust for levels 2 through 5. Level effects are a flat +8% on the
skill's own potency per level, with level 5 attaching a modifier (e.g. `Cinder Cut LV5: also
applies Burn for 2 rounds`).

This deliberately replaces the "rank by use resets each run" idea from the earlier discussion with
one permanent axis, because two ladders on the same object read as a bug rather than as depth.

---

## 8. Section E — floor rule flips, and what bosses become

### E.1 Floor rules

One rule per floor, chosen by the seeded generator, **announced the moment the floor begins**, with
the next floor's rule already printed in the map header. Ten rules across the three Hollows:

`no Ward boons this floor` · `every skill costs 2 energy` · `crits heal the enemy instead of
doubling` · `only the first action each round may target the leader` · `Rest rooms do not heal` ·
`Mark expires in one round` · `enemy SPD +4, ATK −2` · `shop prices doubled, drops doubled` ·
`Guard also reflects 25%` · `elements invert weakness and resistance`.

Rules live in `src/core/delve/rules.ts` as a table of label, sentence and one pure helper each,
called at the exact site the rule talks about (energy, rest, shop, drops, boon pool, crits, Guard,
elements, spawn stats, Mark duration, targeting). The turn menu prices from a `TurnState` that
carries the rule's energy costs and target refusals, so the number shown and the number the engine
resolves cannot disagree.

One rule is adapted to the hand-played turn model: "only the first action each round may target the
leader" would allow every order in a one-order round, so `leader-guarded` instead refuses the
leader while any other enemy stands — the same intent, that the leader is shielded by its escort.
The printed sentence says exactly that, and an unstudied decider is shown the refusal.

### E.2 Bosses

Bosses keep their art, their intro sequence and their telegraphs. Phases are cut to two, and each
phase **adds a rule** rather than raising stats — phase 2 is "now marks you every round", not
"+20% ATK". The Heat-3 extra phase remains as a third rule.

The five phase rules are `thorns`, `marks-you`, `shields-itself`, `strikes-twice` and `drains`.
Three attach an affix the enemy table already owns (`thorned`, `vampiric`, `frenzied`) instead of
a second implementation of the same behaviour; `shields-itself` grants 8 Shield on entry;
`marks-you` applies the same Mark the companion's skills use, clamped by the floor rule's Mark
duration. A studied boss prints the phase name and the rule's sentence; an unstudied one prints
only that it shifted stance. The mechanic keeps `BossDef.mechanicMultiplier` — the one place a
boss's swing is still multiplied — and phases never touch it.

Boss Study keeps its shape and its ethics: fainting to a boss permanently reveals its weakness and
its tell. It reveals information only; bosses never gain stats from failure.

---

## 9. Section F — the patience economy

Two mechanics, one shared visible ledger, both with fully disclosed terms. Neither is a gamble: the
player always sees the number they decline and the number they would receive.

**Skip.** At a Treasure or Rest room, decline its reward and the next two rewards in the run pay
×1.8. Only one skip may be outstanding at a time, so it cannot be compounded into a required line.

**Interest.** At the end of each floor, held Glint pays 8% interest, capped at 40 Glint. Spending
Glint in a shop therefore has a visible opportunity cost.

Both are the app's actual thesis — delay a small reward, receive a larger one — expressed in fake
currency. Guardrails: multipliers stay modest enough that skipping is never the only viable line,
and no reward is ever withheld behind a timer.

**As built (Gate 7e).** One currency keeps the ledger honest: a "reward" means a **Glint payout
only** — the treasure cache and a positive event payout. Boons, healing, materials and Embers are
never multiplied, so nothing fractional and no second currency enters the books.

- **Skip.** The treasure cache now asks before it pays (`take` / `skip`); a Rest room offers `skip`
  beside `rest` and `retreat`, but only when its heal is above zero, so there is always a real
  reward to decline. Taking a skip sets `skipOutstanding` and `skipRewardsLeft = 2`; each Glint
  reward pays `Math.round(base × 1.8)` and counts one down, and the flag clears with the last one.
  While a skip is outstanding the offer is hidden and the engine refuses a forced skip, so one
  cannot be stacked on another.
- **Interest.** At a floor's end, after its completion Embers line and **before** the next floor's
  Forge grant, Glint held during the floor pays `min(40, round(held × 8%))`. Interest is never
  boosted by a skip and never consumes one; spending before the last room of a floor visibly lowers
  the payout.
- **Ledger.** The Kit panel carries a `Patience` block. Its skip line states the offer before any
  is chosen (`… on the next 2 Glint rewards`) or the remaining boosted payouts; its interest line
  states the percentage, the Glint held, the exact amount that will be paid at this floor's end and
  the cap. Both numbers are visible before the player chooses either mechanic.
- **Persistence.** `skipRewardsLeft` is optional on `RunState`: a v3 run stored before this gate
  predates the field, every reader treats `undefined` as zero, and the v3 shape pass fills it with
  `0`. No schema bump was needed.

---

## 10. Schema, persistence and existing players

### 10.1 Version 3

`src/data/migrations.ts` currently declares versions 1 and 2 (line 87-88). A `V3_STORES` step is
added with an `upgradeToV3`.

New `DelveMeta` fields: `skills: Record<string, { level: number; uses: number; lifetime: number }>`,
`knownSkills: string[]`, `equippedSkills: string[]` (max 4), `dust: number`,
`capsules: Record<string, number>` (tier → held count), `capsuleIndex: number`,
`pitySinceEpic: number`, `capsuleTagStreak: number`.

`DelveRun` gains `floorRule: string | null`, `skipOutstanding: boolean`, and `orders: TurnOrder[]`
(the player's decision log for the run, persisted so replay and the golden hashes stay exact).

Dropped: the `autopilot` policy object and `cards` array.

### 10.2 The player who is mid-run right now

The app is live, so real saved state exists. `upgradeToV3` must:

- Settle any `active` or `pendingChoice` run at its current step, credit **100% of the Embers earned**
  as if the player had retreated, mark it `result: 'retreated'` with a log line naming the update as
  the reason, and leave it in run history.
- Convert any equipped Habit Cards into dust at 5 each, so nothing silently vanishes.
- Grant the capsule that the oil spent on the abandoned run would have bought, so the update is
  never a loss. This is the no-shame rule applied to a schema change.

### 10.3 Export, import, backup

`src/data/exportImport.ts` validates by `schemaVersion`; v3 payloads carry the new fields and a v2
file still imports (upgraded through the same `upgradeToV3`). Delve state is already inside the
backup envelope, so the auto-backup path needs no change beyond the field additions.

---

## 11. Test surface

Rewritten:

- `tests/delve-combat.test.ts` — the `decide` parameter, guard, target choice, intent data.
- `tests/delve-engine.test.ts` — oil spent at run start instead of per step.
- `tests/delve-economy.test.ts` — interest and skip.
- `tests/delve-fuzz.test.ts` — 10,000 seeds now also fuzz random `TurnOrder` sequences; assertions
  keep HP bounds, no NaN/Infinity, termination within `ROUND_CAP`, a path to the boss on every map,
  and capsule offers never empty or duplicate-only.
- `tests/delve-golden.test.ts` — all five state hashes change; regenerate and record the reason.
- `tests/delve-breaker.test.ts` — new objective: no 4-skill set plus boon stack clears a Heat 5
  Hollow 3 run in fewer than a floor's worth of rounds.
- `tests/data-migrations.test.ts` — a stored v2 fixture upgraded to v3, asserting the mid-run
  settlement and the card-to-dust conversion.
- `tests/data-delve-store.test.ts`, `tests/data-delve-controller.test.ts`, `tests/data-export-import.test.ts`.

New: `tests/delve-turns.test.ts`, `tests/delve-capsules.test.ts` (odds, all three pity layers,
persist-before-reveal, dupe-to-dust), `tests/delve-skills.test.ts` (levels, moveset caps, tag
chains), `tests/delve-floorrules.test.ts` (all ten rules, announced at floor start, next floor
visible).

Deleted: `tests/delve-cards.test.ts`, `tests/delve-worker.test.ts`.

e2e: `e2e/delve.spec.ts` loses the policy and cards flows and gains a turn-choice flow;
`e2e/visual.spec.ts` drops `delve-policy` and `delve-cards` goldens and adds a turn panel and a
capsule screen; `e2e/helpers.ts` `startRun` changes with the oil cost.

---

## 12. Art, audio, bundle

- **New:** 60 skill icons at 24×24, five capsule frames plus a short open animation, a table-side
  turn panel, pity pips. All authored as code with the existing `src/art/px` toolkit and validated
  by `npm run art:validate`.
- **Kept:** the whole bestiary, boss sprites, tiles, parallax, the Realm diorama, chiptune tracks.
- **Retired:** 10 Habit Card glyphs.
- **Bundle:** the Delve worker chunk and its precache entry go away; the skill-icon data replaces
  some of it. Net expected to be neutral or slightly smaller. The precache count in the README and
  `docs/FINAL_REPORT.md` gets re-measured, not estimated.

## 13. Documentation

SPEC sections 6.9, 6.11.C and 6.11.M are marked superseded by this document rather than edited —
the original brief stays readable. The acceptance matrix in SPEC 13 loses the Autopilot, catch-up,
oil-per-step and Habit Card rows and gains: turn choice affects outcome; the sum shown equals the
sum computed; capsule odds and pity are on screen; a capsule cannot be rerolled by reload; a mid-run
v2 save settles at 100% Embers. `docs/PROGRESS.md` gains the Gate 7 record; `docs/MANUAL_TEST.md`
gains the tactile checks that cannot be automated.

The Gate 7g battle and menu layer is presentational only: `battleHud`, `battleMenu` and
`delveMenus` print what the engine already decided — prices, odds, caps, mastery — and never
compute a number the rules did not. Nothing in the GBA-style plates, dialog or dex changes an
outcome; the engine stays the single source of every sum on screen.

## 14. Gates

Each gate ships green: typecheck, lint, format, the full Vitest suite, and Playwright against the
production build.

- **7a — Legibility, no mechanics change.** Intent on every enemy, the itemized sum panel, the
  recap under the canvas. Ships alone so the owner can feel the difference before anything is
  deleted. Exit: sum shown equals sum computed, asserted in a unit test against `rollDamage`.
- **7b — The turn loop and the cut.** `TurnOrder` and the `decide` seam, the action UI, Autopilot /
  Habit Cards / catch-up / worker deletion, oil-per-run-start, schema v3 with the mid-run
  settlement. Exit: a full run playable by hand end to end in Chromium.
- **7c — Collection.** 60 skills, capsules with the three pity layers, Skill Dust, levels, the
  four-slot moveset, the Codex skills tab. Exit: fuzz over capsule draws proves no dud and no
  reroll-by-reload.
- **7d — Floor rules and bosses.** Ten rules, seeded and announced, boss phases as rule additions.
  Exit: every rule has a test that shows it changes an outcome.
- **7e — Patience economy.** Skip and interest with the shared visible ledger.
- **7f — Balance, docs, ship.** Personas re-tuned, golden hashes regenerated, fuzz and Breaker
  green, README and FINAL_REPORT re-measured, acceptance matrix rewritten.

## 15. Risks

1. **Hand-played runs will lose more than Autopilot did**, at first. The recap and the no-shame
   settlement have to ship in the same gate as the turn loop, or the game reads as punishing.
2. **60 skills × 5 levels is a large balance surface.** Mitigated by the +8%-per-level flat curve,
   the Breaker persona's new objective, and starting at 60 rather than the 250 first floated.
3. **Active play competes with the budgeting habit for the owner's time.** Mitigated by
   oil-per-run-start, which caps the day's play with the same curve that rewards logging, and by
   runs persisting between sittings.
4. **The v3 migration touches real saved data on a live deployment.** It is the highest-risk single
   item in this document and gets its own test fixture before any other 7b work lands.
5. **Not verified here, ever:** real-device touch feel, iOS Safari behaviour, and how the turn panel
   reads on a 390px phone in daylight. Those stay in `docs/MANUAL_TEST.md`.

## 16. Explicitly not changed

The budgeting screens, the money engine, the reward ledger, quests, achievements, the companion mood
model, Sparks and the cosmetic shop, the Realm scene and buildings, Heat, Glint shops, the Forge
tree, export/import beyond the new fields, the PWA, offline pack, CSP, `vercel.json`, and the
currency. None of them is in scope for Gate 7.
