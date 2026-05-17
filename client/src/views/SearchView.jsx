import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ThemePicker from '../components/ThemePicker';
import ArtworkCard from '../components/ArtworkCard';
import { listThemes, queryTheme, searchFreeText } from '../api';

export default function SearchView({ onAddToMoodboard, moodboard = [], onTitleChange }) {
  const [themes, setThemes] = useState([]);
  const [activeSlug, setActiveSlug] = useState(null);
  const [results, setResults] = useState(null);
  const [matchReason, setMatchReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const inputRef = useRef(null);
  const searchInFlight = useRef(false);

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

  return (
    <main className="search-view" id="search">
      <form className="search-form" onSubmit={handleSearch}>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Describe an aesthetic: steampunk, goth, sunny..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxLength={200}
          disabled={loading}
        />
        <button className="search-button search-button--img" type="submit" disabled={loading} aria-label={loading && !activeSlug ? 'Searching' : 'Search'}>
          {loading && !activeSlug
            ? <span className="search-button__loading">Searching…</span>
            : <img src="/btn-search.svg" alt="Search" className="search-button__img" />
          }
        </button>
      </form>

      <ThemePicker themes={themes} activeSlug={activeSlug} onSelect={handleSelectTheme} />

      {loading && <p className="state-message">Loading…</p>}

      {error && <p className="state-message error">Something went wrong: {error}</p>}

      {!loading && results !== null && (
        <>
          {matchReason && <p className="match-reason-bar">{matchReason}</p>}
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
          <p className="state-message state-message--idle">Search an aesthetic. Build a moodboard.</p>
          <Link to="/about" className="idle-about-btn">
            <img src="/btn-about.svg" alt="About" className="idle-about-btn__img" />
          </Link>
        </div>
      )}
    </main>
  );
}
