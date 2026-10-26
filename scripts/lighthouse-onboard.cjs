/**
 * Lighthouse has no PWA category any more, so the run has to audit the real Today screen rather
 * than the onboarding gate. This seeds a book once in the shared Chrome profile; later URLs in the
 * same run already have one and are left alone.
 */
module.exports = async (browser, context) => {
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  try {
    const origin = new URL(context.url).origin;
    await page.goto(`${origin}/onboarding`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="Monthly income"]') ||
        document.querySelector('nav[aria-label="Main"]'),
    );

    if (await page.$('input[aria-label="Monthly income"]')) {
      await page.click('input[aria-label="Monthly income"]');
      await page.type('input[aria-label="Monthly income"]', '25000', { delay: 10 });
      await page.waitForFunction(() => {
        const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
          [candidate.getAttribute('aria-label')]
            .concat(
              Array.from(candidate.querySelectorAll('[aria-label]')).map((node) =>
                node.getAttribute('aria-label'),
              ),
            )
            .some((label) => label && label.toLowerCase().includes('open my book')),
        );
        return button instanceof HTMLButtonElement && !button.disabled;
      });
      await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
          [candidate.getAttribute('aria-label')]
            .concat(
              Array.from(candidate.querySelectorAll('[aria-label]')).map((node) =>
                node.getAttribute('aria-label'),
              ),
            )
            .some((label) => label && label.toLowerCase().includes('open my book')),
        );
        if (button instanceof HTMLElement) button.click();
      });
      await page.waitForFunction(() => location.pathname !== '/onboarding');
    }

    await page.waitForSelector('nav[aria-label="Main"]', { visible: true });
    await page.waitForFunction(() => document.querySelectorAll('main canvas').length > 0);
    await new Promise((resolve) => setTimeout(resolve, 800));
  } finally {
    await page.close();
  }
};
