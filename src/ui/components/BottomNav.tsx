import { NavLink } from 'react-router-dom';
import { C } from '../../art/palette';
import { PixelText } from './PixelText';

const LINKS = [
  { to: '/', label: 'Today', icon: 'coin', end: true },
  { to: '/envelopes', label: 'Jars', ariaLabel: 'Envelopes', icon: 'jars' },
  { to: '/add', label: 'Add', icon: 'plus', primary: true },
  { to: '/goals', label: 'Goals', icon: 'spark' },
  { to: '/history', label: 'Log', ariaLabel: 'History and transactions', icon: 'clock' },
] as const;

/** Five thumbs-sized slots; Add sits in the middle because it is the one action worth reaching for. */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={'end' in link ? link.end : false}
          aria-label={'ariaLabel' in link ? link.ariaLabel : link.label}
          className={({ isActive }) =>
            ['nav-slot', 'primary' in link && link.primary ? 'nav-add' : '', isActive ? 'on' : '']
              .filter(Boolean)
              .join(' ')
          }
        >
          <img
            className="nav-icon"
            src={`/ui/ui-icon-${link.icon}.png`}
            width={26}
            height={26}
            alt=""
          />
          <PixelText
            text={link.label}
            color={'primary' in link && link.primary ? C.ink900 : C.paper2}
            pixelScale={2}
          />
        </NavLink>
      ))}
    </nav>
  );
}
