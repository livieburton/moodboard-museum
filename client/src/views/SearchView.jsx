import { useState, useEffect, useRef } from 'react';
import ThemePicker from '../components/ThemePicker';
import ArtworkCard from '../components/ArtworkCard';
import { listThemes, queryTheme, searchFreeText } from '../api';

export default function SearchView({ onAddToMoodboard, moodboard = [] }) {
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
    if (!q || searchInFlight.current) return;
    searchInFlight.current = true;
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
    <main className="search-view">
      <form className="search-form" onSubmit={handleSearch}>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder={
            typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
              ? 'Search an aesthetic…'
              : "Describe an aesthetic — 'steampunk', 'witchy botanicals', '1970s sci-fi'…"
          }
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          maxLength={200}
          disabled={loading}
        />
        <button className="search-button" type="submit" disabled={loading || !searchInput.trim()}>
          {loading && !activeSlug ? 'Searching…' : 'Search'}
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
        <p className="state-message">Describe an aesthetic above, or pick a theme to explore the collection.</p>
      )}
    </main>
  );
}
