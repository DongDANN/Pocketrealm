import { useEffect, useState } from 'react';
import { lanternMark } from '../art/brand';
import { PixelImage } from './components/PixelImage';
import { useOnline } from './hooks/useOnline';
import { subscribePwa, reloadForUpdate, type PwaState } from '../pwa/register';

const brand = lanternMark(32);

export function App() {
  const online = useOnline();
  const [pwa, setPwa] = useState<PwaState>({ offlineReady: false, needRefresh: false });

  useEffect(() => subscribePwa(setPwa), []);

  return (
    <main className="shell foundation">
      <section className="title-panel panel" aria-labelledby="app-title">
        <PixelImage pixmap={brand} scale={6} alt="A lantern glowing over a small floating island" />
        <h1 id="app-title" className="title">
          Pocketrealm
        </h1>
        <p className="lede">A calm budget companion, offline by design.</p>
        <p className="muted">Foundation build — the realm is being drawn.</p>
        <ul className="foundation-list" aria-label="Build status">
          <li>Strict TypeScript, tests and production build</li>
          <li>Installable PWA with an offline app shell</li>
          <li>No accounts, no trackers, no network requests with your data</li>
        </ul>
        {pwa.needRefresh && (
          <button type="button" className="pixel-button" onClick={() => reloadForUpdate()}>
            Update available — reload
          </button>
        )}
      </section>
      {!online && (
        <p className="offline-strip" role="status">
          Working offline. Everything is saved on this device.
        </p>
      )}
    </main>
  );
}
