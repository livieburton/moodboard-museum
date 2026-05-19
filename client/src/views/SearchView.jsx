import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ThemePicker from '../components/ThemePicker';
import ArtworkCard from '../components/ArtworkCard';
import { listThemes, queryTheme, searchFreeText, searchByColor } from '../api';

const COLOR_DEBOUNCE_MS = 400;

const CURATED_COLORS = [
  { label: 'Espresso',        hex: '#4B2F27' },
  { label: 'Burgundy',        hex: '#800020' },
  { label: 'Terracotta',      hex: '#E2725B' },
  { label: 'Marigold',        hex: '#FFC83D' },
  { label: 'Matcha',          hex: '#93B85A' },
  { label: 'Emerald',         hex: '#00674F' },
  { label: 'Turquoise',       hex: '#40E0D0' },
  { label: 'Cobalt',          hex: '#0047AB' },
  { label: 'Eggplant',        hex: '#614051' },
  { label: 'Lavender',        hex: '#B57EDC' },
  { label: 'Millennial Pink', hex: '#F4C2C2' },
  { label: 'Cream',           hex: '#F5EBD8' },
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
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [hexError, setHexError] = useState(false);
  const [displayCount, setDisplayCount] = useState(48);
  const inputRef = useRef(null);
  const nativeColorRef = useRef(null);
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
    setDisplayCount(48);
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

  async function handleSearch(e, directQuery) {
    if (e && e.preventDefault) e.preventDefault();
    const q = (directQuery !== undefined ? directQuery : searchInput).trim();
    if (!q || loading || searchInFlight.current) return;
    searchInFlight.current = true;
    if (onTitleChange) onTitleChange(q);
    setActiveSlug(null);
    setLoading(true);
    setError(null);
    setResults(null);
    setMatchReason('');
    setResultColorHex(null);
    setDisplayCount(48);
    try {
      const data = await searchFreeText(q);
      setResults(data.results);
      setMatchReason(data.matchReason);
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
    setDisplayCount(48);
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
    setColorPickerOpen(false);
    setHexInput('');
    setHexError(false);
    await runColorSearch(hex, label);
  }

  function handleNativeColorChange(e) {
    const hex = e.target.value;
    setHexInput(hex);
    setHexError(false);
    setPickedColor(hex);
    setActiveCuratedHex(null);
    clearTimeout(colorDebounceRef.current);
    colorDebounceRef.current = setTimeout(() => runColorSearch(hex), COLOR_DEBOUNCE_MS);
  }

  function handleHexInput(e) {
    const raw = e.target.value;
    setHexInput(raw);
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      setHexError(false);
      setPickedColor(normalized);
      setActiveCuratedHex(null);
      clearTimeout(colorDebounceRef.current);
      colorDebounceRef.current = setTimeout(() => runColorSearch(normalized), COLOR_DEBOUNCE_MS);
    } else {
      setHexError(raw.length > 0);
    }
  }

  function handleClear() {
    setResults(null);
    setMatchReason('');
    setError(null);
    setActiveSlug(null);
    setResultColorHex(null);
    setSearchInput('');
    setColorTextInput('');
    setActiveCuratedHex(null);
    setDisplayCount(48);
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
    setColorPickerOpen(false);
    setHexInput('');
    setHexError(false);
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
        <form className="search-row" onSubmit={handleSearch}>
          <span className="search-row__label">Search</span>
          <div className="search-row__divider" aria-hidden="true" />
          <input
            ref={inputRef}
            className="search-row__input"
            type="text"
            placeholder="Rainy day, Hamlet, summer picnic, cozy interiors, big city, steampunk, art nouveau..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={200}
            disabled={loading}
          />
          <button className="search-row__button" type="submit" disabled={loading} aria-label={loading && !activeSlug ? 'Searching' : 'Search'}>
            {loading && !activeSlug ? 'Searching…' : 'Search'}
          </button>
        </form>
      ) : (
        <div className="color-search-section">
          <form className="search-row" onSubmit={handleColorTextSearch}>
            <span className="search-row__label">Search</span>
            <div className="search-row__divider" aria-hidden="true" />
            <input
              className="search-row__input"
              type="text"
              placeholder="Marigold, charcoal, lavender, taupe, chartreuse, periwinkle…"
              value={colorTextInput}
              onChange={(e) => setColorTextInput(e.target.value)}
              maxLength={100}
              disabled={loading}
            />
            <button className="search-row__button" type="submit" disabled={loading} aria-label="Search by color name">
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>
          <div className="color-swatches">
            {CURATED_COLORS.map(({ label, hex }) => (
              <button
                key={hex}
                className={`color-swatch${activeCuratedHex === hex ? ' is-active' : ''}`}
                onClick={() => handleCuratedColorClick(hex, label)}
                title={label}
              >
                <span className="color-swatch__disc" style={{ background: hex }} />
                <span className="color-swatch__label">{label}</span>
              </button>
            ))}
            <button className="color-swatch color-swatch--custom" onClick={() => setColorPickerOpen(!colorPickerOpen)}>
              <span className="color-swatch__disc color-swatch__disc--rainbow" />
              <span className="mm-smallcaps">Custom</span>
            </button>
          </div>
          {colorPickerOpen && (
            <div className="color-picker-inline">
              <div className="color-picker-swatch-wrapper">
                <div
                  className="color-picker-swatch"
                  style={{ background: hexInput === '' ? '#B5A48C' : pickedColor }}
                />
                <input
                  ref={nativeColorRef}
                  type="color"
                  className="color-picker-native"
                  value={hexInput === '' ? '#B5A48C' : pickedColor}
                  onChange={handleNativeColorChange}
                  disabled={loading}
                  aria-label="Pick a color"
                  title="Click to open color picker or eyedropper"
                />
              </div>
              <input
                type="text"
                className={`color-picker-hex-input${hexError ? ' error' : ''}`}
                placeholder="#B5A48C"
                value={hexInput}
                onChange={handleHexInput}
                maxLength={7}
                spellCheck={false}
                autoFocus
                disabled={loading}
              />
              <button
                className="color-picker-cancel"
                onClick={() => { setColorPickerOpen(false); setHexInput(''); setHexError(false); }}
                aria-label="Close color picker"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {(results !== null || error) && !loading && (
        <button className="clear-search" onClick={handleClear}>
          ← Browse curated collections
        </button>
      )}

      {loading && (
        <>
          <div className="loading-bar">
            <span className="loading-bar__pulse" />
            <span className="mm-smallcaps mm-smallcaps--accent">Reading the archive…</span>
            <p className="loading-bar__sub">translating your aesthetic into filters — classifications, tags, date ranges.</p>
          </div>
          <div className="results-grid">
            {[0.7, 1.1, 0.85, 0.9, 1.2, 0.75, 1.0, 0.95, 0.7, 1.15, 0.8, 0.9].map((r, i) => (
              <div key={i} className="artwork-card artwork-card--skeleton">
                <div className="mm-shimmer" style={{ aspectRatio: `1/${r}` }} />
                <div className="artwork-card__rule" />
                <div className="artwork-card__body">
                  <div className="mm-shimmer mm-shimmer--text" style={{ width: '78%' }} />
                  <div className="mm-shimmer mm-shimmer--text" style={{ width: '52%', marginTop: 10, height: 9 }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="state-message error">Something went wrong: {error}</p>}

      {!loading && results !== null && (
        <>
          {matchReason && (
            <div className="match-reason">
              {resultColorHex && (
                <span
                  className="match-reason-swatch"
                  style={{ background: resultColorHex, width: 18, height: 18, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.1)', display: 'inline-block', flexShrink: 0 }}
                  aria-hidden="true"
                />
              )}
              <span className="mm-smallcaps mm-smallcaps--wide mm-smallcaps--accent">Matched on ·</span>
              <p className="match-reason__text">{matchReason}</p>
              <span className="match-reason__count">{results.length} artworks</span>
            </div>
          )}
          {results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__mark">—</div>
              <h2 className="empty-state__title">No artworks match yet.</h2>
              <p className="empty-state__body">
                The archive is wide but not infinite. Try a softer word, an era, or a feeling —
                <em> "autumnal," "moonlit," "overgrown."</em>
              </p>
              <div className="empty-state__chips">
                {['autumnal', 'moonlit', 'overgrown', 'candlelit'].map((s) => (
                  <button key={s} className="empty-chip" onClick={() => { setSearchInput(s); handleSearch(null, s); }}>
                    "{s}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="results-grid">
                {results.slice(0, displayCount).map((artwork) => (
                  <ArtworkCard
                      key={artwork.object_id}
                      artwork={artwork}
                      onAdd={onAddToMoodboard}
                      isAdded={moodboard.some((a) => a.object_id === artwork.object_id)}
                    />
                ))}
              </div>
              {displayCount < results.length && (
                <div className="show-more">
                  <button className="show-more__btn" onClick={() => setDisplayCount((n) => n + 48)}>
                    Show more — {results.length - displayCount} remaining
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {!loading && results === null && !error && !colorMode && (
        <div className="explore-idle">
          <div className="explore-idle__rail">
            <span className="mm-smallcaps mm-smallcaps--wide mm-smallcaps--accent">§ I  ·  Begin</span>
            <h2 className="explore-idle__heading">
              Search an <em>aesthetic.</em>
            </h2>
            <p className="explore-idle__sub">
              Type any mood, era, or vibe. Or pick a curated collection.
            </p>
          </div>
          {!colorMode && (
            <div className="explore-idle__main">
              <span className="mm-smallcaps">Curated collections</span>
              <ThemePicker themes={themes} activeSlug={activeSlug} onSelect={handleSelectTheme} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
