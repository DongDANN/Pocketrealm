/**
 * Installed means "launched without the browser chrome", not "a shortcut exists". iOS exposes this
 * as navigator.standalone; everyone else answers through the display-mode media query.
 */
export function standaloneFrom(input: {
  iosStandalone: boolean | undefined;
  mediaStandalone: boolean;
}): boolean {
  return input.iosStandalone === true || input.mediaStandalone;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  const mediaStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return standaloneFrom({ iosStandalone, mediaStandalone });
}

/** Chrome on iOS is still iOS: the Share sheet is the only install path there. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
