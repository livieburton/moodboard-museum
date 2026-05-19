import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ThemePicker from '../components/ThemePicker';
import ArtworkCard from '../components/ArtworkCard';
import { listThemes, queryTheme, searchFreeText, searchByColor } from '../api';

const COLOR_DEBOUNCE_MS = 400;

// Rainbow order: dark warm → red → orange → yellow → green → blue → purple → pink → light
const CURATED_COLORS = [
  { label: 'Espresso',        hex: '#4B2F27' },
  { label: 'Burgundy',        hex: '#800020' },
  { label: 'Terracotta',      hex: '#E2725B' },
  { label: 'Gen Z Yellow',    hex: '#FFE227' },
  { label: 'Matcha',          hex: '#93B85A' },
  { label: 'Emerald Green',   hex: '#00674f' },
  { label: 'Turquoise',       hex: '#40E0D0' },
  { label: 'Cobalt',          hex: '#0047AB' },
  { label: 'Eggplant',        hex: '#614051' },
  { label: 'Millennial Pink', hex: '#F4C2C2' },
  { label: 'Cream',           hex: '#FFFDD0' },
];

function getTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#3d2b1f' : '#fff';
}

export default function SearchView({ onAddToMoodboard, moodboard = [], onTitleChange }) {
  const [themes, setThemes] = useState([]);
  const [activeSlug, setActiveSlug] = useState(null);
  const [results, setResults] = useState(null);
  const [matchReason, setMatchReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [colorMode, setColorMode] = useState(false);
  const [pickedColor, setPickedColor] = useState('#c97b3a');
  const [colorTextInput, setColorTextInput] = useState('');
  const [activeCuratedHex, setActiveCuratedHex] = useState(null);
  const [resultColorHex, setResultColorHex] = useState(null);
  const inputRef = useRef(null);
  const colorInputRef = useRef(null);
  const searchInFlight = useRef(false);
  const colorDebounceRef = useRef(null);
  const colorSearchInFlight = useRef(false);

  useEffect(() => {
    listThemes()
      .then(setThemes)
      .catch((err) => console.error('Failed to load themes:', err));
  }, []);

  async function handleSelectTheme(slug) {
    const theme = themes.find((t) => t.slug === slug);
    if (theme && onTitleChange) onTitleChange(theme.label);
    setActiveSlug(slug);
    setSearchInput('');
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await queryTheme(slug);
      setResults(data.results);
      setMatchReason(data.matchReason);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q || loading || searchInFlight.current) return;
    searchInFlight.current = true;
    if (onTitleChange) onTitleChange(q);
    setActiveSlug(null);
    setLoading(true);
    setError(null);
    setResults(null);
    setMatchReason('');
    setResultColorHex(null);
    try {
      const data = await searchFreeText(q);
      setResults(data.results);
      setMatchReason(data.matchReason);
      setResultColorHex(data.colorHex || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      searchInFlight.current = false;
    }
  }

  async function runColorSearch(hex, name) {
    if (colorSearchInFlight.current) return;
    colorSearchInFlight.current = true;
    if (onTitleChange) onTitleChange(name || hex.toUpperCase());
    setActiveSlug(null);
    setLoading(true);
    setError(null);
    setResults(null);
    setMatchReason('');
    try {
      const data = await searchByColor(hex);
      setResults(data.results);
      setMatchReason(data.matchReason);
      setResultColorHex(hex);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      colorSearchInFlight.current = false;
    }
  }

  async function handleColorTextSearch(e) {
    e.preventDefault();
    const q = colorTextInput.trim();
    if (!q || loading) return;
    if (onTitleChange) onTitleChange(q);
    setActiveSlug(null);
    setLoading(true);
    setError(null);
    setResults(null);
    setMatchReason('');
    setResultColorHex(null);
    setActiveCuratedHex(null);
    setPickedColor('#c97b3a');
    try {
      const data = await searchFreeText(q, { colorMode: true });
      setResults(data.results);
      setMatchReason(data.matchReason);
      if (data.colorHex) {
        setPickedColor(data.colorHex);
        setResultColorHex(data.colorHex);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCuratedColorClick(hex, label) {
    setActiveCuratedHex(hex);
    setPickedColor(hex);
    setColorTextInput('');
    await runColorSearch(hex, label);
  }

  function handleColorChange(e) {
    const hex = e.target.value;
    setPickedColor(hex);
    setColorTextInput('');
    setActiveCuratedHex(null);
    clearTimeout(colorDebounceRef.current);
    colorDebounceRef.current = setTimeout(() => runColorSearch(hex), COLOR_DEBOUNCE_MS);
  }

  function handleToggleColorMode() {
    const next = !colorMode;
    setColorMode(next);
    setResults(null);
    setError(null);
    setMatchReason('');
    setActiveSlug(null);
    setResultColorHex(null);
    setColorTextInput('');
    setActiveCuratedHex(null);
    if (next) {
      setTimeout(() => colorInputRef.current?.focus(), 50);
    }
  }

  return (
    <main className="search-view" id="search">
      <div className="search-top-bar">
        <div className="search-mode-toggle">
          <button
            className={`search-mode-btn${!colorMode ? ' active' : ''}`}
            onClick={() => colorMode && handleToggleColorMode()}
            aria-pressed={!colorMode}
          >
            Search by keyword
          </button>
          <button
            className={`search-mode-btn${colorMode ? ' active' : ''}`}
            onClick={() => !colorMode && handleToggleColorMode()}
            aria-pressed={colorMode}
          >
            Search by color
          </button>
        </div>
      </div>

      {!colorMode ? (
        <form className="search-form" onSubmit={handleSearch}>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Rainy day, Hamlet, summer picnic, cozy interiors, big city, steampunk, art nouveau..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={200}
            disabled={loading}
          />
          <button className="search-button" type="submit" disabled={loading} aria-label={loading && !activeSlug ? 'Searching' : 'Search'}>
            {loading && !activeSlug ? 'Searching…' : 'Search'}
          </button>
        </form>
      ) : (
        <div className="color-search-section">
          <form className="search-form" onSubmit={handleColorTextSearch}>
            <input
              ref={colorInputRef}
              className="search-input"
              type="text"
              placeholder="Tomato red, marigold, charcoal, lavender, taupe, chartreuse, periwinkle…"
              value={colorTextInput}
              onChange={(e) => setColorTextInput(e.target.value)}
              maxLength={100}
              disabled={loading}
            />
            <button className="search-button" type="submit" disabled={loading || !colorTextInput.trim()} aria-label="Search by color name">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>
          <div className="color-pill-picker">
            {CURATED_COLORS.map(({ label, hex, bg }) => (
              <button
                key={label}
                className={`color-pill${activeCuratedHex === hex ? ' active' : ''}`}
                style={{ background: bg || hex, color: getTextColor(hex) }}
                onClick={() => handleCuratedColorClick(hex, label)}
                title={label}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="color-picker-row">
            <span className="color-picker-label">Or pick a color:</span>
            <input
              id="color-picker"
              className="color-picker-input"
              type="color"
              value={pickedColor}
              onChange={handleColorChange}
              disabled={loading}
              aria-label="Pick a color to search artworks"
            />
            <span className="color-picker-hex">{pickedColor.toUpperCase()}</span>
          </div>
        </div>
      )}

      {!colorMode && <ThemePicker themes={themes} activeSlug={activeSlug} onSelect={handleSelectTheme} />}

      {loading && <p className="state-message">Loading…</p>}

      {error && <p className="state-message error">Something went wrong: {error}</p>}

      {!loading && results !== null && (
        <>
          {matchReason && (
            <p className="match-reason-bar">
              {resultColorHex && (
                <span
                  className="match-reason-swatch"
                  style={{ background: resultColorHex }}
                  aria-hidden="true"
                />
              )}
              {matchReason}
            </p>
          )}
          {results.length === 0 ? (
            <p className="state-message">
              No matching artworks with images yet — check back as the collection grows.
            </p>
          ) : (
            <div className="results-grid">
              {results.map((artwork) => (
                <ArtworkCard
                    key={artwork.object_id}
                    artwork={artwork}
                    onAdd={onAddToMoodboard}
                    isAdded={moodboard.some((a) => a.object_id === artwork.object_id)}
                  />
              ))}
            </div>
          )}
        </>
      )}

      {!loading && results === null && !error && (
        <div className="idle-state">
          <p className="state-message state-message--idle">Search an aesthetic. Build a moodboard. Get inspired.</p>
        </div>
      )}
    </main>
  );
}
