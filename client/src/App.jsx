import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import HeroPage from './pages/HeroPage';
import SearchView from './views/SearchView';
import AboutPage from './pages/AboutPage';
import MoodboardPanel from './components/MoodboardPanel';
import ExploreBanner from './components/ExploreBanner';

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isExplore = location.pathname === '/explore';
  const isAbout = location.pathname === '/about';
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
      // On explore, header appears after the banner scrolls away (~320px)
      const threshold = isExplore ? 320 : window.innerHeight * 0.85;
      setScrolled(window.scrollY > threshold);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isExplore]);

  const showHeader = isAbout || scrolled;

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
        <div className="app-header__inner">
          <div className="app-header__side" />
          <Link
            to={isExplore ? '/explore' : '/'}
            className="app-logo--sticky-link"
            onClick={isExplore ? () => window.scrollTo({ top: 0, behavior: 'smooth' }) : undefined}
          >
            <img src="/logo2.svg" alt="Moodboard Museum" className="app-logo--sticky" />
          </Link>
          <div className="app-header__side app-header__side--right" />
        </div>
      </header>

      <Routes>
        <Route path="/" element={<HeroPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route
          path="/explore"
          element={
            <>
              <ExploreBanner />
              <SearchView
                onAddToMoodboard={handleAdd}
                moodboard={moodboard}
                onTitleChange={setPanelTitle}
              />
              <footer className="app-footer">
                Moodboard Museum is designed for aesthetic inspiration, not historical research. Search terms may result in inappropriate or irrelevant images. For more on this project, visit the <Link to="/about" className="app-footer__link">About page</Link>. For more context on the art, follow image links to museum websites directly.
              </footer>
            </>
          }
        />
      </Routes>

      {isExplore && !panelOpen && (
        <div className="fab-stack">
          <button
            className="fab-img-btn"
            aria-label={`Open moodboard, ${moodboard.length} items`}
            onClick={() => setPanelOpen(true)}
          >
            <img src="/btn-moodboard.svg" alt="My Moodboard" className="fab-img-btn__img" />
            {moodboard.length > 0 && (
              <span className="moodboard-btn__badge">{moodboard.length}</span>
            )}
          </button>
        </div>
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
