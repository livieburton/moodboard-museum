import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import HeroPage from './pages/HeroPage';
import SearchView from './views/SearchView';
import AboutPage from './pages/AboutPage';
import SavedPage from './pages/SavedPage';
import MoodboardPanel from './components/MoodboardPanel';
import MobileTabBar from './components/MobileTabBar';
import ExploreBanner from './components/ExploreBanner';
import useIsMobile from './hooks/useIsMobile';

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isExplore = location.pathname === '/explore';
  const isAbout = location.pathname === '/about';
  const isMobile = useIsMobile();

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

  const isHero = location.pathname === '/';

  return (
    <div className="app">
      {/* Mobile logo bar — all pages except hero */}
      {isMobile && !isHero && (
        <header className="mobile-header">
          <Link to="/" className="mobile-header__link">
            <img src="/logo2.svg" alt="Moodboard Museum" className="mobile-header__logo" />
          </Link>
        </header>
      )}

      {/* Sticky header — desktop only (hidden on mobile via CSS) */}
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
          path="/saved"
          element={
            <SavedPage
              moodboard={moodboard}
              onRemove={handleRemove}
              onReorder={handleReorder}
              panelTitle={panelTitle}
              onTitleChange={setPanelTitle}
            />
          }
        />
        <Route
          path="/explore"
          element={
            <>
              <ExploreBanner moodboard={moodboard} onOpenMoodboard={() => setPanelOpen(true)} />
              <SearchView
                onAddToMoodboard={handleAdd}
                moodboard={moodboard}
                onTitleChange={setPanelTitle}
              />
              <footer className="app-footer">
                <span className="mm-smallcaps mm-smallcaps--wide mm-smallcaps--accent">
                  — A note from the curators —
                </span>
                <p>
                  Moodboard Museum is designed for aesthetic inspiration, not historical research.
                  Search terms may result in inappropriate or irrelevant images. For more on this project,
                  visit the <Link to="/about" className="app-footer__link">About page</Link>. For more
                  context on the art, follow image links to museum websites directly.
                </p>
              </footer>
            </>
          }
        />
      </Routes>

      {/* FAB stack — desktop only */}
      {!isMobile && isExplore && !panelOpen && (
        <div className="fab-stack">
          <button
            className="fab-moodboard-btn"
            aria-label={`Open moodboard, ${moodboard.length} items`}
            onClick={() => setPanelOpen(true)}
          >
            My Moodboard
            {moodboard.length > 0 && (
              <span className="moodboard-btn__badge">{moodboard.length}</span>
            )}
          </button>
          <Link to="/about" className="fab-about-btn">
            About
          </Link>
        </div>
      )}

      {/* Moodboard slide-out panel — desktop only */}
      {!isMobile && (
        <MoodboardPanel
          artworks={moodboard}
          onRemove={handleRemove}
          onReorder={handleReorder}
          onClose={() => setPanelOpen(false)}
          isOpen={panelOpen}
          title={panelTitle}
          onTitleChange={setPanelTitle}
        />
      )}

      {/* Bottom tab bar — mobile only */}
      {isMobile && <MobileTabBar savedCount={moodboard.length} />}
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
