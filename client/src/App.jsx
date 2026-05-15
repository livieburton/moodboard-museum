import { useState } from 'react';
import SearchView from './views/SearchView';
import MoodboardPanel from './components/MoodboardPanel';

export default function App() {
  const [moodboard, setMoodboard] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);

  function handleAdd(artwork) {
    setMoodboard((prev) =>
      prev.some((a) => a.object_id === artwork.object_id) ? prev : [...prev, artwork]
    );
  }

  function handleRemove(objectId) {
    setMoodboard((prev) => prev.filter((a) => a.object_id !== objectId));
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__left">
          <h1>Moodboard Museum</h1>
          <p className="app-tagline">CC0 art from the Met, organized by aesthetic</p>
        </div>
        <button
          className="moodboard-btn"
          onClick={() => setPanelOpen(true)}
          aria-label={`Open moodboard, ${moodboard.length} items`}
        >
          My Moodboard
          {moodboard.length > 0 && (
            <span className="moodboard-btn__badge">{moodboard.length}</span>
          )}
        </button>
      </header>
      <SearchView onAddToMoodboard={handleAdd} moodboard={moodboard} />
      <footer className="app-footer">
        Moodboard Museum is designed for aesthetic inspiration, not historical research. The Met&rsquo;s collection spans 5,000 years of human history — and a vibe-based search tool has a responsibility to think carefully about what it surfaces and in what context. For historical research or the full breadth of the collection, visit{' '}
        <a href="https://metmuseum.org" target="_blank" rel="noopener noreferrer">metmuseum.org</a> directly.
      </footer>
      <MoodboardPanel
        artworks={moodboard}
        onRemove={handleRemove}
        onClose={() => setPanelOpen(false)}
        isOpen={panelOpen}
      />
    </div>
  );
}
