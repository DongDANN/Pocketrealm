import { C } from '../../art/palette';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { PixelButton } from './PixelButton';
import { PixelPanel } from './PixelPanel';
import { PixelText } from './PixelText';

/**
 * The gentle install nudge. Chrome/Edge/Android hand us a real prompt; iOS has no such event, so the
 * card becomes the instructions Safari never shows. One dismissal is remembered for good; Settings
 * keeps a way back for anyone who changes their mind.
 */
export function InstallCard() {
  const install = useInstallPrompt();
  if (install.installed || install.dismissed) return null;
  if (!install.ios && !install.available) return null;

  const ios = install.ios;
  return (
    <PixelPanel className="install-card" aria-labelledby="install-card-title">
      <h2 id="install-card-title" className="panel-title">
        <PixelText
          text={ios ? 'Keep it on your home screen' : 'Keep it one tap away'}
          color={C.paper0}
          pixelScale={3}
          wrap={24}
        />
      </h2>
      <p>
        <PixelText
          text={
            ios
              ? "In the browser's Share menu, choose Add to Home Screen. It opens full screen and keeps its offline book."
              : 'Install Pocketrealm on this device. It opens without the browser and keeps the whole book offline.'
          }
          color={C.paper3}
          pixelScale={2}
          wrap={42}
        />
      </p>
      <div className="settings-actions">
        {!ios && (
          <PixelButton onClick={() => void install.prompt()}>
            <PixelText text="Install app" color={C.ink900} pixelScale={2} />
          </PixelButton>
        )}
        <PixelButton variant={ios ? 'primary' : 'secondary'} onClick={install.dismiss}>
          <PixelText
            text={ios ? 'Got it' : 'Not now'}
            color={ios ? C.ink900 : C.paper0}
            pixelScale={2}
          />
        </PixelButton>
      </div>
    </PixelPanel>
  );
}
