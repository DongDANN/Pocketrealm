import { useEffect, useState } from 'react';

/** Chrome/Edge/Android expose this; Safari does not, hence the manual instructions. */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Captures the one install prompt a browser is willing to give. The event is stored rather than
 * shown automatically, so the install card only appears where the user is ready for it.
 */
export function useInstallPrompt(): {
  available: boolean;
  ios: boolean;
  prompt: () => Promise<void>;
} {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios] = useState(isIos);

  useEffect(() => {
    const onPrompt = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    available: event !== null,
    ios,
    async prompt() {
      if (!event) return;
      await event.prompt();
      await event.userChoice;
      setEvent(null);
    },
  };
}
