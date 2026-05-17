import { useState } from 'react';
import SearchView from './views/SearchView';
import MoodboardPanel from './components/MoodboardPanel';

export default function App() {
  const [moodboard, setMoodboard] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState('My Moodboard');

  function handleAdd(artwork) {
    setMoodboard((prev) =>
      prev.some((a) => a.object_id === artwork.object_id) ? prev : [...prev, artwork]
    );
  }

  function handleRemove(objectId) {
    setMoodboard((prev) => prev.filter((a) => a.object_id !== objectId));
  }

  function handleReorder(newOrder) {
    setMoodboard(newOrder);
  }

  return (
    <div className="app">
      <header className="app-header">
        <img src="/logo1.png" alt="Moodboard Museum" className="app-logo" />
      </header>
      {!panelOpen && (
        <div
          className="mobile-moodboard-bar"
          role="button"
          tabIndex={0}
          aria-label={`Open moodboard, ${moodboard.length} items`}
          onClick={() => setPanelOpen(true)}
          onKeyDown={(e) => e.key === 'Enter' && setPanelOpen(true)}
        >
          <span className="mobile-moodboard-bar__label">My Moodboard</span>
          {moodboard.length > 0 && (
            <span className="moodboard-btn__badge">{moodboard.length}</span>
          )}
        </div>
      )}
      <SearchView
        onAddToMoodboard={handleAdd}
        moodboard={moodboard}
        onTitleChange={setPanelTitle}
      />
      <footer className="app-footer">
        Moodboard Museum is designed for aesthetic inspiration, not historical research. The Met&rsquo;s collection spans 5,000 years of human history — and a vibe-based search tool has a responsibility to think carefully about what it surfaces and in what context. For historical research or the full breadth of the collection, visit{' '}
        <a href="https://metmuseum.org" target="_blank" rel="noopener noreferrer">metmuseum.org</a> directly.
      </footer>
      <MoodboardPanel
        artworks={moodboard}
        onRemove={handleRemove}
        onReorder={handleReorder}
        onClose={() => setPanelOpen(false)}
        isOpen={panelOpen}
        title={panelTitle}
        onTitleChange={setPanelTitle}
      />
    </div>
  );
}
