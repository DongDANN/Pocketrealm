0. Role and mission

You are a senior full-stack engineer and game designer working autonomously in Claude Code. Build Pocketrealm, a complete, usable, gamified budgeting app that installs as a PWA, works fully offline, and deploys to Vercel. It must be a real budgeting tool first and a game second: the gamification exists to make people log spending, plan ahead, and save, never to distort their finances.

Prefer a complete, polished MVP over a large unfinished app. Build the real app, not a plan or mockup.

Environment reality check (do this first). Run uname -a, node -v, npm -v, and check whether Playwright can launch Chromium here. Record in docs/PROGRESS.md what you can and cannot verify. Logic and offline e2e (Chromium) should be verifiable. iOS Safari behavior, install prompts on real devices, push permissions, and the live Vercel deployment are not verifiable here: write manual checks in docs/MANUAL_TEST.md and never report them as verified.

1. Product vision

A calm, encouraging budgeting companion. You open it, see how much you can safely spend today, log a purchase in a couple of taps, and your companion creature reacts and grows. Weekly you do a short review ritual. Monthly your envelopes reset and you see how you did. Over time your realm (a small illustrated scene) fills with cosmetic rewards. Between check-ins your companion is off delving: exploring a procedurally generated dungeon on its own, fighting, finding boons and relics, and waiting at a campfire when the lantern runs low. When you open the app you see what happened, make a few meaningful roguelike choices, and go back to your day. Real budgeting habits keep the lantern lit.

Principles:

Utility first. The "safe to spend today" number and fast entry are the product.
Reward process, not deprivation. Points for logging, reviewing, planning, and saving. Staying within an envelope earns a bonus, but under-spending alone is not rewarded (it would encourage not logging).
No shame. Overspending is information. Copy is neutral and constructive. Misses never delete progress.
Private by design. Everything stays on the device.
Honest. The app is a tracking tool, not financial advice. Say so in Settings/About.
The game never overrides the budget. The Delve is a second layer. It is never required to use budgeting features, never rewards spending, never punishes a rough month, and never pressures the player (no limited-time events, no login-streak gates, no pushy timers).

Look and feel. Pocketrealm should feel like a real, lovingly detailed retro game: rich 16/32-bit-era pixel art, a warm lantern-lit palette, chiptune music, and a pixel-styled UI everywhere, including the budgeting screens. The retro skin must never cost clarity: numbers, labels, and contrast stay highly readable, and there is a "Readable text" toggle. Details are in section 15.

2. Scope tiers (cut in this order if time runs short)

MUST (MVP): the Delve (seeded roguelike runs with idle catch-up, Lantern Oil, boons and relics, 3 Hollows, Embers meta tree, Autopilot policy, run summary, plus the advanced systems marked MUST in 6.11); onboarding; envelopes with monthly allowances; income and expense (and transfer-between-envelopes) logging; quick-add under 3 taps; "Today" screen with safe-to-spend; savings goals; recurring transactions; companion with XP/levels and mood; Sparks and a small cosmetic shop; daily/weekly quests; ~20 achievements; logging streak with rest tokens; weekly review ritual; month rollover with a summary; insights charts; JSON export/import; settings (currency, period start day, theme, reduced motion, sound toggle); installable PWA; full offline; Vercel config; tests.

SHOULD: the advanced systems marked SHOULD in 6.11 (allies and party, story chapters, Endless Hollow, Heat 6 to 10, weekly mutators), app lock (passcode with WebCrypto), CSV export, envelope rollover options, search/filter on transactions, undo for destructive actions, multiple companions, seasonal themes, PWA manifest shortcuts ("Add expense").

LATER (document only): cloud sync and accounts, multi-device, bank import, shared budgets, push notifications (needs a server), localization beyond number/date formatting.

Never drop a MUST item silently; list it in the final report.

3. Architecture
   src/
   core/ pure TS: money, periods, budgets, rewards, quests, streaks, recurring, insights
   core/delve/ pure TS: seeded generation, auto-battle, boons/relics, oil, catch-up, meta tree
   data/ Dexie schema, migrations, repositories, import/export, backup
   game/ content tables: levels, quests, achievements, cosmetics, copy
   ui/ React components, screens, hooks, theme
   pwa/ service worker config, install prompt, update flow, storage persistence
   art/ original SVG/pixel/CSS art for companion, realm, icons
   tests/ e2e/ Vitest and Playwright
   core has no framework or storage dependencies; data adapts it to IndexedDB; ui renders. Inject a Clock and a seeded RNG everywhere.
   State: Dexie live queries (dexie-react-hooks) as the source of truth; keep UI state separate and small. Avoid heavy state libraries unless justified.
   Pin and check current stable versions; do not guess versions. Keep dependencies lean (the app should load fast on a mid-range phone).
4. Data model (illustrative; refine as needed)
   ts
   type Minor = number; // integer minor units; never a float

interface Settings { currency: string; locale: string; periodStartDay: number; // 1-28
theme: 'system'|'light'|'dark'; reducedMotion: 'system'|'on'|'off'; sound: boolean;
restTokensPerMonth: number; schemaVersion: number; }
interface Envelope { id; name; icon; colorKey; monthlyAllowance: Minor; rollover: 'none'|'carry'|'sweep-to-goal';
archived: boolean; sortOrder: number; }
interface Transaction { id; kind: 'expense'|'income'|'transfer'; amount: Minor; envelopeId?: string;
toEnvelopeId?: string; goalId?: string; date: string /* local YYYY-MM-DD _/; note?: string;
createdAt: number; updatedAt: number; deletedAt?: number; recurringId?: string; }
interface Goal { id; name; target: Minor; saved: Minor; dueDate?: string; icon; archived: boolean; }
interface Recurring { id; template: Omit<Transaction,'id'|'date'|'createdAt'|'updatedAt'>;
cadence: 'weekly'|'biweekly'|'monthly'; startDate: string; endDate?: string; lastGenerated?: string; }
interface RewardEvent { key: string /_ unique, deterministic _/; type: string; xp: number; sparks: number; oil?: number;
at: string /_ local date */; meta?: unknown; }
interface Companion { id; speciesKey; name; cosmetics: string[]; equipped: Record<string,string>; }
interface QuestProgress { questId; periodId; progress: number; completedAt?: number; claimedAt?: number; }
interface AchievementState { id; unlockedAt?: number; }
interface PurchaseRecord { cosmeticId; at: number; cost: number; }

// The Delve (see 6.9)
interface DelveMeta { embers: number; forgeNodes: string[]; hollowsUnlocked: string[]; codex: string[];
userSeed: number; runCounter: number; oil: number; oilEarnedToday: { date: string; amount: number };
lastDelveAt: number; maxSeenAt: number; autopilot: AutopilotPolicy; }
interface AutopilotPolicy { boonTagPriority: ('guard'|'fury'|'fortune'|'vigor'|'thrift')[];
retreatBelowHpPct: number; /* 0 = never auto-retreat _/ routePreference: 'safe'|'balanced'|'greedy'; }
interface DelveRun { id: string; hollowId: string; seed: number; rngState: number; stepIndex: number;
floor: number; roomIndex: number; map: RoomNode[][]; hp: number; maxHp: number; stats: Stats;
boons: string[]; relics: string[]; glint: number; embersBanked: number;
status: 'active'|'camped'|'pendingChoice'|'fainted'|'retreated'|'cleared';
pendingChoice?: { kind: 'boon'|'route'|'shop'|'event'; options: string[] };
log: RunEvent[] /_ capped ring buffer */; startedAt: number; budgetBuffs: BudgetBuff[]; }

Rules: dates are local calendar dates stored as YYYY-MM-DD (no timezone drift); soft-delete transactions; derive balances and progress from transactions rather than storing duplicates, except for caches that can be rebuilt.

5. Budget engine (core, fully tested)
   Periods: a budget period runs from the start day of one month to the day before the next start day (default start day 1; handle months with fewer days, leap years, DST). periodOf(date), daysLeft(period, today) (inclusive of today).
   Envelope status: spent, remaining = allowance + carry - spent, percentUsed, state ok | warning(>=80%) | over. Overspend is shown as negative remaining, never hidden.
   Safe to spend today: max(0, remaining) / daysLeft per envelope and in total, rounded down to a whole minor unit. Show "spent today" against it. Explain the formula in a help sheet.
   Rollover: per envelope: none, carry (positive and negative carry both apply), or sweep the unspent amount into a chosen goal at period close (as an explicit, visible transfer the user can undo within the review).
   Recurring catch-up: on app open, generate all missed occurrences up to today deterministically (idempotent by recurringId + date), also for long absences.
   Period close: produces a PeriodSummary (per-envelope result, total saved, best/worst envelope, streak stats) stored for the history screen. Closing must be safe to run twice.
   Property tests: sums of integer amounts are exact; splitting/transfers conserve totals; recurring is idempotent; period boundaries are correct across month ends and DST.
6. Game systems (all data-driven in src/game)
   6.1 XP and levels (idempotent reward ledger)

Every reward goes through grant(event) with a deterministic key; a duplicate key is ignored. Daily caps stop farming, and edit/delete/recreate cannot mint XP.

Event Key XP Sparks Cap
Log a transaction log:<txId> 5 1 first 8 per day
Daily check-in (open Today and confirm "all logged") checkin:<date> 10 2 1/day
Declare a no-spend day (explicit toggle) nospend:<date> 10 2 1/day; not valid if expenses were logged that day
Weekly review completed review:<weekId> 60 10 1/week
Envelope closed within allowance with at least 5 logged entries envok:<periodId>:<envId> 40 8 per envelope per period
Goal contribution goal:<txId> 15 3 first 3 per day
Goal reached goalDone:<goalId> 150 30 once
Quest completed quest:<questId>:<periodId> per quest per quest per quest
Achievement unlocked ach:<id> per achievement per achievement once

The "at least 5 logged entries" condition on envok prevents rewarding an envelope merely for being ignored. XP to reach level N: round(60 * N^1.5). Provide the full table and a test that levels are monotonic and the curve is documented.

6.2 Companion

A small original creature (design it; for example a round, moss-colored sprite with a lantern). Mood is derived from logging recency and review habits, never from how much was spent: Happy (logged today), Content (logged within 2 days), Sleepy (3-6 days, gentle "welcome back" copy), Resting (7+ days; no penalty, no decay of level). Evolves visually at levels 5, 10, 20, 35. Equippable cosmetics (hats, scarves, colors) bought with Sparks.

6.3 Streaks
Logging streak: consecutive local days with at least one logged transaction or a declared no-spend day or a check-in.
Each month grants 2 rest tokens; a missed day auto-spends a token (shown in the UI) before the streak breaks. A broken streak resets only the counter. No level, XP, or item is ever lost. Show the longest streak permanently.
Copy for breaks is kind ("Your companion took a nap. Ready when you are.").
Tested: token consumption, month boundary, clock changes (never negative), idempotence.
6.4 Quests
Daily (3 offered, deterministic from hash(userSeed, date)): for example log 3 entries, check in, review today's spending, add a note to an entry.
Weekly (2): complete the weekly review, contribute to a goal, keep one envelope under 80% at week end, log on 5 of 7 days.
Season (monthly arc, 1): a themed multi-step quest, such as "Fill the Lantern": finish the review, close 3 envelopes within allowance, reach a goal milestone.
Quests must reflect real budgeting actions. No quest asks the user to spend money or to spend less than they need.
6.5 Envelope "guardians" (light flavor, no pressure)

Each envelope has a guardian that shows its state: calm at under 60%, alert at 60-80%, "needs attention" at 80-100%, and a neutral "overspent" state above 100% with a constructive suggestion ("Move funds from another envelope?" with a one-tap transfer). Guardians heal at period rollover. Overspending never reduces XP or level.

6.6 Achievements (about 20, meaningful)

Examples: First Entry, 7-day streak, 30-day streak, First Weekly Review, 4 Reviews, First Goal Reached, 3 Envelopes Closed Within Allowance in One Period, No-Spend Weekend, Emergency Fund 1x monthly spend, Level 10, Backup Created, Installed to Home Screen, Used Offline (an entry created offline), and similar. Each has a clear unlock condition and a test. No hidden "grind" achievements.

6.7 Sparks and cosmetics

Sparks are earned only in-game and can only buy cosmetics (companion items, realm decorations, app themes). Nothing purchasable affects budgeting features. Sparks can't be bought with real money. A small catalog (about 20-30 items) at a handful of price tiers; unlocking is persistent and included in backups.

6.8 Realm scene

A single illustrated scene on a "Realm" screen that visibly grows as the player levels and buys decorations (original SVG/CSS art, performant, themed day/night to match the system theme). It's the delight layer; it must never block quick entry.

6.9 The Delve (roguelike + idle)

Concept. Your companion delves into procedurally generated dungeons called Hollows. A run is a short roguelike: branching routes, rooms, boons, relics, elites, a boss. Combat and walking are automatic. Most of a run happens while you are away; you make the interesting decisions when you open the app. A run ends in a clear, a retreat, or a faint, and permanent progress carries over.

Hollows (MVP: 3). Hollow 1 has 6 floors, Hollow 2 has 8, Hollow 3 has 10. Each unlocks by clearing the previous one plus a companion level gate. Each has its own theme, enemy set, and boss, with original names and art.

Map and rooms. Each floor is a small branching graph (3 to 5 rows, 2 to 3 columns) generated from seed = hash(userSeed, runIndex) and fully determined by it. Room types: Skirmish, Elite, Treasure, Rest (heal), Shop (spend run-only "Glint"), Event (a short text choice with real risk and reward), and the floor Boss. The path ahead is visible one row at a time; Embers upgrades extend this.

Auto-battle. Deterministic, seeded, round-based: SPD sets turn order; damage uses ATK vs DEF; LUCK drives crit and drop chances. A room resolves in one step and produces an event log the UI can animate. Provide about 10 enemy types, 3 elites, and 3 bosses (each boss with one readable mechanic, in the spirit of "telegraph, then counter"). Combat math lives in data tables and formulas in src/game/delve.

Boons and relics (the build layer). After Skirmish/Elite/Treasure rooms you are offered a choice of 3 boons (about 40 total, plus 10 fusion boons, see 6.11) tagged guard, fury, fortune, vigor, or thrift; stacking tags unlocks tag bonuses (for example 3 guard boons grants a shield each room). About 20 relics add rule-bending effects and synergies. Budget-flavored names are encouraged and must be original (for example "Rainy Day Fund: once per run, heal when HP drops below 30%", "Compound Interest: +1% ATK for every floor cleared this run", "Coupon Clipper: shop prices -20%"). Rarity is shown in text as well as color.

Choice points and Autopilot (the idle part). When a choice is needed (boon pick, route fork, shop, event) the run becomes pendingChoice. If you are present, you choose. If you are away, the Autopilot policy you configured decides deterministically: boon tag priority list, auto-retreat HP threshold, and route preference (safe, balanced, greedy). The log shows which choices Autopilot made and why. Ties break by seeded RNG. A run can also be set to "camp at the next choice" so it waits for you instead.

Lantern Oil (what fuels idle progress). Each room step uses 1 oil. When oil hits 0 the run camps at a campfire. Nothing is lost, no timer runs out, and resuming costs nothing. Sources of oil:

Free trickle: 20 oil per local day (so the game always moves a little, even if you don't log).
Budgeting habits: +4 per logged transaction (first 8 per day), +10 daily check-in, +10 declared no-spend day, +30 weekly review, +15 goal contribution (first 3 per day).
Daily earn cap 120 oil, storage cap 200. All grants go through the idempotent reward ledger (oil:log:<txId>, and so on). Oil is never derived from amounts of money, categories, or "how little you spent".
Time pacing: one step every 30 seconds while the app is open (animation pacing only; the simulation is step-based). Catch-up while closed is limited by min(elapsedSteps, oil) and a 12 hour cap.

Budget-linked buffs (small, capped, never penalties). At run start the app snapshots BudgetSignals and may grant up to +15% total, shown in the UI with the reason: a Ward (small shield) for each envelope that is within allowance if today's check-in is done (max 3); a Goal Banner (+LUCK) if you contributed to a goal in the last 7 days; a Reviewer's Lantern (+oil capacity) after a weekly review. Missing buffs is the baseline, not a penalty. State the limitation honestly in the UI help: the check-in is self-reported and the app does not try to verify it. Delve buffs never change budgeting math, rewards, or access.

Ending a run. Retreat at a Rest room banks 100% of Embers earned. Fainting (HP 0) banks 60%. A clear gives a bonus. Neither costs levels, XP, Sparks, cosmetics, or unlocked Forge nodes.

Embers and the Forge tree (meta progression). Embers buy permanent Delve upgrades in a tree of about 24 nodes: +max HP, more boon rerolls, an extra boon slot, longer map vision, a bigger oil capacity (up to its cap), new boons and relics into the pool, a second companion build, extra Autopilot slots. Nothing in the Forge changes budgeting features. Embers cannot be bought. Sparks (cosmetics) are earned in small amounts from first-time floor clears.

Delve rewards in the ledger. Add keys such as delve:floor:<runId>:<n> (10 XP, 1 Spark) and delve:clear:<runId> (60 XP, 10 Sparks, Embers via the meta table). Delve XP is capped at 30 per day so it cannot outpace budgeting XP. Delve-only quests (for example "Reach floor 3") live in a separate Delve quest list and are never required for budgeting rewards.

Determinism, safety, and integrity.

stepRun(run, signals, meta) -> { run, meta, events } is pure. State after N single steps equals state after one batch of N steps equals offline catch-up of N steps. Property-test it with random seeds and chunkings.
Persist run and meta in one Dexie transaction per batch. A crash mid-batch must never double-apply or lose a step (idempotent by runId + stepIndex).
Clock defense: elapsed = clamp(now - lastDelveAt, 0, 12h); if the clock went backwards grant 0 and keep maxSeenAt. Offline "claim" is idempotent: the summary is built from persisted events, and claiming twice grants nothing.
Anti-scumming: the seed and choice log are persisted; closing the app or restoring a backup cannot reroll an already-offered boon set. Importing an older backup is allowed, and the result is simply that older state.
Catch-up work is chunked and yields to the UI so a 12 h catch-up never freezes the app. Show a determinate progress bar and the summary after.

Anti-compulsion rules (required). No limited-time events, no daily login streak for the Delve, no notifications, no pay-to-skip, no loot boxes or gacha, no energy refill purchases, no fake urgency. Add a gentle "good place to stop" message after a long session. The Delve screen must never block or slow quick-add.

6.10 Delve balance tooling

npm run sim:delve: a headless script using the real core that runs personas for N simulated days and prints runs/day, floors cleared, Embers/day, time to clear each Hollow, and faint rates. Personas: Trickle (never logs, only free oil), Casual (logs about 3 per day), Habit (logs about 6, checks in daily, weekly review), Optimizer (max oil every day). Targets to tune toward and record in docs/PROGRESS.md: Trickle clears Hollow 1 in about 2 to 3 weeks; Casual in about 5 to 8 days; Habit in about 3 to 5 days; no persona clears faster than 2 days; Optimizer is at most about 2.5 times faster than Trickle in Embers per day (so good habits matter, but ignoring the app isn't hopeless); faint rate for a sensibly configured Autopilot is about 25 to 40% on a Hollow's first clear attempts.

6.11 Advanced Delve systems

This section deepens 6.9. Where numbers conflict, 6.11 wins. Everything is data-driven (tables in src/game/delve), deterministic, original in names, art, and text, and fully offline. Each item is tagged MUST or SHOULD.

A. Companion builds (MUST: 3).

Warden (tank: guard and shield tags), Spark (burst: fury and crit), Broker (economy and luck: fortune and thrift tags, extra Glint, shop discounts, relic synergies). Each has its own stat profile, two active skills, one passive, and a skill tree of about 12 nodes across 3 branches paid for with Embers. Respec is free between runs.
Unlocks: Warden at the start, Spark at companion level 8, Broker after clearing Hollow 1.

B. Combat depth (MUST).

Every unit has a basic attack plus up to 2 active skills with cooldowns (in rounds) and an energy cost. Energy regenerates 1 per round and +1 when hit.
Status effects: Burn (damage over time), Poison (stacking damage over time), Chill (SPD down), Stun (skip a turn, with diminishing returns and boss resistance), Mark (+25% damage taken), Shield (absorbs damage), Regen. Define duration, stacking, and cleansing rules in a table and test them.
Elements: Ember, Frost, Gale, Umbra. Enemies have one weakness and one resistance (about plus or minus 25%). Weaknesses are discovered through the codex (see K), not shown up front.
Termination: combat ends at a hard round cap (about 40 rounds). Reaching the cap counts as a draw that retreats the party safely, with no loss. Combat must never loop.

C. Habit Cards: the combat rules engine (MUST). A small, priority-based rule system for Autopilot, with 3 equipped slots and about 10 unlockable cards, each a when condition and a then action. Evaluate top to bottom, fire the first card whose condition is true and whose action is available (cooldown, energy, valid target), otherwise fall back to a basic attack. Examples (use original names and tweak): "Rainy Day: if HP is below 35%, use the guard skill", "Opening Move: use the strongest skill in round 1", "Mark Hunter: attack marked enemies first", "Steady Hand: use any skill that is off cooldown", "Finisher: use burst when the target is below 30% HP". The combat log records why each action was chosen and which cards were skipped. Tests must show that reordering cards changes outcomes.

D. Enemies, affixes, and boss phases (MUST).

About 12 enemy types across the 3 Hollows, 4 elites, and 3 bosses.
Affixes (about 8): Armored, Swift, Vampiric, Splitting, Enraged (below 30% HP), Thorned, Warded (starts shielded), Frenzied. At most 1 affix on ordinary enemies after floor 3 and up to 2 on elites. The map shows an elite's affixes before you commit to the room.
Bosses have 2 to 3 phases. Each heavy attack has a tell one round earlier (an on-screen warning and a log line), and a counter exists (guard reduces it, stun interrupts it, some skills cancel it).
Boss Study: if you faint to a boss, you gain Knowledge that permanently reveals its weakness and its next-phase tells. Bosses never gain stats from your failures.

E. Boon levels, fusions, and fair offers (MUST).

Boons can reach level 3 by being offered again and chosen. Tag thresholds (3 and 5 of a tag) unlock tag bonuses.
Fusions (10 at launch): holding two specific boons from different tags lets a Rest or Event room offer "Fuse" into a stronger boon with a new effect. Show the recipe in the codex once discovered.
Offer algorithm: seeded and weighted by rarity and your current tags, with a deterministic bad-luck protection (never more than 2 consecutive offers without a boon matching your top tag) and no empty or duplicate-only offers. A limited number of rerolls per run comes from the Forge tree.

F. Heat: optional difficulty (MUST: Heat 1 to 5; SHOULD: Heat 6 to 10).

Unlocks after the first clear of a Hollow, selected per run. Each Heat level adds a modifier (stronger enemies, more elites, a new boss phase, fewer Rest rooms, pricier shops, and so on) and increases Embers and Sparks rewards by a multiplier (about 1.1 per level). Never forced; Heat has no effect on budgeting features.

G. Allies and party (SHOULD). Up to 2 allies recruited through Events (about 6 allies), each with their own skills and a formation row (front or back) that affects who gets targeted. Allies gain "bond" over shared runs for small bonuses. This is a larger build, so ship it as its own follow-up gate.

H. The Workshop and a growing base (MUST: small version; SHOULD: larger).

Runs drop materials (Ore, Herb, Echo). The Workshop crafts consumables (healing draught, fire oil, smoke scroll, shield charm) that you equip into 3 run-start slots. Crafting uses materials and Embers only. Lantern Oil can never be crafted or bought, so oil keeps coming only from the free trickle and real habits.
Realm buildings unlock from real budgeting milestones, giving real-life progress a visible payoff. Examples: Treasury after your first savings goal is reached (more starting Glint), Library after your first weekly review (faster Knowledge gain), Smithy at companion level 10 (gear tempering), Observatory after 30 total days with a logged entry (see one extra map row ahead). Buildings are upgraded with materials and Embers and are optional. Combined building bonuses are capped at +10% Delve power.
Never use a milestone that rewards spending less or hiding spending (for example "stay under budget N times"). Process and savings milestones only.

I. Story and lore (SHOULD). Three short chapters across the Hollows answering "why is the lantern failing?": about 12 events and character conversations, a journal screen, text-first with simple art, strings kept in data files for later localization. Chapters advance on Hollow clears; some beats can also reference real milestones (first goal reached, first review) without exposing any amounts.

J. Daily challenge and Endless (MUST: daily; SHOULD: weekly mutators, Endless).

Daily Challenge: seed hash(date, "daily"), a fixed loadout, one attempt per local day, small Embers and Spark reward, and a locally stored personal best. It is the same dungeon for everyone on a date without any server. No leaderboard (that would need a backend; LATER). It does not consume oil.
Weekly mutator (SHOULD): one global rule change per week (for example "all enemies are Chilled") applied to the daily challenge.
Endless Hollow (SHOULD): unlocks after Hollow 3; floors scale forever; the score is deepest floor reached, kept as a local personal best.

K. Knowledge and mastery (MUST). First sightings reveal codex entries; kills against a type level up mastery, which reveals its stats, then weakness, then lore, and grants a small permanent damage bonus against that type (about +1% per mastery level, capped at +10%). Codex completion shows as a progress bar and unlocks cosmetics.

L. Presentation (MUST).

Render the Delve scene with PixiJS (or Canvas 2D if the measured bundle cost is much lower; decide with real numbers and record the decision) in a lazy-loaded chunk that is precached for offline, following the display and rendering rules in section 15 (320x180 logical scene, integer scaling in device pixels).
High-detail original pixel art per section 15: layered parallax per Hollow, richly animated sprites, dynamic lantern lighting, particles, damage numbers in the bitmap font, boss intro sequences, hit-stop and screen shake. Reduced-motion mode shows static portraits and a text log instead.
Chiptune music and SFX per section 15, with master volume and mute. Optional haptics through navigator.vibrate where supported, with a toggle.
Targets: 60 fps on a mid-range phone while animating; no per-frame allocations in hot paths; pause rendering when the tab is hidden. Record a throttled-CPU trace result, and mark real-device performance as not run if you can't test it.

M. Catch-up performance (MUST). Run catch-up and bulk simulation in a module Web Worker, with the same pure function used by Node tests. Chunk the work, report progress to the UI, and return a state patch. A 12 hour catch-up (at most 1440 steps, each up to 40 combat rounds) should finish in about 2 seconds on a mid-range phone; measure it in Node with a documented CPU throttle and note that real-device timing is unverified.

N. Integrity, fuzzing, and exploit hunting (MUST).

Fuzz tests: at least 10,000 random seeds with random builds, Heat levels, and Autopilot policies. Assert that HP stays within bounds, there are no NaN or Infinity values, currencies never go negative, combat terminates within the round cap, every map has a path to the boss, offers are never empty, and the same seed gives the same result.
Golden-run tests for about 5 fixed seeds (state hash), per Part A.
Breaker persona in sim:delve: tries to find degenerate builds. Any build that clears a Heat 5 Hollow 3 using only Trickle oil in under a day fails the balance check and must be fixed.

Follow-up gates after the MVP ships (SHOULD items, one at a time): 7a allies and party, 7b story chapters, 7c Endless and Heat 6 to 10, 7d weekly mutators. Each ships with its own tests and a balance run.

7. Screens

Every screen uses the retro pixel UI kit from section 15 (panels, buttons, gauges, icons, bitmap fonts) with a global Readable text toggle, and the Today and Add screens stay fast and uncluttered.

Onboarding (about 3 minutes, skippable parts): welcome, currency/locale (default from device), monthly income, period start day, choose a starter template (Essentials 50/30/20, Student, Custom) which creates envelopes, pick and name the companion, one-sentence privacy promise ("Your data stays on this device"), optional install prompt.
Today: safe-to-spend hero number, today's spent, envelope strip with guardian states, big Add button, companion with mood, streak, quest chips, "Check-in" action.
Add (quick entry): custom large number pad, envelope chips (recent first), date defaulting to today, optional note, income/expense/transfer toggle, recurring toggle. Saving gives a short reward toast and companion reaction. Target: expense logged in at most 3 taps after opening.
Envelopes: list with progress bars (plus text, not color alone), detail with transactions, edit allowance, rollover, archive; transfer between envelopes.
Goals: progress, contribute, due date projection, celebrate on completion.
Quests and Achievements: active quests, claim flow, achievements grid.
Companion and Realm: companion care view, cosmetics shop, realm scene. 7b. Delve: current run view (map, companion, HP, oil, boons and relics, live event log), pending-choice sheet (boon pick, route fork, shop, event) with clear stat previews, Autopilot policy editor, start a run (choose Hollow, see budget buffs and their reasons), camp/resume, retreat with confirmation, "While you were away" catch-up summary (steps, rooms, loot, choices Autopilot made, Embers banked), the Forge tree, a codex of boons/relics/enemies seen with mastery, past-run history, the Habit Cards editor, build and skill-tree screen, the Workshop and Realm buildings, a Heat selector, the Daily Challenge, and (SHOULD) the party screen and story journal, per 6.11. The Today screen shows a compact Delve strip (oil, floor, status) that opens this screen. Fully usable on a phone with one thumb; respects reduced motion.
Insights: spending by envelope (this period and previous), 6-month trend, income vs spending, top notes/merchants (simple text grouping), streak calendar. Use accessible charts (patterns/labels, data table fallback).
Review (weekly ritual): a guided 60-second flow: confirm all entries logged, glance at envelopes, adjust one allowance if needed, pick a focus for next week; ends with a reward.
History/Transactions: search, filter by envelope/date, edit, delete with undo.
Settings: currency/locale, period start day, theme, reduced motion, sound, rest tokens info, export/import/backup, storage status (persisted or not), install help, "Delete all data" (typed confirmation), About and disclaimer, app version and update status.

Every invalid action explains why. Destructive actions confirm or offer undo. Keyboard navigable, screen-reader labeled, AA contrast, no color-only meaning, respects prefers-reduced-motion, and touch targets of at least 44px. Mobile-first, works on desktop widths too.

8. PWA and offline (the hard requirements)
   vite-plugin-pwa with Workbox: precache the entire app shell and all assets; registerType: 'prompt' with an in-app "Update available, reload" flow (never silently swap mid-entry).
   Cold launch while offline after one online visit must work. Navigation fallback to index.html; SPA routing works offline and on deep links.
   Manifest: name, short_name, display: standalone, theme/background colors, start_url with a scope that works on Vercel, maskable and regular icons (192/512 plus Apple touch icon), screenshots if easy, and shortcuts (Add expense, Today).
   Install UX: capture beforeinstallprompt for Chrome/Edge/Android and show a gentle, dismissible install card; on iOS Safari show a one-time "Share, then Add to Home Screen" instructions card (no automatic prompt exists there).
   Storage durability: call navigator.storage.persist() when appropriate and show status in Settings. Be honest in the UI: browsers can evict site data, especially on iOS Safari for sites that are not installed to the Home Screen. Include a visible backup reminder (export file) after significant activity, and track last backup date.
   No remote fonts or third-party scripts; self-host fonts or use system fonts.
   Offline indicator: subtle, never alarming ("Working offline. Everything is saved on this device.").
   Do not promise notifications. Local scheduled notifications are not reliably available in browsers; web push needs a server (LATER). Use in-app reminders (a banner on open) only.
   Service worker updates must never wipe user data; database migrations run on open and are tested.
9. Data safety
   Export: a single JSON file with a schemaVersion, app version, and all tables; optional CSV of transactions.
   Import: validate with zod and the schema version, show a preview (counts, date range), auto-create a backup of the current data first, then offer merge or replace with confirmation; abort cleanly on any error with no partial writes (use one Dexie transaction).
   Migrations: Dexie version(n).stores().upgrade() with tests that start from stored fixtures of each old version.
   A corrupt or blocked IndexedDB (private mode, quota error) is handled with a clear message and a read-only fallback, not a blank screen.
   "Delete all data" requires typing a confirmation word and offers an export first.
10. Vercel deployment
    Static build output dist/. Provide vercel.json with: SPA rewrite to /index.html (excluding real files), Cache-Control: public, max-age=31536000, immutable for hashed assets, no-cache (revalidate) for /sw.js, /index.html, and the manifest, correct Content-Type for manifest.webmanifest, and security headers (CSP restricted to self with inline-script handling that the build actually needs, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Verify the CSP does not break the service worker or inline styles by testing the production build.
    Document the two deploy paths (Git integration and npx vercel), the required build settings (Framework Vite, build command, output dist), and how to verify the PWA after deploy (Chrome DevTools Application tab, Lighthouse).
    No server code, no environment secrets, no database. If you add anything that needs an env var, stop and justify it.
11. Testing and verification
    Vitest (advanced Delve): status effect rules (duration, stacking, cleanse, stun diminishing returns); skill cooldown and energy; elemental weakness modifiers; Habit Card priority order, fallback, and "why" log; reordering cards changes outcomes; affix behavior; boss tells and counters; boss phases transition correctly; Boss Study reveals knowledge but never changes boss stats; offer algorithm bad-luck protection, no empty offers; fusion recipes; skill-tree prerequisites and free respec; Heat modifiers and reward multipliers; crafting never produces oil; milestone buildings unlock only from allowed milestones and stay under the +10% cap; daily seed identical for the same date; mastery bonuses capped; 10,000-seed fuzz run; golden hashes; worker output equals Node output; combat round cap terminates.
    Vitest (Delve): seeded generation produces identical maps for the same seed; combat determinism; stepwise equals batch equals catch-up (property test over random seeds and chunkings); oil grants idempotent and capped; free trickle and daily cap; clock rewind and 12 h cap; claim-once; crash-safety (replaying a step key is a no-op); Autopilot policy decisions are deterministic and explained; boon tag bonuses; budget buffs cap at +15% and are never negative; budget data is never modified by the Delve; fainting and retreat bank the right Embers; Forge nodes apply correctly; sim:delve persona targets within tolerance.
    Vitest: money utilities and rounding, period boundaries (month ends, leap years, DST, custom start day), safe-to-spend, envelope status, rollover, recurring catch-up and idempotence, XP ledger idempotence and caps, edit/delete cannot mint XP, level curve, streaks and rest tokens, quest rotation determinism, achievements, import/export validation, migrations from fixtures.
    Playwright (Chromium): onboarding to first entry; quick-add taps; envelope overspend flow with transfer; weekly review; backup export then import round trip; offline: load online once, context.setOffline(true), reload and cold-start, add entries, go back online and confirm data intact; update-available flow with a simulated new build if feasible.
    Visual and art checks: a palette-conformance script (every sprite, tile, and icon uses only master-palette colors), a size/frame-count validator, a pixel-purity check (no fractional positions or runtime rotation/scaling in render code paths), Playwright screenshot goldens for the UI kit, the Today screen, and one Delve scene at fixed seeds, and an integer-scaling test across several viewport and device-pixel-ratio combinations (no blurry or unevenly sized pixels).
    Lighthouse CI: PWA installability checks, performance and accessibility budgets (aim for 90+ on accessibility and best practices; document actual numbers).
    Manual checklist (docs/MANUAL_TEST.md): install on Android Chrome, iOS Safari Add to Home Screen, airplane-mode cold launch, storage persistence, update flow on a deployed preview, screen reader pass.
    Report each result as verified / partially verified / not run, with the command or test name.
12. Gates (work in this order; commit at each)

Gate 0: Foundation. Inspect environment. Scaffold Vite + React + TS strict, Vitest, Playwright, PWA plugin, lint/format. A hello-world app that installs and loads offline in Playwright. docs/PROGRESS.md created with environment notes.

Gate 0.5: Retro style lock. Do the vertical slice described in 15.13: the master palette, the px drawing toolkit, an original bitmap font, the integer-scaled low-res renderer scaffold, the seed of the UI kit (panel, button, gauge, number pad), one companion build (idle and attack), one enemy, one tiled room with lighting and parallax, a mock Today screen in the skin, a short chiptune loop and 3 SFX. Render and view the contact sheets, run the independent review pass, fix problems, and then stop and wait for the owner's approval of the look before any mass art production.

Gate 1: Core logic (headless). Money, periods, envelopes, safe-to-spend, rollover, recurring, rewards ledger, XP/levels, streaks and rest tokens, quests, achievements, insights helpers. Full tests, including property tests. No UI.

Gate 1.5: Delve engine (headless). src/core/delve: RNG, map generation, auto-battle, enemies/bosses, boons and relics with tag bonuses, choice points and Autopilot, Lantern Oil, BudgetSignals and capped buffs, catch-up with clock defense, Embers and the Forge tree, ledger hooks, and npm run sim:delve. Tests per section 11. No UI yet. Tune against the persona targets and record the output.

Gate 1.6: Advanced Delve systems (headless). Implement every MUST item in 6.11 (builds and skill trees, skills and statuses, elements, Habit Cards, affixes, boss phases and Boss Study, boon levels and fusions, fair offers, Heat 1 to 5, consumables and Workshop logic, milestone buildings, daily seed, mastery), the worker-compatible catch-up (M), and the fuzz and golden tests (N). Extend sim:delve with the Breaker persona. No UI yet. Record balance output and the bundle plan.

Gate 2: Data layer. Dexie schema, repositories, migrations with fixtures, Delve run/meta persistence with atomic step batches, export/import with validation and auto-backup, reward ledger persistence, period close, recurring generation on open. Tests for all of it.

Gate 3: Core screens. Onboarding, Today, Add, Envelopes, Goals, History, Settings with real data, built in the retro UI kit from section 15. Reward toasts and companion reactions wired to the ledger.

Gate 4: Game layer. Delve screens (map, choices, Autopilot and Habit Cards, catch-up summary, Forge and skill trees, Workshop and Realm buildings, Heat, Daily Challenge, codex and mastery) and the lazy-loaded Pixi (or Canvas) scene with original art, audio, and animation for the 3 builds, enemies, bosses, boons, relics, and Hollows. Produce art in the order given in section 15 (companions, enemies, bosses, tiles and backgrounds, icons and effects, Realm, title), verify each family by rendering contact sheets and reviewing them (including the independent review pass), and record bundle and texture sizes against the budgets. Quests and achievements UI, companion and cosmetics shop, realm scene, weekly review flow, month-close summary, insights charts. Original art.

Gate 5: PWA hardening. Offline e2e, update flow, install cards (Android/desktop and iOS), storage persistence and backup reminders, error states, manifest shortcuts.

Gate 6: Polish and ship. Accessibility pass, reduced motion, Lighthouse budgets, vercel.json, README (install, dev, test, deploy, how offline works, backup guidance, limitations), docs/MANUAL_TEST.md, final report.

13. Acceptance matrix

For each item give status (verified / partially verified / not run), how (test name, command, manual step), and caveats.

Installable PWA; passes installability checks
Cold launch and full use offline after one online visit
Update flow does not lose data or interrupt entry
Add expense in at most 3 taps; safe-to-spend updates immediately
Envelope math exact (integer money), period boundaries correct
Rollover and period close idempotent
Recurring catch-up correct after long absence
XP ledger idempotent; edit/delete/recreate cannot mint XP; caps work
Streaks with rest tokens work; no loss of level on a miss
Quests rotate deterministically; claims work once
Achievements unlock correctly
Cosmetics purchase and equip persist; Sparks can't go negative
Delve: same seed gives the same run; stepwise, batch, and offline catch-up results are identical
Delve: oil comes only from the free trickle and logged habits (never from amounts spent); daily and storage caps hold
Delve: catch-up is capped at 12 h, clock-safe, chunked without freezing the UI, and claimable once
Delve: Autopilot makes deterministic, explained choices; "camp at choice" waits for the player
Delve: budget buffs are capped at +15%, never penalties, and never change budgeting data or access
Delve: retreat/faint/clear bank the correct Embers and never remove levels, XP, Sparks, or cosmetics
Delve and Forge state are included in export/import and migrations
Delve is not required for any budgeting feature and never delays quick-add
No notifications, limited-time events, or login-streak gates anywhere in the Delve
sim:delve output recorded; persona pacing within the stated targets
Advanced Delve: 3 builds with working skill trees; statuses, elements, affixes, and boss phases behave per their tables
Advanced Delve: Habit Cards change real combat behavior, in the right priority order, with a "why" log
Advanced Delve: Boss Study reveals information only; bosses never get stronger from player failures
Advanced Delve: fusions, bad-luck protection, Heat 1 to 5, Workshop crafting, and milestone buildings work and respect their caps
Advanced Delve: oil can't be crafted or bought; no milestone rewards spending less or hiding spending
Advanced Delve: daily challenge is identical for the same date and playable offline
Fuzz (10k seeds) and golden-run tests pass; Breaker persona finds no degenerate build
Worker and Node simulations match; 12 h catch-up does not freeze the UI; timing recorded (real-device timing marked not run if untested)
Delve chunk is lazy-loaded and precached; bundle budgets recorded; reduced-motion mode works
Art: all sprites, tiles, and icons pass palette, size, and frame-count validation; no runtime rotation or fractional scaling
Art: scenes are crisp at integer scales in device pixels across the tested viewport and DPR combinations
Art: style-lock checkpoint was reached and approved by the owner before mass production (or recorded as skipped, with why)
Art: independent review notes and contact-sheet evidence recorded in docs/ART_NOTES.md; no claim of hand-drawn quality
UI: pixel UI kit used on every screen; Readable text toggle and High contrast option work; money amounts pass contrast checks
Audio: chiptune music and SFX work offline, start only after a user gesture, and respect master volume and mute
Offline pack: all art and audio data are precached (with a first-run "Preparing offline pack" progress), within the stated size budgets
Weekly review and month summary work
Export/import round trip; invalid import rejected with no partial writes; auto-backup created
Migrations from every old schema fixture
Storage persistence status shown; backup reminder works
No network requests carry user data (verify in e2e by asserting no external requests)
Accessibility basics (keyboard, labels, contrast, reduced motion)
vercel.json correct; preview deploy instructions documented
No dead buttons; no placeholder UI or lorem ipsum 14. Working rules
Inspect before changing. Keep modules small and typed; no any without a comment.
No stubbed core systems. If a feature is too big, ship a working simplified version and document it.
Keep docs/PROGRESS.md current at every gate so a fresh session can resume.
Report honestly, especially for anything that needs a real device or the live Vercel deployment.
Original art and copy only. No copying another app's UI, names, or assets. 15. Retro pixel-art direction (high detail)
15.1 Target look

The quality bar is late-16-bit and 32-bit-era 2D pixel RPGs and modern high-end pixel art: dense, hand-crafted-looking detail, rich shading, strong silhouettes, atmospheric lighting. Original assets only. Do not copy or trace any existing game's sprites, characters, UI, or music, and do not imitate a specific franchise. The style applies everywhere: the Delve, the Realm, the title screen, and the budgeting UI (pixel panels, buttons, gauges, icons), while keeping money values perfectly readable.

Mood: deep midnight and ink backgrounds; a warm lantern amber as the unifying light source (the lantern is the game's motif); cyan energy, violet rifts and shadows, teal and moss accents; a cozy but slightly mysterious tone.

15.2 Honest expectations

Claude Code authors art as code, so this is procedurally authored pixel art, with a ceiling below a skilled artist's hand-drawn work. Say so plainly in the README. Make it easy for the owner or an artist to replace any asset (15.11). Never claim hand-drawn quality, and never claim pixel-perfection that wasn't checked by viewing the output.

15.3 Display and rendering rules (pixel purity)
Scene resolution: 320x180 logical (16:9). Render to a low-res render target and upscale by an integer factor computed in device pixels (so it stays crisp on a DPR 3 phone), centered with a palette-colored border for leftover space. On portrait phones, show the scene in a window at the top with UI panels below.
Nearest-neighbor everywhere: Pixi scaleMode: 'nearest', roundPixels, antialias: false; DOM images use image-rendering: pixelated.
All sprites, particles, and the camera sit on integer pixel positions. No runtime rotation or fractional scaling of sprites (pre-render rotated frames if needed). Text is drawn with bitmap fonts at integer scales.
Optional single-pass CRT/scanline effect: off by default, a setting, disabled automatically in reduced-motion or low-power cases. No heavy full-screen shaders.
Pause rendering when the page is hidden; target 60 fps for movement, with animation frames on their own timing (often 8 to 12 fps for a snappy retro feel).
15.4 Palette
One master palette of about 64 colors in src/art/palette.ts, organized into named, hue-shifted ramps of 5 to 7 steps (shadows drift cooler and toward violet, highlights drift warmer), plus per-Hollow accent sub-palettes (at most 16 each) and a UI palette. Include one ramp per rarity (Common, Uncommon, Rare, Epic, Legendary, Mythic) and per element (Ember, Frost, Gale, Umbra).
Every asset may only use palette colors (enforced by the validator). Palette swaps (hit flash, status tints, day and night, Heat tint, rarity glow, accessibility "high contrast") are done with index remapping, not blending.
Optional retro palettes (SHOULD): monochrome green, amber CRT, and a 16-color mode, via palette remap.
Write a swatch sheet to docs/art-preview/palette.png.
15.5 Pixel-craft rules (the detail checklist)

Apply to every sprite, tile, and icon; review against it explicitly:

Silhouette first: every enemy and boss is identifiable as a flat black silhouette at 1x.
Light from top-left; shade with 5 to 7-step ramps; use hue shifting; keep a consistent light direction across assets.
Selective outlining (selout): outlines are dark tinted ramp colors, lighter where light hits, not pure black; interior lines are used sparingly.
Manual-style anti-aliasing on curves and diagonals (clean pixel-perfect lines, no jaggies or doubles); no mixed pixel sizes.
Dithering (Bayer 2x2 and 4x4) only for gradients, glows, and large surfaces, never as noise on small sprites.
Avoid pillow shading, banding, and orphan pixels; use ambient-occlusion pixels in crevices and under overhangs; add rim light matching the Hollow's accent.
Material cues: metal gets sharp highlights, cloth gets soft ramps and folds, crystal gets facets and internal glow, fur and slime get texture clusters.
Readable at 1x and rich at 4x: include micro-detail (stitching, scratches, runes, buckles) at a density that rewards zooming without turning into noise.
Companion identity: each build has a clear silhouette and a lantern or lantern-derived motif.
15.6 Sprite specifications (frames are minimums; frame time lives in data)
Asset Canvas MUST frames SHOULD
Companion, each of 3 builds 48x48 idle 6, walk 8, attack 6, skill A 6, skill B 6, hurt 3, death 6, camp 4 victory 6, cast variants, 64x64 portraits with 4 expressions
Ordinary enemies (12) 32x32 or 48x48 idle 4, attack 5, hurt 2, death 5 alternate palettes per Heat
Elites (4) 64x64 idle 6, attack 6, hurt 3, death 8
Bosses (3) 96x96 to 128x128 per phase idle 6, 3 attacks of 6 to 8 frames, hurt 3, phase change 8, death 12, plus a telegraph pose per heavy attack intro animation
Affix and status overlays 16x16 to 48x48 8 affix auras, 7 status icons and aura loops
Effects varied slash (3), impact, 4 elemental casts, heal, shield, level-up, loot sparkle, boss intro, death poof, torch/lantern flame, ember particles
Icons 24x24 (items), 16x16 (UI) about 40 boons, 10 fusions, 20 relics, 18 skills, 8 consumables, 3 materials, about 40 UI/budgeting icons rarity glow frames
15.7 Environments and lighting
Tilesets at 16x16 per Hollow with autotiling (a 47-tile blob or 16-tile bitmask scheme; choose and document), floor, wall, ceiling, edge, and about 24 decor and hazard pieces per Hollow, plus 6 animated tiles (flames, water, glowing crystal, and similar).
Backgrounds: 4 tileable parallax layers (320x180) per Hollow, 3 boss arenas with unique composition, a title splash scene, and the Realm: a floating-island diorama that visibly gains buildings as they unlock (Treasury, Library, Smithy, Observatory, Workshop), with ambient animation (smoke, water, birds, drifting embers).
Lighting: a warm dynamic glow around the lantern that follows the companion with subtle flicker; additive light sprites for torches and crystals; a dithered pixel vignette (not a blur); per-Hollow ambient tint using palette ramps; a day/night variation for the Realm.
Atmosphere: dust motes, embers, snow, spores as integer-position particles; dithered iris and wipe room transitions; boss arena letterbox intro.
15.8 UI kit and fonts
Bitmap fonts authored as data (original, license-free): a compact readable text font and a larger display font, with extended Latin and currency symbols (including peso, euro, yen, pound, rupee) and tabular digits. Provide a Readable text toggle that swaps in the system font at the same layout, and a High contrast option. Money amounts always use a clear numeric face at a comfortable size, with AA contrast.
9-slice frames in two skins: a warm "parchment ledger" for budgeting screens and a dark "steel and crystal" for the Delve. Buttons (normal, hover, pressed, disabled, focus), toggles, sliders, tabs, modals, toasts, a number pad, and a pixel text cursor.
Gauges for HP, XP, oil, and envelope progress with animated shine; coin and Spark icons; envelope guardian portraits.
Charts (Insights) are drawn in pixel style and always have an accessible data-table fallback and non-color cues.
The focus ring is a visible pixel outline for keyboard users. All of this respects reduced motion.
15.9 Animation and game feel
Principles: anticipation and follow-through frames, 1 to 2 smear frames on fast swings, hit-stop of 2 to 3 frames on impact, decaying screen shake, white hit flash by palette swap, secondary motion (cloth, hair, lantern flame), idle breathing, easing expressed as discrete steps.
The companion reacts on the budgeting screens (logging an expense, finishing a check-in, leveling up) with short, optional animations that never delay input.
Boss intros use letterbox bars and a name banner; level-ups and fusions get short celebratory sequences; critical hits get larger bitmap damage numbers. Reduced motion replaces all of this with static frames and text.
15.10 Audio (original chiptune, synthesized)
A small tracker-style engine over WebAudio: 4 channels (2 pulse with selectable duty cycle, 1 triangle, 1 noise), pattern and order data stored as JSON in src/game/audio, tempo and swing parameters, loop points, and simple volume and pitch effects (arpeggio, vibrato, slide).
Music: at least 6 original tracks: title and budgeting theme (calm, cozy), a theme per Hollow (3), a boss theme, and a results jingle; short stingers for level-up, fusion, and quest complete.
SFX: a parametric synth (frequency, slide, envelope, duty, noise) with a preset library of at least 24 sounds (hits, skills per element, statuses, UI clicks, coin, loot, error, level-up).
Audio starts only after a user gesture, is off or very low by default, has master and separate music and SFX volumes, ducks under rapid SFX, and loads lazily with the Delve chunk. No audio files, so offline just works.
15.11 Authoring toolchain (code-first, replaceable)
px drawing toolkit in src/art/px: pixel-perfect lines (Bresenham), midpoint ellipses, polygons, flood fill, mirror and symmetry, layer compositing, outline and selout passes, ramp lookup, Bayer dithering, ambient-occlusion pass, and an auto-lighting pass that shades a silhouette using a height or depth map and a ramp. Authors draw shapes and height maps, the tool lights them, and then explicit pixel overrides touch up details.
Part-based rigs for characters: draw body parts as separate layers and compose frames with integer offsets per frame (head bob, arm swing, weapon arcs drawn as dedicated frames), so animation stays pixel-clean. Large bosses use multi-part composition.
Sprites are TypeScript modules registering assets by key (for example companion.warden.attack, enemy.hollow1.slime.idle, ui.panel.ledger, icon.boon.compound-interest).
Replaceable by hand-drawn art: an importer for Aseprite JSON + PNG sheets (frame tags become animations) and plain PNG strips. If assets/override/<key> exists it replaces the generated asset, validated against the same palette and size rules, with clear errors otherwise.
Atlas packing at build time with extruded edges (no bleeding), palette-quantized and well-compressed PNGs, a core atlas for the budgeting UI, and one lazy-loaded atlas per Hollow.
Budgets: total precached art and audio about 6 MB or less; GPU texture memory about 64 MB or less (record actual numbers). The first install downloads the offline pack, so show a progress screen and make the app usable in the meantime.
15.12 Verification loop (required)
For each asset family, render contact sheets at 1x, 3x, and 6x with the palette swatch, a flat-silhouette view, and onion-skin strips for animations (and animated GIF previews if feasible), written to docs/art-preview/.
Open the PNGs and look at them. Critique against the 15.5 checklist; fix; repeat at least twice per family.
Independent review: spawn a separate reviewer subagent that sees only the rendered images and the checklist (not the code) and returns concrete defects. Fix what it finds, and record both passes in docs/ART_NOTES.md.
Lock results with Playwright screenshot goldens and the validators from section 11.
15.13 Style-lock checkpoint (Gate 0.5)

Produce a small vertical slice and stop for the owner's approval before mass production: the palette sheet, the font sample, one companion build (idle and attack), one enemy, one tiled room with lighting and parallax, the UI kit seed, a mock Today screen in the skin, a 10 to 20 second chiptune loop, and 3 SFX. If the owner supplies concept images in assets/reference/, treat them as mood-board inspiration only: never import, trace, or ship them. After approval, produce in this order: companions, enemies, bosses, tiles and backgrounds, icons and effects, UI polish, Realm, title splash, music. If time runs short, ship simpler original versions (fewer frames, smaller canvases) rather than blocking gameplay, and note it in docs/PROGRESS.md.

16. Final deliverable

Source code; README; docs/ (SPEC, PROGRESS, MANUAL_TEST); tests; vercel.json; exact commands to install, run, test, build, and deploy; and a final report with the acceptance matrix, Lighthouse numbers, known limitations, and suggested next features (sync, push, localization).

First priority: a fast, reliable offline budgeting core with exact money math, then the game layer on top. Begin with Gate 0 now.
