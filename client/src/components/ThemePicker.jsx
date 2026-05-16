import { useRef, useEffect } from 'react';

export default function ThemePicker({ themes, activeSlug, onSelect }) {
  const navRef = useRef(null);

  useEffect(() => {
    if (!navRef.current || !activeSlug) return;
    const active = navRef.current.querySelector('.theme-pill.active');
    active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeSlug]);

  if (themes.length === 0) return null;

  return (
    <nav ref={navRef} className="theme-picker" aria-label="Browse by theme">
      {themes.map((theme) => (
        <button
          key={theme.slug}
          className={`theme-pill${theme.slug === activeSlug ? ' active' : ''}`}
          onClick={() => onSelect(theme.slug)}
          title={theme.description || undefined}
        >
          {theme.label}
        </button>
      ))}
    </nav>
  );
}
