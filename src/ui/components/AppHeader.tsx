import { Link } from 'react-router-dom';
import { C } from '../../art/palette';
import { PixelText } from './PixelText';

interface Props {
  title: string;
  backTo?: string;
  backLabel?: string;
  settings?: boolean;
}

/** The one line at the top of every screen: where you are, a way back, and the way to Settings. */
export function AppHeader({ title, backTo, backLabel = 'Back', settings = true }: Props) {
  return (
    <header className="app-header">
      <div className="app-header-side">
        {backTo ? (
          <Link className="header-link" to={backTo} aria-label={backLabel}>
            <img className="ui-icon" src="/ui/ui-icon-arrow.png" width={18} height={18} alt="" />
            <span className="header-back-label">
              <PixelText text={backLabel} color={C.amber2} pixelScale={2} />
            </span>
          </Link>
        ) : (
          <Link className="header-link" to="/" aria-label="Pocketrealm home">
            <img className="ui-icon" src="/ui/ui-icon-coin.png" width={18} height={18} alt="" />
            <span className="header-home-label">
              <PixelText text="Pocketrealm" color={C.paper3} pixelScale={2} />
            </span>
          </Link>
        )}
      </div>
      <h1 className="app-header-title">
        <PixelText text={title} color={C.paper0} pixelScale={3} wrap={18} />
      </h1>
      <div className="app-header-side right">
        {settings && (
          <Link className="icon-button" to="/settings" aria-label="Settings">
            <img className="ui-icon" src="/ui/ui-icon-gear.png" width={26} height={26} alt="" />
          </Link>
        )}
      </div>
    </header>
  );
}
