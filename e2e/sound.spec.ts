import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, nav, startRun } from './helpers';

/**
 * Two promises the sound layer makes to a player: nothing is downloaded (the soundtrack is score
 * data synthesized on the device) and nothing is armed before a touch. Both are measured from
 * outside the app — requests seen, and AudioContext constructions counted before the app can see
 * them — so a future change that streams a file or autoplays breaks here rather than at a desk.
 */

const contextCount = (page: Page) =>
  page.evaluate(() => (window as Window & { __audioContexts?: number }).__audioContexts ?? -1);

async function watchAudio(page: Page): Promise<string[]> {
  const problems: string[] = [];
  await page.addInitScript(() => {
    const scope = window as Window & { __audioContexts?: number };
    scope.__audioContexts = 0;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    class CountedAudioContext extends Ctor {
      constructor() {
        super();
        scope.__audioContexts = (scope.__audioContexts ?? 0) + 1;
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: CountedAudioContext,
    });
  });
  page.on('request', (request) => {
    if (/\.(mp3|ogg|wav|m4a|aac|opus|flac)(\?|$)/i.test(request.url())) {
      problems.push(`audio file requested: ${request.url()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      problems.push(`console: ${message.text()}`);
    }
  });
  return problems;
}

async function openSettings(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Settings', exact: true }),
  ).toBeVisible();
}

test('a fresh book stays silent: no audio files, no AudioContext, no gesture listeners', async ({
  page,
}) => {
  const problems = await watchAudio(page);
  await completeOnboarding(page, { income: '12000' });
  await nav(page).getByRole('link', { name: 'Envelopes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Jars' })).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // A press on the thumb bar is a gesture the engine could have answered; it never does unsaid.
  await page.waitForTimeout(300);

  expect(await contextCount(page)).toBe(0);
  expect(problems).toEqual([]);
});

test('turning sound on offers levels, keeps one context, and waits for the next touch', async ({
  page,
}) => {
  const problems = await watchAudio(page);
  await completeOnboarding(page, { income: '12000' });
  await openSettings(page);

  await page.getByRole('button', { name: 'Sound off' }).click();
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const label of ['Master volume', 'Music volume', 'Effects volume']) {
    await expect(page.getByRole('slider', { name: label })).toBeVisible();
  }
  // The click that enabled audio is itself the gesture, so the engine exists exactly once — a
  // beat later, because the switch writes the book before it dares to make noise.
  await expect.poll(() => contextCount(page)).toBe(1);

  await page.getByRole('slider', { name: 'Music volume' }).fill('20');
  await page.getByRole('button', { name: 'Test sound' }).click();
  await expect.poll(() => contextCount(page)).toBe(1);

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A reload mutes the book: the setting survived, the audio did not, and no touch has happened yet.
  expect(await contextCount(page)).toBe(0);

  await page.getByRole('button', { name: 'Test sound' }).click();
  await expect.poll(() => contextCount(page)).toBe(1);
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(problems).toEqual([]);
});

test('the Delve asks for its theme without opening a second audio context', async ({ page }) => {
  const problems = await watchAudio(page);
  await completeOnboarding(page, { income: '12000' });
  await openSettings(page);
  await page.getByRole('button', { name: 'Sound off' }).click();
  await expect.poll(() => contextCount(page)).toBe(1);

  await startRun(page);
  const step = page.getByRole('button', { name: /Open the next room|Answer the choice first/ });
  await expect(step).toBeVisible();
  await step.click();
  await expect(page.getByRole('heading', { name: 'Run log' })).toBeVisible();

  expect(await contextCount(page)).toBe(1);
  expect(problems).toEqual([]);
});
