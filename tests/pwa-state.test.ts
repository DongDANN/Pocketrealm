import { describe, expect, it } from 'vitest';
import { standaloneFrom } from '../src/pwa/display';
import { shouldPrepareOfflinePack } from '../src/pwa/offlinePack';

describe('offline pack state', () => {
  it('prepares only on a production build with a worker and no controller yet', () => {
    expect(
      shouldPrepareOfflinePack({ production: true, hasServiceWorker: true, hasController: false }),
    ).toBe(true);
  });

  it('has nothing to prepare on a later visit', () => {
    expect(
      shouldPrepareOfflinePack({ production: true, hasServiceWorker: true, hasController: true }),
    ).toBe(false);
  });

  it('stays quiet in dev and where service workers do not exist', () => {
    expect(
      shouldPrepareOfflinePack({ production: false, hasServiceWorker: true, hasController: false }),
    ).toBe(false);
    expect(
      shouldPrepareOfflinePack({ production: true, hasServiceWorker: false, hasController: false }),
    ).toBe(false);
  });
});

describe('standalone detection', () => {
  it('accepts the iOS navigator flag or the display-mode query', () => {
    expect(standaloneFrom({ iosStandalone: true, mediaStandalone: false })).toBe(true);
    expect(standaloneFrom({ iosStandalone: false, mediaStandalone: true })).toBe(true);
    expect(standaloneFrom({ iosStandalone: undefined, mediaStandalone: true })).toBe(true);
  });

  it('does not mistake a browser tab for an installed app', () => {
    expect(standaloneFrom({ iosStandalone: false, mediaStandalone: false })).toBe(false);
    expect(standaloneFrom({ iosStandalone: undefined, mediaStandalone: false })).toBe(false);
  });
});
