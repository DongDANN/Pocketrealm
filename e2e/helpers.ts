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
 * What the open menu is offering this round, read the way a player reads it: the panel's own numbers.
 * `likely` and `0 HP after` are the printed price and the printed kill, and the Brace row prints the
 * incoming total it would halve.
 */
interface TurnOffer {
  /** Index into every `.turn-target` in the panel, so the read and the click name one button. */
  target: number;
  likely: number;
  kills: boolean;
  ready: boolean;
}

async function readTurn(
  page: Page,
): Promise<{ offers: TurnOffer[]; hp: number; incoming: number }> {
  return page.evaluate(() => {
    const panel = document.querySelector('.turn-panel');
    if (!panel) return { offers: [], hp: 0, incoming: 0 };
    const copy = (root: Element) =>
      Array.from(root.querySelectorAll('[aria-label]'))
        .map((node) => node.getAttribute('aria-label') ?? '')
        .join(' ');
    const offers = Array.from(panel.querySelectorAll<HTMLButtonElement>('.turn-target')).map(
      (button, target) => {
        const kind = button.closest('.turn-action')?.getAttribute('data-kind');
        const label = button.getAttribute('aria-label') ?? '';
        return {
          target,
          likely: Number(/likely (\d+)/.exec(label)?.[1] ?? 0),
          kills: /(^|\D)0 HP after/.test(copy(button)),
          // Item options are always rendered and always disabled until the action has rules.
          ready: kind !== 'item' && !button.disabled,
        };
      },
    );
    const stats = panel.querySelector('.stat-grid');
    const brace = panel.querySelector('[data-kind="guard"] button');
    return {
      offers,
      hp: Number(/(\d+)\/\d+ HP/.exec(stats ? copy(stats) : '')?.[1] ?? 0),
      incoming: Number(
        /Brace: (\d+) damage/.exec(brace?.getAttribute('aria-label') ?? '')?.[1] ?? 0,
      ),
    };
  });
}

/**
 * The play a readable panel invites: finish anything the swing can finish, brace when the round's
 * incoming damage would kill the run, and otherwise take the largest printed number.
 */
function pickTurn(offer: Awaited<ReturnType<typeof readTurn>>): { brace: boolean; target: number } {
  const live = offer.offers.filter((o) => o.ready);
  const best = (list: TurnOffer[]) => list.sort((a, b) => b.likely - a.likely)[0];
  const kill = best(live.filter((o) => o.kills));
  if (kill) return { brace: false, target: kill.target };
  if (offer.incoming >= offer.hp) return { brace: true, target: -1 };
  const swing = best(live);
  return swing ? { brace: false, target: swing.target } : { brace: true, target: -1 };
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
    const play = pickTurn(await readTurn(page));
    if (play.brace) {
      await page.locator('.turn-panel [data-kind="guard"] button').click();
      played.braces += 1;
    } else {
      await page.locator('.turn-panel .turn-target').nth(play.target).click();
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
