import { NavLink, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/explore', label: 'Archive', glyph: '✦' },
  { to: '/saved',   label: 'Saved',   glyph: '◊' },
  { to: '/about',   label: 'About',   glyph: '§' },
];

export default function MobileTabBar({ savedCount = 0 }) {
  const location = useLocation();

  // Hide on hero page
  if (location.pathname === '/') return null;

  return (
    <nav className="mobile-tabs" aria-label="Main navigation">
      {tabs.map(({ to, label, glyph }) => {
        const displayLabel = to === '/saved' && savedCount > 0
          ? `Saved · ${savedCount}`
          : label;

        return (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `mobile-tab${isActive ? ' mobile-tab--active' : ''}`
            }
            aria-current={location.pathname === to ? 'page' : undefined}
          >
            <span className="mobile-tab__glyph">{glyph}</span>
            <span className="mobile-tab__label">{displayLabel}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
