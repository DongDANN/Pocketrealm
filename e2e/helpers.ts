import { expect, type Locator, type Page } from '@playwright/test';

/**
 * UI copy is drawn with the bitmap face, so `textContent` is empty in pixel mode: a single line
 * becomes one labelled canvas and a wrapped block becomes one labelled wrapper plus unlabelled
 * canvases. Collects real DOM text (readable mode) and every aria-label below the root.
 */
export function visibleText(page: Page, selector: string): Promise<string> {
  return locatorText(page.locator(selector).first());
}

/** `visibleText` for a handle you already hold, so a test can read one row of a list. */
export function locatorText(node: Locator): Promise<string> {
  return node.evaluate((root) => {
    const labels = Array.from(root.querySelectorAll('[aria-label]')).map(
      (el) => el.getAttribute('aria-label') ?? '',
    );
    return [...new Set([root.textContent ?? '', ...labels])].join(' ').replace(/\s+/g, ' ').trim();
  });
}

/** The same read, over every matching node, kept apart so a test can tell two rows apart. */
export async function allText(page: Page, selector: string): Promise<string[]> {
  const nodes = await page.locator(selector).all();
  return Promise.all(nodes.map(locatorText));
}

/**
 * Opens a fresh book through the real onboarding screen. Every spec that needs the app (rather than
 * the style-lock mocks) starts here, because the only way into the screens is a completed book.
 */
export async function completeOnboarding(
  page: Page,
  options: { income?: string; currency?: string; companionName?: string } = {},
): Promise<void> {
  await page.goto('/onboarding');
  await page.getByRole('textbox', { name: 'Monthly income' }).fill(options.income ?? '25000');
  if (options.currency)
    await page.getByRole('combobox', { name: 'Currency' }).selectOption(options.currency);
  if (options.companionName)
    await page.getByRole('textbox', { name: 'Companion name' }).fill(options.companionName);
  await page.getByRole('button', { name: /Open my book/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
}

/**
 * Waits for the first offline copy to be complete: an active worker whose cache already holds the
 * app shell. Cold-launch tests must not go offline before this or they only prove the network works.
 */
export async function waitForOfflinePack(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return false;
    const keys = await caches.keys();
    if (keys.length === 0) return false;
    const cache = await caches.open(keys[0]!);
    const requests = await cache.keys();
    return requests.some((r) => r.url.includes('/index.html') || r.url.endsWith('/'));
  });
}

/** The thumb bar, so a label like "Envelopes" cannot collide with a link inside a panel. */
export function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' });
}

/**
 * Begins a real Delve run. The densest screen in the book: map, kit, choices and log all at once,
 * so layout and style checks that only visit the camp screens would miss it.
 */
export async function startRun(page: Page): Promise<void> {
  await page.goto('/delve');
  await page.getByRole('button', { name: /^Descend into Rootfall Warren/ }).click();
  await expect(page.getByRole('heading', { name: 'Kit' })).toBeVisible();
}

/**
 * ── The hand that plays a run ────────────────────────────────────────────────────────────────
 *
 * Since the cut, a room only closes when the player orders it closed, so every spec that needs a
 * finished room has to play one. These helpers are that play: they read the panel's own printed
 * numbers rather than a copy of the engine's arithmetic, which is the only way a stale price on
 * screen fails a test instead of passing one. They live here because the goldens have to walk the
 * same rooms the run tests do.
 */

/** What the hand actually pressed: the two orders an open room accepts. */
export interface Played {
  swings: number;
  braces: number;
}

/**
 * A fingerprint of the offer on screen, or '' when nothing is waiting for an answer. Read straight
 * off the DOM: a locator would wait for the panel that has just unmounted, and the answer that
 * clears an offer is exactly the moment it disappears.
 */
async function offerFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const box = document.querySelector('.pending-choice');
    if (!box) return '';
    const labels = Array.from(box.querySelectorAll('[aria-label]')).map((node) =>
      (node.getAttribute('aria-label') ?? '').slice(0, 24),
    );
    return `${box.querySelectorAll('.delve-choice').length} ${labels.join('|')}`;
  });
}

/**
 * Answer every offer the run puts up, until it stops asking. One answer is not enough: a win holds
 * its boon pick until the player takes it, so the room's settlement raises a question of its own
 * after the last round, and a step that lands in an event asks before it moves.
 */
export async function answerChoices(page: Page): Promise<void> {
  for (let offer = 0; offer < 6; offer += 1) {
    const before = await offerFingerprint(page);
    if (before === '') return;
    await page.locator('.pending-choice .delve-choice').first().click();
    await expect
      .poll(() => offerFingerprint(page), `the answer to "${before}" to land`)
      .not.toBe(before);
  }
  expect(await offerFingerprint(page), 'the run keeps raising offers').toBe('');
}

async function stepsTaken(page: Page): Promise<number> {
  const text = await visibleText(page, '.stat-grid');
  return Number(text.match(/(\d+) steps/)?.[1] ?? Number.NaN);
}

/**
 * The open room's round, or 0 when no room waits. One DOM read rather than a locator call: a
 * locator waits for its element to attach, and the panel unmounting as the room ends would leave
 * the read pending for the rest of the test.
 */
export async function turnRound(page: Page): Promise<number> {
  return page.evaluate(() => {
    const panel = document.querySelector('.turn-panel');
    return panel ? Number(panel.getAttribute('data-round')) || 0 : 0;
  });
}

/**
 * ── Walking the command windows ─────────────────────────────────────────────────────────────
 *
 * Since the reskin the room asks its question one window at a time: the four commands, then a
 * move, then a target. The hand opens the same windows a player does and reads each window's own
 * printed numbers; nothing here re-derives a price the screen did not show.
 */

/** Which window each root command opens. */
const WINDOW_OF = {
  skills: 'moves',
  strike: 'targets',
  guard: 'guard',
  items: 'items',
} as const;

type Command = keyof typeof WINDOW_OF;

function panelView(page: Page): Promise<string> {
  return page
    .locator('.turn-panel')
    .getAttribute('data-view')
    .then((view) => view ?? '');
}

async function openWindow(page: Page, command: Command): Promise<void> {
  await page.locator(`.turn-panel[data-view="root"] [data-kind="${command}"]`).click();
  await expect(page.locator('.turn-panel')).toHaveAttribute('data-view', WINDOW_OF[command]);
}

/** B out of every open window, in the same round. Committing an order resets to the root itself. */
async function backOut(page: Page): Promise<void> {
  for (let step = 0; step < 3 && (await panelView(page)) !== 'root'; step += 1) {
    await page.locator('.turn-panel [data-kind="back"]').click();
  }
  await expect(page.locator('.turn-panel')).toHaveAttribute('data-view', 'root');
}

/** A row of the open window, as the DOM carries it. */
interface RowRead {
  /** The move a row belongs to; null on the strike's target rows. */
  skill: string | null;
  target: number;
  label: string;
  disabled: boolean;
}

function readRows(page: Page): Promise<RowRead[]> {
  return page.locator('.turn-panel .battle-row').evaluateAll((nodes) =>
    nodes.map((node) => {
      const button = node as HTMLButtonElement;
      const labels = Array.from(button.querySelectorAll('[aria-label]')).map(
        (element) => element.getAttribute('aria-label') ?? '',
      );
      return {
        skill: button.dataset.skill ?? null,
        target: Number(button.dataset.target ?? -1),
        label: [button.getAttribute('aria-label') ?? '', ...labels].join(' '),
        disabled: button.disabled,
      };
    }),
  );
}

/** One priced swing the open room offers: a move (or the free strike) aimed at one enemy. */
interface Swing {
  skill: string | null;
  target: number;
  likely: number;
  kills: boolean;
}

function swingOf(row: RowRead, skill: string | null): Swing {
  return {
    skill,
    target: row.target,
    likely: Number(/likely (\d+)/.exec(row.label)?.[1] ?? 0),
    kills: /(^|\D)0 HP after/.test(row.label),
  };
}

/** The living companion's HP, printed on the ally plate's own bar. */
async function readHp(page: Page): Promise<number> {
  const label = await page.locator('.battle-plate.ally .hp-bar').getAttribute('aria-label');
  return Number(/(\d+)\/\d+ HP/.exec(label ?? '')?.[1] ?? 0);
}

/**
 * What the open menu is offering this round, read the way a player reads it: `likely` and `0 HP
 * after` are the printed price and the printed kill, and the Brace row prints the incoming total it
 * would halve. Leaves the first ready move's target window open, so the chosen row is one click
 * away; the strike window when the moveset is empty.
 */
async function readTurn(page: Page): Promise<{ swings: Swing[]; hp: number; incoming: number }> {
  const hp = await readHp(page);

  await openWindow(page, 'guard');
  const brace = await page.locator('.turn-panel [data-kind="guard"]').getAttribute('aria-label');
  const incoming = Number(/Brace: (\d+) damage/.exec(brace ?? '')?.[1] ?? 0);
  await backOut(page);

  await openWindow(page, 'skills');
  const move = (await readRows(page)).find((row) => row.skill !== null && !row.disabled);
  if (move) {
    await page.locator(`.turn-panel [data-skill="${move.skill}"]`).click();
    await expect(page.locator('.turn-panel')).toHaveAttribute('data-view', 'targets');
    const rows = await readRows(page);
    return { swings: rows.map((row) => swingOf(row, move.skill)), hp, incoming };
  }

  await backOut(page);
  await openWindow(page, 'strike');
  const rows = await readRows(page);
  return { swings: rows.map((row) => swingOf(row, null)), hp, incoming };
}

/**
 * The play a readable room invites: finish anything the swing can finish, brace when the round's
 * incoming damage would kill the run, and otherwise take the largest printed number.
 */
function pickTurn(offer: Awaited<ReturnType<typeof readTurn>>): Swing | 'brace' {
  const byLikely = (a: Swing, b: Swing) => b.likely - a.likely;
  const kill = offer.swings.filter((swing) => swing.kills).sort(byLikely)[0];
  if (kill) return kill;
  if (offer.incoming >= offer.hp) return 'brace';
  return [...offer.swings].sort(byLikely)[0] ?? 'brace';
}

/**
 * Answer the open room round by round until it finishes, and report what the hand actually pressed.
 * A menu that stops advancing without closing is a failure, not a slow room.
 */
export async function resolveTurn(page: Page): Promise<Played> {
  const played: Played = { swings: 0, braces: 0 };
  for (let round = 0; round < 40; round += 1) {
    const shown = await turnRound(page);
    if (shown === 0) return played;
    // Committing an order reopens the next round at the root; a menu still in a window is a bug.
    await expect(page.locator('.turn-panel')).toHaveAttribute('data-view', 'root');
    const play = pickTurn(await readTurn(page));
    if (play === 'brace') {
      await backOut(page);
      await openWindow(page, 'guard');
      await page.locator('.turn-panel [data-kind="guard"]').click();
      played.braces += 1;
    } else {
      await page.locator(`.turn-panel [data-target="${play.target}"]`).click();
      played.swings += 1;
    }
    await expect
      .poll(async () => {
        const now = await turnRound(page);
        return now === 0 || now > shown ? 'moved' : 'held';
      }, `round ${shown} to resolve`)
      .not.toBe('held');
  }
  await expect(page.locator('.turn-panel'), 'the room finished inside its round cap').toHaveCount(
    0,
  );
  return played;
}

/**
 * Open one room, wait for its write to land, and clear whatever it put on screen: a choice, a room
 * waiting for orders, or nothing. The step counter only moves on a committed step, so it is the
 * signal that the button's work is done rather than the button's fleeting disabled state. The run
 * ending on this step is its own answer — the summary replaces the room, so no counter moves.
 */
export async function advance(page: Page, played?: Played): Promise<void> {
  const step = page.getByRole('button', { name: /Open the next room|Answer the choice first/ });
  await expect(step).toBeEnabled();
  const before = await stepsTaken(page);
  await step.click();
  await expect
    .poll(async () => {
      if (
        await page
          .locator('.ended-panel')
          .isVisible()
          .catch(() => false)
      )
        return 'ended';
      if (
        await page
          .locator('.turn-panel')
          .isVisible()
          .catch(() => false)
      )
        return 'turn';
      if (
        await page
          .locator('.pending-choice .delve-choice')
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        return 'choice';
      }
      const now = await stepsTaken(page);
      return Number.isFinite(now) && now > before ? 'moved' : 'waiting';
    }, 'the step to land')
    .not.toBe('waiting');
  await answerChoices(page);
  const room = await resolveTurn(page);
  if (played) {
    played.swings += room.swings;
    played.braces += room.braces;
  }
  await answerChoices(page);
}

/**
 * Walk until the room *ahead* is a fight, where the readout prices it before the player commits.
 * Which room comes first is the floor plan's business, not the test's; each room behind us is
 * played out by hand before the next one is priced.
 */
export async function walkToFight(page: Page): Promise<void> {
  for (let room = 0; room < 6; room += 1) {
    if (
      await page
        .locator('.delve-readout')
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;
    await advance(page);
  }
  await expect(
    page.locator('.delve-readout').first(),
    'a combat room within six steps',
  ).toBeVisible();
}

/**
 * Freezes the two things that make the same screen unrepeatable: the wall clock (dates, the oil
 * trickle, "resets in") and freshly minted ids, because a run's floor plan is hashed from the
 * companion id. Goldens need both or they drift at local midnight and on every new book.
 */
export async function pinClockAndIds(page: Page, at = '2026-10-25T09:00:00'): Promise<void> {
  await page.clock.setFixedTime(new Date(at));
  await page.addInitScript(() => {
    let counter = 0;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => `7d4a11e0-5a3e-4b0a-9c1d-${String(counter++).padStart(12, '0')}`,
    });
  });
}
