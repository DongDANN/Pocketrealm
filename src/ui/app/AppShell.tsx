import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { C } from '../../art/palette';
import { reloadForUpdate, subscribePwa, type PwaState } from '../../pwa/register';
import { useSettings } from './hooks';
import { primeSoundFromGesture } from '../lib/sound';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { BottomNav } from '../components/BottomNav';

/**
 * The shared frame for every book screen: the page itself, the thumb bar and the "an update is ready"
 * prompt. Settings' motion preference becomes a document attribute so every animated surface can
 * honour it, not only the ones that read the setting directly.
 */
export function AppShell() {
  const settings = useSettings();
  const [pwa, setPwa] = useState<PwaState>({ offlineReady: false, needRefresh: false });

  useEffect(() => subscribePwa(setPwa), []);

  useEffect(() => {
    document.documentElement.dataset.motion = settings?.reducedMotion ?? 'system';
  }, [settings?.reducedMotion]);

  // A returning player who left sound on still has to touch the screen once: that is the browser's
  // rule, not ours. Until then this only arms a listener.
  useEffect(() => {
    primeSoundFromGesture(settings?.sound === true);
  }, [settings?.sound]);

  return (
    <>
      <Outlet />
      {pwa.needRefresh && (
        <PixelPanel className="update-banner" role="status" aria-labelledby="update-title">
          <p id="update-title" className="update-copy">
            <PixelText
              text="A new build is ready. Your book stays as it is."
              color={C.paper1}
              pixelScale={2}
              wrap={34}
            />
          </p>
          <PixelButton
            className="update-button"
            onClick={() => {
              void reloadForUpdate();
            }}
          >
            <PixelText text="Update and reload" color={C.ink900} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}
      <BottomNav />
    </>
  );
}
