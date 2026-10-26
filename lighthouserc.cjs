const fs = require('node:fs');

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const chromePath = candidates.find((candidate) => fs.existsSync(candidate));

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run build && node scripts/serve-vercel.mjs',
      startServerReadyPattern: 'Serving dist with vercel.json',
      startServerReadyTimeout: 120000,
      url: ['http://127.0.0.1:4174/', 'http://127.0.0.1:4174/add'],
      puppeteerScript: 'scripts/lighthouse-onboard.cjs',
      ...(chromePath ? { chromePath } : {}),
      puppeteerLaunchOptions: { args: ['--no-sandbox'] },
      numberOfRuns: 1,
      settings: {
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
      },
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:performance': ['warn', { minScore: 0.8 }],
        'resource-summary:script:size': ['warn', { maxNumericValue: 700000 }],
        'resource-summary:total:size': ['warn', { maxNumericValue: 2500000 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
};
