import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { completeOnboarding, nav, waitForOfflinePack } from './helpers';

/**
 * The preview server does not apply Vercel headers, so this suite starts the verifier that reads
 * vercel.json. A policy that breaks inline styles or the worker would fail here, not after deploy.
 */
test.describe('deployment policy', () => {
  test.use({ baseURL: 'http://127.0.0.1:4174' });

  let server: ChildProcess;

  test.beforeAll(async () => {
    server = spawn(process.execPath, ['scripts/serve-vercel.mjs'], {
      env: { ...process.env, PORT: '4174' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('vercel.json server did not start')), 15_000);
      server.stdout?.on('data', (chunk: Buffer) => {
        if (!chunk.toString().includes('Serving dist with vercel.json')) return;
        clearTimeout(timer);
        resolve();
      });
      server.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`vercel.json server exited early with ${code}`));
      });
    });
  });

  test.afterAll(() => {
    server?.kill();
  });

  test('serves the policy, cache rules and manifest type from vercel.json', async ({ page }) => {
    const response = await page.goto('/settings');
    expect(response?.status()).toBe(200);
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    expect(response?.headers()['permissions-policy']).toContain('camera=()');
    expect(response?.headers()['cache-control']).toBe('no-cache');

    const html = await (await page.request.get('http://127.0.0.1:4174/settings')).text();
    expect(html).toContain('<div id="root"></div>');
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain('src=');
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);

    const scriptSrc = /<script\b[^>]*src="([^"]+)"/i.exec(html)?.[1];
    expect(scriptSrc).toBeTruthy();
    const asset = await page.request.get(`http://127.0.0.1:4174${scriptSrc}`);
    expect(asset.headers()['cache-control']).toContain('immutable');

    const worker = await page.request.get('http://127.0.0.1:4174/sw.js');
    expect(worker.headers()['cache-control']).toBe('no-cache');

    const manifest = await page.request.get('http://127.0.0.1:4174/manifest.webmanifest');
    expect(manifest.headers()['content-type']).toBe('application/manifest+json');
    expect(manifest.headers()['cache-control']).toBe('no-cache');
  });

  test('makes no request outside this origin while the book is used', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!/^https?:/i.test(url)) return;
      if (new URL(url).origin !== 'http://127.0.0.1:4174') external.push(url);
    });

    await completeOnboarding(page);
    for (const route of ['/add', '/envelopes', '/history', '/settings', '/insights', '/delve']) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
    }

    expect(external).toEqual([]);
  });

  test('the production build boots, keeps inline styles and serves a cold launch offline', async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (/content security policy|refused to/i.test(message.text()))
        violations.push(message.text());
    });
    page.on('pageerror', (error) => {
      if (/content security policy|refused to/i.test(error.message)) violations.push(error.message);
    });

    await completeOnboarding(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
    await waitForOfflinePack(page);

    const inlineDisplay = await page
      .locator('.pixel-text')
      .first()
      .evaluate((element) => getComputedStyle(element).display);
    expect(inlineDisplay).toBe('flex');
    expect(await page.evaluate(() => Boolean(globalThis.navigator.serviceWorker.controller))).toBe(
      true,
    );
    expect(violations).toEqual([]);

    await page.context().setOffline(true);
    try {
      await page.reload();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Today', exact: true }),
      ).toBeVisible();
      await expect(nav(page)).toBeVisible();
      expect(violations).toEqual([]);
    } finally {
      await page.context().setOffline(false);
    }
  });
});
