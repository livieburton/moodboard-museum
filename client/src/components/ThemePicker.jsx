export default function ThemePicker({ themes, activeSlug, onSelect }) {
  if (themes.length === 0) return null;

  return (
    <nav className="theme-picker" aria-label="Browse by theme">
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
