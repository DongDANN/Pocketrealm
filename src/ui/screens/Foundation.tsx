import { Link } from 'react-router-dom';
import { lanternMark } from '../../art/brand';
import { C } from '../../art/palette';
import { PixelImage } from '../components/PixelImage';
import { PixelText } from '../components/PixelText';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { reloadForUpdate } from '../../pwa/register';

const brand = lanternMark(32);

interface Props {
  needRefresh: boolean;
}

export function Foundation({ needRefresh }: Props) {
  const wide = useMediaQuery('(min-width: 520px)');
  return (
    <main className="shell foundation">
      <section className="title-panel panel" aria-labelledby="app-title">
        <PixelImage
          pixmap={brand}
          scale={wide ? 6 : 4}
          alt="A lantern glowing over a small floating island"
        />
        <h1 id="app-title" className="title">
          <PixelText text="Pocketrealm" color={C.paper0} pixelScale={wide ? 5 : 4} align="center" />
        </h1>
        <p className="lede">
          <PixelText
            text="A calm budget companion, offline by design."
            color={C.paper1}
            pixelScale={2}
            wrap={34}
            align="center"
          />
        </p>
        <p className="muted">
          <PixelText
            text="Foundation build · the realm is being drawn"
            color={C.paper3}
            pixelScale={2}
            wrap={34}
            align="center"
          />
        </p>
        <ul className="foundation-list" aria-label="Build status">
          <li>
            <PixelText
              text="Strict TypeScript, tests and production build"
              color={C.paper2}
              pixelScale={2}
              wrap={32}
            />
          </li>
          <li>
            <PixelText
              text="Installable PWA with an offline app shell"
              color={C.paper2}
              pixelScale={2}
              wrap={32}
            />
          </li>
          <li>
            <PixelText
              text="No accounts, no trackers, no network requests with your data"
              color={C.paper2}
              pixelScale={2}
              wrap={32}
            />
          </li>
        </ul>
        <div className="foundation-actions">
          <Link className="pixel-button link-button" to="/mock/today">
            <PixelText text="Open the Today mock" color={C.ink900} pixelScale={2} />
          </Link>
          <Link className="pixel-button secondary link-button" to="/art">
            <PixelText text="Watch the art move" color={C.paper0} pixelScale={2} />
          </Link>
        </div>
        {needRefresh && (
          <button type="button" className="pixel-button" onClick={() => reloadForUpdate()}>
            <PixelText text="Update available · reload" color={C.ink900} pixelScale={2} />
          </button>
        )}
      </section>
    </main>
  );
}
