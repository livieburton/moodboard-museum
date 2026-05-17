import { useState, useEffect } from 'react';
import SearchView from './views/SearchView';
import MoodboardPanel from './components/MoodboardPanel';

function HeroMosaic() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch('/api/random?limit=20')
      .then((r) => r.json())
      .then((data) => {
        const artworks = (data.results || []).filter(
          (a) => a.primary_image_small || a.primary_image
        );
        // Duplicate for seamless infinite loop
        setItems([...artworks, ...artworks]);
      })
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="hero-mosaic">
      <div className="hero-mosaic__track">
        {items.map((artwork, i) => (
          <img
            key={i}
            src={artwork.primary_image_small || artwork.primary_image}
            alt=""
            className="hero-mosaic__img"
            loading="eager"
          />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [moodboard, setMoodboard] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState('My Moodboard');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > window.innerHeight * 0.85);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  function scrollToSearch(e) {
    e.preventDefault();
    document.getElementById('search').scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="app">
      {/* Sticky header — hidden in hero, fades in after scrolling past it */}
      <header className={`app-header${scrolled ? ' app-header--visible' : ''}`}>
        <img src="/logo2.png" alt="Moodboard Museum" className="app-logo--sticky" />
      </header>

      {/* Full-height hero landing section */}
      <section className="hero">
        <img src="/logo1.png" alt="Moodboard Museum" className="hero__logo" />
        <p className="hero__intro">
          The world's great museums have made thousands of artworks freely available. Moodboard Museum makes them searchable by aesthetic — so your next moodboard is built from real art, not generated images.
        </p>
        <HeroMosaic />
        <a href="#search" className="hero__cta" onClick={scrollToSearch}>
          Start exploring →
        </a>
      </section>

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
