import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import HeroPage from './pages/HeroPage';
import SearchView from './views/SearchView';
import MoodboardPanel from './components/MoodboardPanel';

function AppShell() {
  const location = useLocation();
  const isExplore = location.pathname === '/explore';
  const [moodboard, setMoodboard] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState('My Moodboard');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setScrolled(false);
  }, [location.pathname]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > window.innerHeight * 0.85);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const showHeader = isExplore || scrolled;

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
      <header className={`app-header${showHeader ? ' app-header--visible' : ''}`}>
        <img src="/logo2.png" alt="Moodboard Museum" className="app-logo--sticky" />
      </header>

      <Routes>
        <Route path="/" element={<HeroPage />} />
        <Route
          path="/explore"
          element={
            <>
              <SearchView
                onAddToMoodboard={handleAdd}
                moodboard={moodboard}
                onTitleChange={setPanelTitle}
              />
              <footer className="app-footer">
                Moodboard Museum is designed for aesthetic inspiration, not historical research. The Met&rsquo;s collection spans 5,000 years of human history — and a vibe-based search tool has a responsibility to think carefully about what it surfaces and in what context. For historical research or the full breadth of the collection, visit{' '}
                <a href="https://metmuseum.org" target="_blank" rel="noopener noreferrer">metmuseum.org</a> directly.
              </footer>
            </>
          }
        />
      </Routes>

      {!panelOpen && (
        <button
          className="moodboard-fab"
          aria-label={`Open moodboard, ${moodboard.length} items`}
          onClick={() => setPanelOpen(true)}
        >
          My Moodboard
          {moodboard.length > 0 && (
            <span className="moodboard-btn__badge">{moodboard.length}</span>
          )}
        </button>
      )}

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

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
